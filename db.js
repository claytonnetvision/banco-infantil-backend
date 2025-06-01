require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// Tratamento de erros do pool
pool.on('error', (err, client) => {
  console.error('Erro inesperado no pool de conexões:', err);
  process.exit(-1);
});

module.exports = { pool };