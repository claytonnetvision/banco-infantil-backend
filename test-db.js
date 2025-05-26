require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  connectionTimeoutMillis: 15000,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

(async () => {
  try {
    const client = await pool.connect();
    console.log('Conexão bem-sucedida!');
    // Define o search_path para a query
    await client.query('SET search_path TO banco_infantil');
    const res = await client.query('SELECT NOW()');
    console.log('Hora do servidor:', res.rows[0]);
    client.release();
    await pool.end();
  } catch (err) {
    console.error('Erro ao conectar:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT
    });
  }
})();