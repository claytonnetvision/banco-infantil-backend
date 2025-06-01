require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool } = require('./db');
const { upload } = require('./upload');
const desafiosRouter = require('./routes/desafios');
const authRouter = require('./routes/authRoutes');
const userRouter = require('./routes/userRoutes');
const accountRouter = require('./routes/accountRoutes');
const taskRouter = require('./routes/taskRoutes');
const { executarTarefasDiarias } = require('./Agendador');
const app = express();

// Configuração do CORS - Permitir todas as origens
app.use(cors());
app.use(express.json());

console.log('Iniciando o servidor backend...');

// Servir arquivos de upload
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

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

// Usar roteadores com caminhos distintos
console.log('Carregando rotas');
try {
  if (!desafiosRouter || typeof desafiosRouter !== 'function') {
    throw new Error('desafiosRouter não é um middleware válido. Verifique routes/desafios.js');
  }
  if (!authRouter || typeof authRouter !== 'function') {
    throw new Error('authRouter não é um middleware válido. Verifique routes/authRoutes.js');
  }
  if (!userRouter || typeof userRouter !== 'function') {
    throw new Error('userRouter não é um middleware válido. Verifique routes/userRoutes.js');
  }
  if (!accountRouter || typeof accountRouter !== 'function') {
    throw new Error('accountRouter não é um middleware válido. Verifique routes/accountRoutes.js');
  }
  if (!taskRouter || typeof taskRouter !== 'function') {
    throw new Error('taskRouter não é um middleware válido. Verifique routes/taskRoutes.js');
  }

  app.use('/desafios', desafiosRouter);
  app.use('/auth', authRouter);
  app.use('/user', userRouter);
  app.use('/account', accountRouter);
  app.use('/task', taskRouter);
} catch (error) {
  console.error('Erro ao configurar roteadores:', error);
  process.exit(1);
}

// Rota de teste
app.get('/health', (req, res) => {
  console.log('Requisição recebida em /health');
  res.status(200).json({ status: 'Servidor ativo' });
});

// Iniciar servidor e agendador
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  executarTarefasDiarias(pool);
});