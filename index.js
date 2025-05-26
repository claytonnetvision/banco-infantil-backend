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

const app = express();
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
app.use('/uploads', express.static(uploadDir));

// Rota de teste
app.get('/health', (req, res) => {
  console.log('Requisição recebida em /health');
  res.status(200).json({ status: 'Servidor ativo' });
});

// Endpoint de cadastro (pai e filho)
app.post('/cadastro', async (req, res) => {
  console.log('Requisição recebida em /cadastro:', req.body);
  const { pai, filho } = req.body;
  let paiId;

  try {
    if (!pai || !pai.nome_completo || !pai.senha || !pai.telefone || !pai.cpf || !pai.email) {
      console.log('Dados do pai incompletos');
      return res.status(400).json({ error: 'Dados do pai incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const paiResult = await client.query(
        'INSERT INTO pais (nome_completo, senha, telefone, cpf, email) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
        [pai.nome_completo, pai.senha, pai.telefone, pai.cpf, pai.email]
      );
      paiId = paiResult.rows[0].id;
      console.log('Pai cadastrado com ID:', paiId);

      // Criar conta para o pai
      await client.query('INSERT INTO contas (pai_id, saldo) VALUES ($1, $2)', [paiId, 0.00]);

      let filhoData = null;
      if (filho && filho.nome_completo && filho.senha && filho.telefone && filho.email) {
        const filhoResult = await client.query(
          'INSERT INTO filhos (nome_completo, senha, telefone, email, pai_id, icone, chave_pix) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email',
          [filho.nome_completo, filho.senha, filho.telefone, filho.email, paiId, filho.icone || 'default.png', filho.email]
        );
        filhoData = filhoResult.rows[0];
        console.log('Filho cadastrado com ID:', filhoData.id);

        // Criar conta para o filho
        await client.query('INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)', [filhoData.id, 0.00]);
      }

      res.status(201).json({
        user: { id: paiId, email: paiResult.rows[0].email, tipo: 'pai' },
        filho: filhoData,
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
          console.log('Login bem-sucedido para pai:', email);
          return res.json({ user: result.rows[0], message: 'Login bem-sucedido!' });
        }

        result = await client.query('SELECT id, email, \'filho\' as tipo, chave_pix FROM filhos WHERE email = $1 AND senha = $2', [email, senha]);
        if (result.rows.length > 0) {
          console.log('Login bem-sucedido para filho:', email);
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
      return res.status(400).json({ error: 'ID do pai ou foto ausente' });
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

// Endpoint para atualizar o ícone do filho
app.post('/update-icon/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /update-icon/:filhoId');
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
        return res.status(404).json({ error: 'Filho não encontrado' });
      }

      res.status(200).json({ message: 'Ícone atualizado com sucesso', icone: result.rows[0].icone });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar ícone:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar ícone' });
  }
});

// Endpoint para atualizar o fundo do perfil do filho
app.post('/update-background/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /update-background/:filhoId');
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
        return res.status(404).json({ error: 'Filho não encontrado' });
      }

      res.status(200).json({ message: 'Fundo atualizado com sucesso', background: result.rows[0].background });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar fundo:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar fundo' });
  }
});

// Endpoint para consultar saldo do pai
app.get('/conta/saldo/:paiId', async (req, res) => {
  console.log('Requisição recebida em /conta/saldo');
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
    res.status(500).json({ error: 'Erro ao consultar saldo' });
  }
});

// Endpoint para consultar saldo do filho
app.get('/conta/saldo/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /conta/saldo/filho');
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta do filho não encontrada' });
      }
      res.status(200).json({ saldo: parseFloat(result.rows[0].saldo) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao consultar saldo do filho:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar saldo' });
  }
});

// Endpoint para listar filhos
app.get('/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /filhos');
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT id, nome_completo, email, icone FROM filhos WHERE pai_id = $1', [paiId]);
      res.status(200).json({ filhos: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar filhos:', error.stack);
    res.status(500).json({ error: 'Erro ao listar filhos' });
  }
});

// Endpoint para cadastrar filho
app.post('/filho', async (req, res) => {
  console.log('Requisição recebida em /filho:', req.body);
  const { nome_completo, senha, telefone, email, pai_id, icone } = req.body;

  try {
    if (!nome_completo || !senha || !telefone || !email || !pai_id) {
      return res.status(400).json({ error: 'Dados do filho incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO filhos (nome_completo, senha, telefone, email, pai_id, icone, chave_pix) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email',
        [nome_completo, senha, telefone, email, pai_id, icone || 'default.png', email]
      );
      const filhoId = result.rows[0].id;

      // Criar conta para o filho
      await client.query('INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)', [filhoId, 0.00]);

      res.status(201).json({ filho: result.rows[0], message: 'Filho cadastrado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      console.log('Email do filho já existe:', error.detail);
      return res.status(400).json({ error: 'Email do filho já cadastrado' });
    }
    console.error('Erro ao cadastrar filho:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar filho' });
  }
});

// Endpoint para adicionar saldo à conta do pai
app.post('/conta/adicionar-saldo', async (req, res) => {
  console.log('Requisição recebida em /conta/adicionar-saldo:', req.body);
  const { pai_id, valor } = req.body;

  try {
    if (!pai_id || !valor || valor <= 0) {
      return res.status(400).json({ error: 'Dados inválidos: pai_id e valor são obrigatórios e valor deve ser maior que 0' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do pai
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do pai não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      // Adicionar saldo ao pai
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);

      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4) RETURNING id',
        [contaId, 'recebimento', valor, 'Adição de saldo pelo pai']
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Saldo adicionado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar saldo:', error.stack);
    res.status(500).json({ error: 'Erro ao adicionar saldo' });
  }
});

// Endpoint para transação (pai)
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
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4) RETURNING id',
        [conta_id, tipo, valor, descricao]
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transação realizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transação:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transação' });
  }
});

// Endpoint para transferência pai -> filho
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

      // Buscar a conta do pai
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do pai não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      // Deduzir do pai
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      // Adicionar ao filho
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valor, filho_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4) RETURNING id',
        [contaId, 'transferencia', valor, descricao || `Transferência para filho ${filho_id}`]
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transferência realizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transferência:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência' });
  }
});

// Endpoint para penalizar filho (remover dinheiro)
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

      // Verificar saldo do filho
      const contaFilhoResult = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [filho_id]);
      if (contaFilhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do filho não encontrada' });
      }
      const saldoFilho = parseFloat(contaFilhoResult.rows[0].saldo);

      if (saldoFilho < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente no filho para a penalidade' });
      }

      // Buscar a conta do pai
      const contaPaiResult = await client.query('SELECT id FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do pai não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      // Deduzir do filho
      await client.query('UPDATE contas_filhos SET saldo = saldo - $1 WHERE filho_id = $2', [valor, filho_id]);
      // Adicionar ao pai
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4) RETURNING id',
        [contaId, 'penalidade', valor, `Penalidade para filho ${filho_id}: ${motivo}`]
      );

      // Adicionar notificação para o filho
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você foi penalizado pelo seu pai e perdeu R$ ${valor.toFixed(2)}. Motivo: ${motivo}`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Penalidade aplicada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na penalidade:', error.stack);
    res.status(500).json({ error: 'Erro ao aplicar penalidade' });
  }
});

// Endpoint para listar notificações do filho
app.get('/notificacoes/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /notificacoes/:filhoId');
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
    res.status(500).json({ error: 'Erro ao listar notificações' });
  }
});

// Endpoint para transferência externa via Pix
app.post('/transferencia/externa', async (req, res) => {
  console.log('Requisição recebida em /transferencia/externa:', req.body);
  const { pai_id, chave_pix, valor, descricao } = req.body;

  try {
    if (!pai_id || !chave_pix || !valor) {
      return res.status(400).json({ error: 'Dados da transferência incompleta: pai_id, chave_pix e valor são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do pai
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do pai não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      // Deduzir do pai
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4) RETURNING id',
        [contaId, 'pix_externo', valor, descricao || `Pix para ${chave_pix}`]
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Pix enviado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transferência externa:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência externa' });
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
    res.status(500).json({ error: 'Erro ao cadastrar tarefa' });
  }
});

// Endpoint para listar tarefas
app.get('/tarefas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /tarefas');
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
    res.status(500).json({ error: 'Erro ao listar tarefas' });
  }
});

// Endpoint para listar tarefas de todos os filhos
app.get('/tarefas/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /tarefas/filhos');
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
    console.error('Erro ao listar tarefas dos filhos:', error.stack);
    res.status(500).json({ error: 'Erro ao listar tarefas dos filhos' });
  }
});

// Endpoint para o filho marcar tarefa como concluída
app.post('/tarefa/marcar-concluida/:tarefaId', async (req, res) => {
  console.log('Requisição recebida em /tarefa/marcar-concluida');
  const { tarefaId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const tarefaResult = await client.query('SELECT status FROM tarefas WHERE id = $1', [tarefaId]);
      if (tarefaResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }
      if (tarefaResult.rows[0].status !== 'pendente') {
        return res.status(400).json({ error: 'Tarefa não está pendente' });
      }

      await client.query('UPDATE tarefas SET status = $1 WHERE id = $2', ['concluida_pelo_filho', tarefaId]);
      res.status(200).json({ message: 'Tarefa marcada como concluída!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao marcar tarefa:', error.stack);
    res.status(500).json({ error: 'Erro ao marcar tarefa' });
  }
});

// Endpoint para aprovar tarefa
app.post('/tarefa/aprovar/:tarefaId', async (req, res) => {
  console.log('Requisição recebida em /tarefa/aprovar');
  const { tarefaId } = req.params;
  const { pai_id, filho_id } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a tarefa
      const tarefaResult = await client.query('SELECT valor, status FROM tarefas WHERE id = $1', [tarefaId]);
      if (tarefaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }
      if (tarefaResult.rows[0].status !== 'concluida_pelo_filho') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tarefa não foi marcada como concluída pelo filho' });
      }

      const valor = parseFloat(tarefaResult.rows[0].valor);

      // Buscar a conta do pai
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do pai não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar a tarefa' });
      }

      // Deduzir do pai
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE id = $2', [valor, contaId]);
      // Adicionar ao filho
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valor, filho_id]);
      // Atualizar tarefa
      await client.query('UPDATE tarefas SET status = $1 WHERE id = $2', ['aprovada', tarefaId]);
      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4)',
        [contaId, 'transferencia', valor, `Pagamento por tarefa ${tarefaId}`]
      );
      await client.query('COMMIT');
      res.status(200).json({ message: 'Tarefa aprovada e valor transferido!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao aprovar tarefa:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar tarefa' });
  }
});

// Endpoint para buscar dados de um filho por ID
app.get('/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /filho/:filhoId');
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, nome_completo, email, icone, chave_pix, background FROM filhos WHERE id = $1',
        [filhoId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Filho não encontrado' });
      }
      res.status(200).json({ filho: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar filho:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar filho' });
  }
});

// Endpoint para histórico de transações de tarefas do filho
app.get('/transacoes/tarefas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/tarefas');
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(`
        SELECT t.id, t.descricao, t.valor, t.data_criacao
        FROM tarefas t
        WHERE t.filho_id = $1 AND t.status = 'aprovada'
        AND t.data_criacao >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY t.data_criacao DESC
      `, [filhoId]);

      const total = result.rows.reduce((sum, tarefa) => sum + parseFloat(tarefa.valor), 0);

      res.status(200).json({
        transacoes: result.rows.map(tarefa => ({
          id: tarefa.id,
          descricao: tarefa.descricao,
          valor: parseFloat(tarefa.valor),
          data: tarefa.data_criacao
        })),
        total
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar transações de tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

// Endpoint para total de transações de tarefas do pai
app.get('/transacoes/tarefas/pai/:paiId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/tarefas/pai');
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(`
        SELECT SUM(t.valor) as total
        FROM tarefas t
        JOIN filhos f ON t.filho_id = f.id
        WHERE f.pai_id = $1 AND t.status = 'aprovada'
      `, [paiId]);

      const total = parseFloat(result.rows[0].total) || 0;

      res.status(200).json({ total });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar total de transações do pai:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar total' });
  }
});

// Endpoint para monitoramento de um filho
app.get('/monitoramento/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /monitoramento');
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      // Transações de tarefas aprovadas
      const tarefasResult = await client.query(`
        SELECT t.id, t.descricao, t.valor, t.data_criacao
        FROM tarefas t
        WHERE t.filho_id = $1 AND t.status = 'aprovada'
        ORDER BY t.data_criacao DESC
      `, [filhoId]);

      // Transações gerais (saques, transferências, uso do cartão - simuladas)
      const transacoesResult = await client.query(`
        SELECT t.id, t.tipo, t.valor, t.descricao, t.data_criacao
        FROM transacoes t
        JOIN contas_filhos cf ON t.conta_id = cf.id
        WHERE cf.filho_id = $1
        ORDER BY t.data_criacao DESC
      `, [filhoId]);

      // Simular saques e uso do cartão
      const saquesSimulados = [
        { id: 1, tipo: 'saque', valor: 50.00, data: new Date(), descricao: 'Saque em caixa eletrônico' },
        { id: 2, tipo: 'saque', valor: 20.00, data: new Date(Date.now() - 86400000), descricao: 'Saque em caixa eletrônico' }
      ];

      const usoCartaoSimulado = [
        { id: 1, tipo: 'debito', valor: 15.00, data: new Date(), descricao: 'Compra em loja' },
        { id: 2, tipo: 'debito', valor: 30.00, data: new Date(Date.now() - 2 * 86400000), descricao: 'Pagamento online' }
      ];

      res.status(200).json({
        tarefas: tarefasResult.rows.map(tarefa => ({
          id: tarefa.id,
          descricao: tarefa.descricao,
          valor: parseFloat(tarefa.valor),
          data: tarefa.data_criacao
        })),
        transacoes: transacoesResult.rows.map(transacao => ({
          id: transacao.id,
          tipo: transacao.tipo,
          valor: parseFloat(transacao.valor),
          descricao: transacao.descricao,
          data: transacao.data_criacao
        })),
        saques: saquesSimulados,
        uso_cartao: usoCartaoSimulado
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar dados de monitoramento:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar dados de monitoramento' });
  }
});

// *** ENDPOINTS PARA DESAFIOS MATEMÁTICOS ***

// Função auxiliar para gerar um número aleatório entre min e max
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Função para gerar um desafio matemático
function generateMathChallenge() {
  const operations = ['soma', 'subtracao', 'multiplicacao', 'divisao'];
  const operation = operations[getRandomInt(0, 3)];
  let num1, num2, pergunta, respostaCorreta;

  switch (operation) {
    case 'soma':
      num1 = getRandomInt(1, 10);
      num2 = getRandomInt(1, 10);
      pergunta = `${num1} + ${num2}`;
      respostaCorreta = num1 + num2;
      break;
    case 'subtracao':
      num1 = getRandomInt(1, 10);
      num2 = getRandomInt(1, num1);
      pergunta = `${num1} - ${num2}`;
      respostaCorreta = num1 - num2;
      break;
    case 'multiplicacao':
      num1 = getRandomInt(1, 10);
      num2 = getRandomInt(1, 10);
      pergunta = `${num1} × ${num2}`;
      respostaCorreta = num1 * num2;
      break;
    case 'divisao':
      num2 = getRandomInt(1, 10);
      respostaCorreta = getRandomInt(1, 10);
      num1 = num2 * respostaCorreta;
      pergunta = `${num1} ÷ ${num2}`;
      break;
    default:
      throw new Error('Operação inválida');
  }

  return { tipo: operation, pergunta, respostaCorreta };
}

// Modelos padrão de desafios
const MODELOS_DESAFIOS = {
  '1': { name: 'Equilibrado', soma: 4, subtracao: 4, multiplicacao: 4, divisao: 3 },
  '2': { name: 'Foco em Soma e Subtração', soma: 7, subtracao: 7, multiplicacao: 1, divisao: 0 },
  '3': { name: 'Foco em Multiplicação', soma: 3, subtracao: 2, multiplicacao: 10, divisao: 0 },
  '4': { name: 'Foco em Divisão', soma: 4, subtracao: 3, multiplicacao: 0, divisao: 8 },
  '5': { name: 'Mistura Leve', soma: 5, subtracao: 5, multiplicacao: 3, divisao: 2 }
};

// Endpoint para listar os modelos disponíveis
app.get('/desafios/modelos', async (req, res) => {
  console.log('Requisição recebida em /desafios/modelos');
  try {
    const modelos = Object.keys(MODELOS_DESAFIOS).map(id => ({
      id,
      name: MODELOS_DESAFIOS[id].name,
      descricao: `Soma: ${MODELOS_DESAFIOS[id].soma}, Subtração: ${MODELOS_DESAFIOS[id].subtracao}, Multiplicação: ${MODELOS_DESAFIOS[id].multiplicacao}, Divisão: ${MODELOS_DESAFIOS[id].divisao}`
    }));
    res.status(200).json({ modelos });
  } catch (error) {
    console.error('Erro ao listar modelos:', error.stack);
    res.status(500).json({ error: 'Erro ao listar modelos' });
  }
});

// Endpoint para gerar desafios automáticos
app.post('/desafios/gerar/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/gerar/:filhoId');
  const { filhoId } = req.params;
  const { modeloId, valorTotal, paiId } = req.body;

  try {
    if (!modeloId || !valorTotal || !paiId) {
      return res.status(400).json({ error: 'Modelo, valor total e ID do pai são obrigatórios' });
    }

    if (!MODELOS_DESAFIOS[modeloId]) {
      return res.status(400).json({ error: 'Modelo inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      // Verificar saldo do pai
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [paiId]);
      if (contaPaiResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conta do pai não encontrada' });
      }
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      if (saldoPai < valorTotal) {
        return res.status(400).json({ error: 'Saldo insuficiente para criar os desafios' });
      }

      // Verificar desafios pendentes para o dia atual
      const today = new Date().toISOString().split('T')[0];
      const desafiosExistentes = await client.query(
        `SELECT COUNT(*) FROM desafios_matematicos WHERE filho_id = $1 AND DATE(data_criacao) = $2 AND status = 'pendente'`,
        [filhoId, today]
      );
      if (parseInt(desafiosExistentes.rows[0].count) > 0) {
        return res.status(400).json({ error: 'Já existem desafios pendentes para hoje' });
      }

      const modelo = MODELOS_DESAFIOS[modeloId];
      const desafios = [];

      // Gerar desafios de soma
      for (let i = 0; i < modelo.soma; i++) {
        const num1 = getRandomInt(1, 10);
        const num2 = getRandomInt(1, 10);
        desafios.push({
          tipo: 'soma',
          pergunta: `${num1} + ${num2}`,
          respostaCorreta: num1 + num2
        });
      }

      // Gerar desafios de subtração
      for (let i = 0; i < modelo.subtracao; i++) {
        const num1 = getRandomInt(1, 10);
        const num2 = getRandomInt(1, num1);
        desafios.push({
          tipo: 'subtracao',
          pergunta: `${num1} - ${num2}`,
          respostaCorreta: num1 - num2
        });
      }

      // Gerar desafios de multiplicação
      for (let i = 0; i < modelo.multiplicacao; i++) {
        const num1 = getRandomInt(1, 10);
        const num2 = getRandomInt(1, 10);
        desafios.push({
          tipo: 'multiplicacao',
          pergunta: `${num1} × ${num2}`,
          respostaCorreta: num1 * num2
        });
      }

      // Gerar desafios de divisão
      for (let i = 0; i < modelo.divisao; i++) {
        const num2 = getRandomInt(1, 10);
        const respostaCorreta = getRandomInt(1, 10);
        const num1 = num2 * respostaCorreta;
        desafios.push({
          tipo: 'divisao',
          pergunta: `${num1} ÷ ${num2}`,
          respostaCorreta
        });
      }

      // Inserir os desafios no banco
      for (const desafio of desafios) {
        await client.query(
          'INSERT INTO desafios_matematicos (filho_id, tipo, pergunta, resposta_correta, valor, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [filhoId, desafio.tipo, desafio.pergunta, desafio.respostaCorreta, valorTotal, 'pendente']
        );
      }

      res.status(201).json({ message: 'Desafios gerados com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao gerar desafios:', error.stack);
    res.status(500).json({ error: 'Erro ao gerar desafios' });
  }
});

// Endpoint para listar desafios pendentes do filho
app.get('/desafios/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/:filhoId');
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const today = new Date().toISOString().split('T')[0];
      const result = await client.query(
        `SELECT id, tipo, pergunta, valor FROM desafios_matematicos WHERE filho_id = $1 AND status = 'pendente' AND DATE(data_criacao) = $2 ORDER BY id`,
        [filhoId, today]
      );
      res.status(200).json({
        desafios: result.rows.map(desafio => ({
          id: desafio.id,
          tipo: desafio.tipo,
          pergunta: desafio.pergunta,
          valor: parseFloat(desafio.valor)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar desafios:', error.stack);
    res.status(500).json({ error: 'Erro ao listar desafios' });
  }
});

// Endpoint para a criança responder um desafio
app.post('/desafio/responder/:desafioId', async (req, res) => {
  console.log('Requisição recebida em /desafio/responder/:desafioId');
  const { desafioId } = req.params;
  const { resposta, filhoId, paiId } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const desafioResult = await client.query(
        'SELECT resposta_correta, valor, status FROM desafios_matematicos WHERE id = $1 AND filho_id = $2',
        [desafioId, filhoId]
      );
      if (desafioResult.rows.length === 0) {
        return res.status(404).json({ error: 'Desafio não encontrado' });
      }
      const desafio = desafioResult.rows[0];
      if (desafio.status !== 'pendente') {
        return res.status(400).json({ error: 'Desafio já foi respondido' });
      }

      const respostaCorreta = parseFloat(desafio.resposta_correta);
      const valorTotal = parseFloat(desafio.valor);
      const acertou = Math.abs(resposta - respostaCorreta) < 0.01;

      // Marcar a resposta
      await client.query('UPDATE desafios_matematicos SET status = $1 WHERE id = $2', [acertou ? 'acertado' : 'errado', desafioId]);

      // Verificar se todos os desafios foram respondidos
      const today = new Date().toISOString().split('T')[0];
      const desafiosDia = await client.query(
        `SELECT status FROM desafios_matematicos WHERE filho_id = $1 AND DATE(data_criacao) = $2`,
        [filhoId, today]
      );

      const todosRespondidos = desafiosDia.rows.length === 15 && desafiosDia.rows.every(d => d.status !== 'pendente');
      if (todosRespondidos) {
        const todosAcertados = desafiosDia.rows.every(d => d.status === 'acertado');
        if (todosAcertados) {
          // Creditar o valor total
          const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [paiId]);
          if (contaPaiResult.rows.length === 0) {
            return res.status(404).json({ error: 'Conta do pai não encontrada' });
          }
          const contaId = contaPaiResult.rows[0].id;
          const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

          if (saldoPai < valorTotal) {
            return res.status(400).json({ error: 'Saldo insuficiente para recompensar o desafio' });
          }

          await client.query('BEGIN');
          await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valorTotal, paiId]);
          await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorTotal, filhoId]);
          await client.query(
            'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4)',
            [contaId, 'transferencia', valorTotal, `Recompensa por completar todos os desafios matemáticos do dia`]
          );
          await client.query('COMMIT');
          res.status(200).json({ message: 'Resposta registrada! Você acertou todos os desafios e ganhou R$ ' + valorTotal.toFixed(2), acertou, todosAcertados: true });
        } else {
          res.status(200).json({ message: acertou ? 'Resposta correta! Continue respondendo.' : 'Resposta incorreta! Você não acertou todos os desafios.', acertou, todosAcertados: false });
        }
      } else {
        res.status(200).json({ message: acertou ? 'Resposta correta! Continue respondendo.' : 'Resposta incorreta! Continue respondendo as próximas perguntas.', acertou, todosAcertados: false });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao responder desafio:', error.stack);
    res.status(500).json({ error: 'Erro ao responder desafio' });
  }
});

// *** ENDPOINTS PARA ATUALIZAÇÃO DINÂMICA ***

const UPDATE_DIR = path.join(__dirname, 'updates');
const ZIP_PATH = path.join(UPDATE_DIR, 'frontend.zip');
const VERSION_PATH = path.join(UPDATE_DIR, 'version.json');

(async () => {
  try {
    if (!fs.existsSync(UPDATE_DIR)) {
      await fsPromises.mkdir(UPDATE_DIR);
    }
    if (!fs.existsSync(VERSION_PATH)) {
      await fsPromises.writeFile(VERSION_PATH, JSON.stringify({ version: '1.0.0' }));
    }
  } catch (error) {
    console.error('Erro ao inicializar diretório de atualizações:', error.stack);
  }
})();

async function calculateZipHash() {
  try {
    const fileBuffer = await fsPromises.readFile(ZIP_PATH);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (err) {
    return null;
  }
}

app.get('/update/check', async (req, res) => {
  try {
    const versionData = JSON.parse(await fsPromises.readFile(VERSION_PATH));
    const zipHash = await calculateZipHash();
    if (!zipHash) {
      return res.status(404).json({ error: 'Arquivo de atualização não encontrado' });
    }
    res.json({
      version: versionData.version,
      zipHash,
      zipUrl: '/update/download'
    });
  } catch (error) {
    console.error('Erro ao verificar atualizações:', error.stack);
    res.status(500).json({ error: 'Erro ao verificar atualizações' });
  }
});

app.get('/update/download', async (req, res) => {
  try {
    if (!fs.existsSync(ZIP_PATH)) {
      return res.status(404).json({ error: 'Arquivo de atualização não encontrado' });
    }
    res.download(ZIP_PATH, 'frontend.zip');
  } catch (error) {
    console.error('Erro ao baixar atualização:', error.stack);
    res.status(500).json({ error: 'Erro ao baixar atualização' });
  }
});

async function createFrontendZip() {
  try {
    const zip = new AdmZip();
    const frontendDir = path.join(__dirname, 'frontend_build');
    if (!fs.existsSync(frontendDir)) {
      console.error('Pasta frontend_build não encontrada');
      return;
    }
    zip.addLocalFolder(frontendDir);
    await new Promise((resolve, reject) => {
      zip.writeZip(ZIP_PATH, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('frontend.zip criado com sucesso');
  } catch (error) {
    console.error('Erro ao criar frontend.zip:', error.stack);
  }
}

createFrontendZip();

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('Erro ao iniciar o servidor:', err.stack);
    process.exit(1);
  }
  console.log(`Backend rodando em http://localhost:${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Erro não tratado na promessa:', promise, 'razão:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Erro não capturado:', err.stack);
});