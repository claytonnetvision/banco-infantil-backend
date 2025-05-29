
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const desafiosRouter = require('./routes/desafios');
const { executarTarefasDiarias } = require('./Agendador');
const app = express();

// Configuração do CORS - Permitir todas as origens
app.use(cors());
app.use(express.json());

console.log('Iniciando o servidor backend...');

// Configurar diretório para uploads
const uploadDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Configuração do PostgreSQL com as credenciais do .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// Testar conexão com o banco
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', {
      message: err.message,
      code: err.code,
      detail: err.detail
    });
    process.exit(1);
  }
  try {
    await client.query('SET search_path TO banco_infantil');
    console.log('Conexão com o banco de dados estabelecida com sucesso');
  } catch (queryErr) {
    console.error('Erro ao definir search_path:', queryErr);
    process.exit(1);
  } finally {
    release();
  }
});

// Servir arquivos de upload
app.use('/Uploads', express.static(uploadDir));

// Usar router de desafios
console.log('Carregando rotas de desafios');
app.use('/desafios', desafiosRouter);

// Rota de teste
app.get('/health', (req, res) => {
  console.log('Requisição recebida em /health');
  res.status(200).json({ status: 'Servidor ativo' });
});

// Endpoint de cadastro (pai e criança)
app.post('/cadastro', async (req, res) => {
  console.log('Requisição recebida em /cadastro:', req.body);
  const { pai, filho } = req.body;
  let paiId;

  try {
    if (!pai || !pai.nome_completo || !pai.senha || !pai.telefone || !pai.cpf || !pai.email) {
      console.log('Dados do responsável incompletos');
      return res.status(400).json({ error: 'Dados do responsável incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const paiResult = await client.query(
        'INSERT INTO pais (nome_completo, senha, telefone, cpf, email) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
        [pai.nome_completo, pai.senha, pai.telefone, pai.cpf, pai.email]
      );
      paiId = paiResult.rows[0].id;
      console.log('Responsável cadastrado com ID:', paiId);

      // Criar conta para o responsável
      await client.query('INSERT INTO contas (pai_id, saldo) VALUES ($1, $2)', [paiId, 0.00]);

      let criancaData = null;
      if (filho && filho.nome_completo && filho.senha && filho.telefone && filho.email) {
        const filhoResult = await client.query(
          'INSERT INTO filhos (nome_completo, senha, telefone, email, pai_id, icone, chave_pix) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email',
          [filho.nome_completo, filho.senha, filho.telefone, filho.email, paiId, filho.icone || 'default.png', filho.email]
        );
        criancaData = filhoResult.rows[0];
        console.log('Criança cadastrada com ID:', criancaData.id);

        // Criar conta para a criança
        await client.query('INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)', [criancaData.id, 0.00]);
      }

      res.status(201).json({
        user: { id: paiId, email: paiResult.rows[0].email, tipo: 'pai' },
        crianca: criancaData,
        message: 'Cadastro realizado com sucesso!'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      console.log('Usuário já existe:', error.detail);
      return res.status(400).json({ error: 'Usuário já existe: CPF ou email já cadastrado' });
    }
    console.error('Erro no cadastro:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

// Endpoint de login
app.post('/login', async (req, res) => {
  console.log('Requisição recebida em /login:', req.body);
  const { email, senha } = req.body;
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SET search_path TO banco_infantil');
        let result = await client.query('SELECT id, email, \'pai\' as tipo FROM pais WHERE email = $1 AND senha = $2', [email, senha]);
        if (result.rows.length > 0) {
          console.log('Login bem-sucedido para responsável:', email);
          return res.json({ user: result.rows[0], message: 'Login bem-sucedido!' });
        }

        result = await client.query('SELECT id, email, \'filho\' as tipo, chave_pix FROM filhos WHERE email = $1 AND senha = $2', [email, senha]);
        if (result.rows.length > 0) {
          console.log('Login bem-sucedido para criança:', email);
          return res.json({ user: result.rows[0], message: 'Login bem-sucedido!' });
        }

        console.log('Falha no login para:', email);
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      } finally {
        client.release();
      }
    } catch (error) {
      attempt++;
      if (attempt === maxRetries) {
        console.error('Erro no login após tentativas:', error.stack);
        return res.status(500).json({ error: 'Erro ao fazer login' });
      }
      console.log(`Tentativa ${attempt} falhou, tentando novamente...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
});

// Endpoint para atualizar foto de perfil
app.post('/perfil/foto', upload.single('foto'), async (req, res) => {
  console.log('Requisição recebida em /perfil/foto');
  const { paiId } = req.body;
  const foto = req.file ? req.file.filename : null;

  try {
    if (!paiId || !foto) {
      return res.status(400).json({ error: 'ID do responsável ou foto ausente' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      await client.query('UPDATE pais SET foto_perfil = $1 WHERE id = $2', [foto, paiId]);
      res.status(200).json({ message: 'Foto de perfil atualizada com sucesso', foto });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar foto:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar foto' });
  }
});

// Endpoint para atualizar o ícone da criança
app.post('/update-icon/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /update-icon/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;
  const { icon } = req.body;

  try {
    if (!icon) {
      return res.status(400).json({ error: 'Ícone não fornecido' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE filhos SET icone = $1 WHERE id = $2 RETURNING icone', [icon, filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }

      res.status(200).json({ message: 'Ícone atualizado com sucesso', icone: result.rows[0].icone });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar ícone:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar ícone', details: error.message });
  }
});

// Endpoint para atualizar o fundo do perfil da criança
app.post('/update-background/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /update-background/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;
  const { background } = req.body;

  try {
    if (!background) {
      return res.status(400).json({ error: 'Fundo não fornecido' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE filhos SET background = $1 WHERE id = $2 RETURNING background', [background, filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }

      res.status(200).json({ message: 'Fundo atualizado com sucesso', background: result.rows[0].background });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar fundo:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar fundo', details: error.message });
  }
});

// Endpoint para consultar saldo do responsável
app.get('/conta/saldo/:paiId', async (req, res) => {
  console.log('Requisição recebida em /conta/saldo:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT saldo FROM contas WHERE pai_id = $1', [paiId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }
      res.status(200).json({ saldo: parseFloat(result.rows[0].saldo) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao consultar saldo:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar saldo', details: error.message });
  }
});

// Endpoint para consultar saldo da criança
app.get('/conta/saldo/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /conta/saldo/filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      res.status(200).json({ saldo: parseFloat(result.rows[0].saldo) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao consultar saldo da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar saldo', details: error.message });
  }
});

// Endpoint para listar crianças
app.get('/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /filhos, paiId:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT id, nome_completo, email, icone FROM filhos WHERE pai_id = $1', [paiId]);
      console.log('Crianças encontradas:', result.rows);
      res.status(200).json({ 
        filhos: result.rows,
        message: result.rows.length === 0 ? 'Nenhuma criança encontrada para este responsável.' : 'Crianças carregadas com sucesso.'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar crianças:', error.stack);
    res.status(500).json({ error: 'Erro ao listar crianças', details: error.message });
  }
});

// Endpoint de debug para listar crianças com detalhes
app.get('/debug/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /debug/filhos:', req.params.paiId);
  const { paiId } = req.params;
  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT id, nome_completo, email, icone, pai_id FROM filhos WHERE pai_id = $1', [paiId]);
      console.log('Crianças (debug):', result.rows);
      res.status(200).json({ filhos: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar crianças (debug):', error.stack);
    res.status(500).json({ error: 'Erro ao listar crianças', details: error.message });
  }
});

// Endpoint para cadastrar criança
app.post('/filho', async (req, res) => {
  console.log('Requisição recebida em /filho:', req.body);
  const { nome_completo, senha, telefone, email, pai_id, icone } = req.body;

  try {
    if (!nome_completo || !senha || !telefone || !email || !pai_id) {
      return res.status(400).json({ error: 'Dados da criança incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO filhos (nome_completo, senha, telefone, email, pai_id, icone, chave_pix) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email',
        [nome_completo, senha, telefone, email, pai_id, icone || 'default.png', email]
      );
      const filhoId = result.rows[0].id;

      // Criar conta para a criança
      await client.query('INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)', [filhoId, 0.00]);

      res.status(201).json({ filho: result.rows[0], message: 'Criança cadastrada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      console.log('Email da criança já existe:', error.detail);
      return res.status(400).json({ error: 'Email da criança já cadastrado' });
    }
    console.error('Erro ao cadastrar criança:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar criança', details: error.message });
  }
});

// Endpoint para adicionar saldo à conta do responsável
app.post('/conta/adicionar-saldo', async (req, res) => {
  console.log('Requisição recebida em /conta/adicionar-saldo:', req.body);
  const { pai_id, valor } = req.body;

  try {
    if (!pai_id || !valor || valor <= 0) {
      return res.status(400).json({ error: 'Dados inválidos: ID do responsável e valor são obrigatórios e valor deve ser maior que 0' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      // Adicionar saldo ao responsável
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);

      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'recebimento', valor, 'Adição de saldo pelo responsável', 'adicao_saldo']
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Saldo adicionado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar saldo:', error.stack);
    res.status(500).json({ error: 'Erro ao adicionar saldo', details: error.message });
  }
});

// Endpoint para transação (responsável)
app.post('/transacao', async (req, res) => {
  console.log('Requisição recebida em /transacao:', req.body);
  const { conta_id, tipo, valor, descricao } = req.body;

  try {
    if (!conta_id || !tipo || !valor || !['transferencia', 'recebimento'].includes(tipo)) {
      return res.status(400).json({ error: 'Dados da transação incompletos ou inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');
      const valorAtualizado = tipo === 'transferencia' ? -valor : valor;
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE id = $2', [valorAtualizado, conta_id]);
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [conta_id, tipo, valor, descricao, 'manual']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transação realizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transação:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transação', details: error.message });
  }
});

// Endpoint para transferência responsável -> criança
app.post('/transferencia', async (req, res) => {
  console.log('Requisição recebida em /transferencia:', req.body);
  const { pai_id, filho_id, valor, descricao } = req.body;

  try {
    if (!pai_id || !filho_id || !valor) {
      return res.status(400).json({ error: 'Dados da transferência incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      // Adicionar à criança
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valor, filho_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'transferencia', valor, descricao || `Transferência para criança ${filho_id}`, 'transferencia']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transferência realizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transferência:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência', details: error.message });
  }
});

// Endpoint para penalizar criança (remover dinheiro)
app.post('/penalizar', async (req, res) => {
  console.log('Requisição recebida em /penalizar:', req.body);
  const { pai_id, filho_id, valor, motivo } = req.body;

  try {
    if (!pai_id || !filho_id || !valor || !motivo) {
      return res.status(400).json({ error: 'Dados da penalidade incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar saldo da criança
      const contaFilhoResult = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [filho_id]);
      if (contaFilhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      const saldoFilho = parseFloat(contaFilhoResult.rows[0].saldo);

      if (saldoFilho < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente na criança para a penalidade' });
      }

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      // Deduzir da criança
      await client.query('UPDATE contas_filhos SET saldo = saldo - $1 WHERE filho_id = $2', [valor, filho_id]);
      // Adicionar ao responsável
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'penalidade', valor, `Penalidade para criança ${filho_id}: ${motivo}`, 'penalidade']
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você foi penalizado pelo seu responsável e perdeu R$ ${valor.toFixed(2)}. Motivo: ${motivo}`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Penalidade aplicada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na penalidade:', error.stack);
    res.status(500).json({ error: 'Erro ao aplicar penalidade', details: error.message });
  }
});

// Endpoint para listar notificações da criança
app.get('/notificacoes/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /notificacoes/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, mensagem, data_criacao FROM notificacoes WHERE filho_id = $1 ORDER BY data_criacao DESC LIMIT 10',
        [filhoId]
      );
      res.status(200).json({ notificacoes: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar notificações:', error.stack);
    res.status(500).json({ error: 'Erro ao listar notificações', details: error.message });
  }
});

// Endpoint para transferência externa via Pix
app.post('/transferencia/externa', async (req, res) => {
  console.log('Requisição recebida em /transferencia/externa:', req.body);
  const { pai_id, chave_pix, valor, descricao } = req.body;

  try {
    if (!pai_id || !chave_pix || !valor) {
      return res.status(400).json({ error: 'Dados da transferência incompleta: ID do responsável, chave PIX e valor são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'pix_externo', valor, descricao || `Pix para ${chave_pix}`, 'pix_externo']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Pix enviado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transferência externa:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência externa', details: error.message });
  }
});

// Endpoint para cadastrar tarefa
app.post('/tarefa', async (req, res) => {
  console.log('Requisição recebida em /tarefa:', req.body);
  const { filho_id, descricao, valor } = req.body;

  try {
    if (!filho_id || !descricao || valor === undefined) {
      return res.status(400).json({ error: 'Dados da tarefa incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [filho_id, descricao, valor, 'pendente']
      );
      res.status(201).json({ tarefa: result.rows[0], message: 'Tarefa cadastrada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao cadastrar tarefa:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar tarefa', details: error.message });
  }
});

// Endpoint para listar tarefas
app.get('/tarefas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /tarefas:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT id, descricao, status, valor FROM tarefas WHERE filho_id = $1', [filhoId]);
      res.status(200).json({
        tarefas: result.rows.map(tarefa => ({
          ...tarefa,
          valor: parseFloat(tarefa.valor)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar tarefas', details: error.message });
  }
});

// Endpoint para listar tarefas de todas as crianças
app.get('/tarefas/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /tarefas/filhos:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(`
        SELECT t.id, t.filho_id, t.descricao, t.valor, t.status, f.nome_completo
        FROM tarefas t
        JOIN filhos f ON t.filho_id = f.id
        WHERE f.pai_id = $1
        ORDER BY t.status, t.data_criacao DESC
      `, [paiId]);

      res.status(200).json({
        tarefas: result.rows.map(tarefa => ({
          ...tarefa,
          valor: parseFloat(tarefa.valor)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar tarefas', details: error.message });
  }
});

// Endpoint para aprovar tarefa
app.post('/tarefa/aprovar/:tarefaId', async (req, res) => {
  console.log('Requisição recebida em /tarefa/aprovar:', req.params.tarefaId);
  const { tarefaId } = req.params;
  const { pai_id, filho_id } = req.body;

  try {
    if (!pai_id || !filho_id) {
      return res.status(400).json({ error: 'ID do responsável e da criança são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar tarefa
      const tarefaResult = await client.query('SELECT valor, status FROM tarefas WHERE id = $1 AND filho_id = $2', [tarefaId, filho_id]);
      if (tarefaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }
      const tarefa = tarefaResult.rows[0];
      if (tarefa.status !== 'concluida_pelo_filho') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tarefa não está concluída pela criança' });
      }

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < tarefa.valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar a tarefa' });
      }

      // Atualizar status da tarefa
      await client.query('UPDATE tarefas SET status = $1 WHERE id = $2', ['aprovada', tarefaId]);

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [tarefa.valor, pai_id]);
      // Adicionar à criança
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [tarefa.valor, filho_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'transferencia', tarefa.valor, `Recompensa por tarefa ${tarefaId}`, 'tarefa']
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Sua tarefa foi aprovada! Você ganhou R$ ${tarefa.valor.toFixed(2)}.`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ transacao: result.rows[0], message: 'Tarefa aprovada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao aprovar tarefa:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar tarefa', details: error.message });
  }
});

// Endpoint para marcar tarefa como concluída
app.post('/tarefa/marcar-concluida/:tarefaId', async (req, res) => {
  console.log('Requisição recebida em /tarefa/marcar-concluida:', req.params.tarefaId);
  const { tarefaId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE tarefas SET status = $1 WHERE id = $2 RETURNING id', ['concluida_pelo_filho', tarefaId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }
      res.status(200).json({ message: 'Tarefa marcada como concluída!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao marcar tarefa como concluída:', error.stack);
    res.status(500).json({ error: 'Erro ao marcar tarefa', details: error.message });
  }
});

// Endpoint para configurar mesada
app.post('/mesada', async (req, res) => {
  console.log('Requisição recebida em /mesada:', req.body);
  const { pai_id, filho_id, valor, dia_semana } = req.body;

  try {
    if (!pai_id || !filho_id || !valor || valor <= 0 || !dia_semana) {
      return res.status(400).json({ error: 'Dados da mesada incompletos ou inválidos' });
    }

    const diasValidos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    if (!diasValidos.includes(dia_semana)) {
      return res.status(400).json({ error: 'Dia da semana inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se já existe mesada para a criança
      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE pai_id = $1 AND filho_id = $2',
        [pai_id, filho_id]
      );
      if (mesadaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma mesada configurada para esta criança' });
      }

      // Inserir mesada
      const result = await client.query(
        'INSERT INTO mesadas (pai_id, filho_id, valor, dia_semana, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [pai_id, filho_id, valor, dia_semana, true]
      );

      await client.query('COMMIT');
      res.status(201).json({ mesada: result.rows[0], message: 'Mesada configurada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao configurar mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao configurar mesada', details: error.message });
  }
});

// Endpoint para atualizar mesada
app.put('/mesada/:id', async (req, res) => {
  console.log('Requisição recebida em /mesada/:id (PUT):', req.params.id, req.body);
  const { id } = req.params;
  const { pai_id, filho_id, valor, dia_semana } = req.body;

  try {
    if (!pai_id || !filho_id || !valor || valor <= 0 || !dia_semana) {
      return res.status(400).json({ error: 'Dados da mesada incompletos ou inválidos' });
    }

    const diasValidos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    if (!diasValidos.includes(dia_semana)) {
      return res.status(400).json({ error: 'Dia da semana inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a mesada existe e pertence ao pai
      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, pai_id, filho_id]
      );
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada ou não pertence ao usuário' });
      }

      // Atualizar mesada
      const result = await client.query(
        'UPDATE mesadas SET valor = $1, dia_semana = $2, ativo = $3 WHERE id = $4 RETURNING id',
        [valor, dia_semana, true, id]
      );

      await client.query('COMMIT');
      res.status(200).json({ mesada: result.rows[0], message: 'Mesada atualizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar mesada', details: error.message });
  }
});

// Endpoint para excluir mesada
app.delete('/mesada/:id', async (req, res) => {
  console.log('Requisição recebida em /mesada/:id (DELETE):', req.params.id);
  const { id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a mesada existe
      const mesadaExistente = await client.query('SELECT id FROM mesadas WHERE id = $1', [id]);
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada' });
      }

      // Excluir mesada
      await client.query('DELETE FROM mesadas WHERE id = $1', [id]);

      await client.query('COMMIT');
      res.status(200).json({ message: 'Mesada excluída com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir mesada', details: error.message });
  }
});

// Endpoint para listar mesadas
app.get('/mesadas/:paiId', async (req, res) => {
  console.log('Requisição recebida em /mesadas:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT m.id, m.filho_id, m.valor::float, m.dia_semana, m.ativo, f.nome_completo FROM mesadas m JOIN filhos f ON m.filho_id = f.id WHERE m.pai_id = $1',
        [paiId]
      );
      res.status(200).json({ mesadas: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar mesadas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar mesadas', details: error.message });
  }
});

// Endpoint para histórico de transações do pai
app.get('/transacoes/historico/pai/:paiId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/historico/pai:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT t.id, t.conta_id, t.tipo, t.valor, t.descricao, t.data_criacao, t.origem, f.nome_completo
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         LEFT JOIN filhos f ON t.descricao LIKE '%' || f.id || '%'
         WHERE c.pai_id = $1
         ORDER BY t.data_criacao DESC
         LIMIT 50`,
        [paiId]
      );
      res.status(200).json({
        transacoes: result.rows.map(t => ({
          id: t.id,
          tipo: t.tipo,
          valor: parseFloat(t.valor),
          descricao: t.descricao,
          origem: t.origem,
          crianca_nome: t.nome_completo || 'N/A',
          data_criacao: t.data_criacao
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar transações do pai:', error.stack);
    res.status(500).json({ error: 'Erro ao listar transações', details: error.message });
  }
});

// Endpoint para histórico de transações da criança
app.get('/transacoes/historico/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/historico/filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT t.id, t.conta_id, t.tipo, t.valor, t.descricao, t.data_criacao, t.origem
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         JOIN filhos f ON f.pai_id = c.pai_id
         WHERE f.id = $1 AND t.descricao LIKE '%' || f.id || '%'
         ORDER BY t.data_criacao DESC
         LIMIT 50`,
        [filhoId]
      );
      res.status(200).json({
        transacoes: result.rows.map(t => ({
          id: t.id,
          tipo: t.tipo,
          valor: parseFloat(t.valor),
          descricao: t.descricao,
          origem: t.origem,
          data_criacao: t.data_criacao
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar transações da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao listar transações', details: error.message });
  }
});

// Endpoint para dados da criança
app.get('/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, nome_completo, email, icone, background, pai_id, chave_pix FROM filhos WHERE id = $1',
        [filhoId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      res.status(200).json({ filho: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar dados da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar dados da criança', details: error.message });
  }
});

// Endpoint para monitoramento
app.get('/monitoramento/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /monitoramento:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const tarefasResult = await client.query(
        `SELECT t.id, t.descricao, t.valor, t.data_criacao as data
         FROM tarefas t
         WHERE t.filho_id = $1 AND t.status = $2
         ORDER BY t.data_criacao DESC`,
        [filhoId, 'aprovada']
      );

      const transacoesResult = await client.query(
        `SELECT t.id, t.tipo, t.valor, t.descricao, t.data_criacao as data
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         JOIN filhos f ON f.pai_id = c.pai_id
         WHERE f.id = $1 AND t.descricao LIKE '%' || f.id || '%'
         ORDER BY t.data_criacao DESC`,
        [filhoId]
      );

      res.status(200).json({
        tarefas: tarefasResult.rows.map(t => ({ ...t, valor: parseFloat(t.valor) })),
        transacoes: transacoesResult.rows.map(t => ({ ...t, valor: parseFloat(t.valor) })),
        saques: [],
        uso_cartao: []
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar dados de monitoramento:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar dados de monitoramento', details: error.message });
  }
});

// Endpoint para transações de tarefas
app.get('/transacoes/tarefas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/tarefas:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT t.id, t.descricao, t.valor, t.data_criacao as data
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         JOIN filhos f ON f.pai_id = c.pai_id
         WHERE f.id = $1 AND t.origem = $2
         ORDER BY t.data_criacao DESC
         LIMIT 7`,
        [filhoId, 'tarefa']
      );
      const total = result.rows.reduce((sum, t) => sum + parseFloat(t.valor), 0);
      res.status(200).json({
        transacoes: result.rows.map(t => ({ ...t, valor: parseFloat(t.valor) })),
        total
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar transações de tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar transações', details: error.message });
  }
});

// Endpoint para total de tarefas do pai
app.get('/transacoes/tarefas/pai/:paiId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/tarefas/pai:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT COALESCE(SUM(t.valor), 0) as total
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         WHERE c.pai_id = $1 AND t.origem = $2`,
        [paiId, 'tarefa']
      );
      res.status(200).json({ total: parseFloat(result.rows[0].total) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao calcular total de tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao calcular total', details: error.message });
  }
});

// Iniciar servidor e agendador
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  // Iniciar tarefas diárias (desafios automáticos e mesadas)
  executarTarefasDiarias(pool);
});
