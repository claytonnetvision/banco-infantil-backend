require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false // Permite certificados autoassinados (necessário para Neon)
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000
});

console.log('Configuração do pool:', {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  ssl: pool.options.ssl
});

pool.on('error', (err, client) => {
  console.error('Erro inesperado no pool de conexões:', err);
  process.exit(-1);
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack
    });
    process.exit(1);
  }
  console.log('Conexão ao banco estabelecida com sucesso');
  client.query('SELECT NOW()', (queryErr, res) => {
    release();
    if (queryErr) {
      console.error('Erro ao executar query de teste:', queryErr);
      process.exit(1);
    }
    console.log('Query de teste bem-sucedida:', res.rows);
  });
});

module.exports = { pool };