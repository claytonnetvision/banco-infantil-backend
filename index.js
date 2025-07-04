require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { upload } = require('./upload');
const desafiosRouter = require('./routes/desafios');
const desafiosIARouter = require('./routes/desafiosIA');
const authRouter = require('./routes/authRoutes');
const userRouter = require('./routes/userRoutes');
const accountRouter = require('./routes/accountRoutes');
const taskRouter = require('./routes/taskRoutes');
const missionRouter = require('./routes/missionRoutes');
const passwordRouter = require('./routes/passwordRoutes');
const { executarTarefasDiarias } = require('./Agendador');
const app = express();

// Definir API_URL via variável de ambiente
const API_URL = process.env.API_URL || 'http://localhost:5000';

// Configuração do CORS - Permitir todas as origens
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Garantir UTF-8 em todas as respostas
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Configuração do pool de conexão com retry e timeout
const pool = new Pool({
  user: process.env.DB_USER || 'neondb_owner',
  host: process.env.DB_HOST || 'ep-rapid-flower-act74795-pooler.sa-east-1.aws.neon.tech',
  database: process.env.DB_NAME || 'banco_infantil',
  password: process.env.DB_PASSWORD || 'npg_CdlWZyu1D0rR',
  port: process.env.DB_PORT || '5432',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  maxUses: 1000,
});

// Log de eventos do pool
pool.on('connect', () => console.log('Nova conexão ao banco estabelecida'));
pool.on('acquire', client => console.log('Cliente adquirido do pool:', client.processID));
pool.on('remove', client => console.log('Cliente removido do pool:', client.processID));
pool.on('error', async (err, client) => {
  console.error('Erro no pool:', err, 'Cliente:', client ? client.processID : 'desconhecido');
  try {
    await pool.end();
    console.log('Pool encerrado, tentando reconectar...');
    await pool.connect();
    console.log('Reconexão bem-sucedida');
  } catch (reconnectErr) {
    console.error('Erro ao reconectar:', reconnectErr);
  }
});

// Middleware para log de requisições
app.use((req, res, next) => {
  console.log(`Requisição recebida: ${req.method} ${req.url} - Origem: ${req.ip} - Data: ${new Date().toISOString()}`);
  next();
});

// Servir arquivos de upload
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads'), {
  setHeaders: (res, path) => {
    res.set('Content-Type', 'image/jpeg');
  },
  fallthrough: true
}));
app.use('/Uploads', (req, res) => {
  console.log(`Arquivo não encontrado: ${req.url}`);
  res.status(404).json({ error: 'Arquivo não encontrado' });
});

// Testar conexão com o banco uma única vez
async function initializeDatabase() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    console.log('Conexão com o banco de dados estabelecida com sucesso');
    const testResult = await client.query('SELECT NOW()');
    console.log('Query de teste bem-sucedida:', testResult.rows);
  } catch (error) {
    console.error('Erro ao inicializar conexão com o banco:', error.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

// Usar roteadores com caminhos distintos
console.log('Carregando rotas');
try {
  console.log('Carregando roteador /auth:', path.resolve(__dirname, './routes/authRoutes'));
  app.use('/auth', authRouter);
  console.log('Carregando roteador /desafios:', path.resolve(__dirname, './routes/desafios'));
  app.use('/desafios', desafiosRouter);
  console.log('Carregando roteador /desafios/ia:', path.resolve(__dirname, './routes/desafiosIA'));
  app.use('/desafios/ia', desafiosIARouter);
  console.log('Carregando roteador /user:', path.resolve(__dirname, './routes/userRoutes'));
  app.use('/user', userRouter);
  console.log('Carregando roteador /account:', path.resolve(__dirname, './routes/accountRoutes'));
  app.use('/account', accountRouter);
  console.log('Carregando roteador /task:', path.resolve(__dirname, './routes/taskRoutes'));
  app.use('/task', taskRouter);
  console.log('Carregando roteador /mission:', path.resolve(__dirname, './routes/missionRoutes'));
  app.use('/mission', missionRouter);
  console.log('Carregando roteador /alterar-senha:', path.resolve(__dirname, './routes/passwordRoutes'));
  app.use('/alterar-senha', passwordRouter);
  console.log('Rotas carregadas com sucesso');
} catch (error) {
  console.error('Erro ao configurar rotas:', error.message, error.stack);
  process.exit(1);
}

// Rota para limpar dados
app.delete('/admin/limpar-dados/:filhoId', async (req, res) => {
  const { filhoId } = req.params;
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');
      const filhoResult = await client.query('SELECT id FROM filhos WHERE id = $1', [parseInt(filhoId)]);
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Criança não encontrada:', { filhoId });
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      await client.query('DELETE FROM tarefas WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM tarefas_automaticas WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM missoes_diarias WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM perguntas_gerados_ia WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM respostas_desafios WHERE crianca_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM conjuntos_desafios WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM desafios_matematicos WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM tentativas_desafios WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM notificacoes WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM mesadas WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('DELETE FROM missoes_personalizadas WHERE filho_id = $1', [parseInt(filhoId)]);
      await client.query('COMMIT');
      console.log('Dados da criança limpos com sucesso:', { filhoId });
      res.json({ message: 'Dados limpos com sucesso' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro ao limpar dados:', err.stack);
      res.status(500).json({ error: 'Erro interno ao limpar dados', details: err.message });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro na conexão ao limpar dados:', err.stack);
    res.status(500).json({ error: 'Erro interno ao limpar dados', details: err.message });
  }
});

// Rota para excluir um conjunto de desafios
app.delete('/desafios/conjunto/:conjuntoId', async (req, res) => {
  const { conjuntoId } = req.params;
  const { filho_id } = req.body;
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');
      const conjuntoResult = await client.query(
        'SELECT filho_id FROM conjuntos_desafios WHERE id = $1',
        [conjuntoId]
      );
      if (conjuntoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conjunto não encontrado' });
      }
      if (conjuntoResult.rows[0].filho_id !== parseInt(filho_id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Acesso negado: o conjunto não pertence a este filho' });
      }
      await client.query('DELETE FROM respostas_desafios WHERE conjunto_id = $1', [conjuntoId]);
      await client.query('DELETE FROM conjuntos_desafios WHERE id = $1', [conjuntoId]);
      await client.query('COMMIT');
      res.json({ message: 'Conjunto excluído com sucesso' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro ao excluir conjunto:', err.stack);
      res.status(500).json({ error: 'Erro ao excluir conjunto', details: err.message });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro na conexão ao excluir conjunto:', err.stack);
    res.status(500).json({ error: 'Erro interno ao excluir conjunto', details: err.message });
  }
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error(`Erro na requisição: ${req.method} ${req.url} - Origem: ${req.ip} - Data: ${new Date().toISOString()} - Stack: ${err.stack}`);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  console.log(`Rota não encontrada: ${req.method} ${req.url} - Origem: ${req.ip} - Data: ${new Date().toISOString()}`);
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar o servidor
async function startServer() {
  await initializeDatabase();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    executarTarefasDiarias();
  });
}

startServer().catch(err => console.error('Falha ao iniciar o servidor:', err.stack));