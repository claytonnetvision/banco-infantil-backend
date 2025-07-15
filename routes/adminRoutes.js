const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Hardcoded admin credentials (MUDE ISSO! Para produção, use env vars ou banco)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123'; // Senha simples, sem crypt

// Middleware para autenticar admin (session simples via local var - para prod, use JWT)
let adminSession = false; // Global session (não ideal, use Redis/JWT em prod)

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    adminSession = true;
    res.json({ message: 'Admin logged in' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Middleware para checar session em rotas admin
const checkAdmin = (req, res, next) => {
  if (adminSession) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// List all users (pais + filhos, com senhas)
router.get('/users', checkAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    const pais = await client.query('SELECT id, nome_completo, email, senha, tipo FROM pais');
    const filhos = await client.query('SELECT id, nome_completo, email, senha, tipo FROM filhos');
    client.release();
    res.json({ users: [...pais.rows, ...filhos.rows] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search user by email or id
router.get('/user/search', checkAdmin, async (req, res) => {
  const { query } = req.query;
  try {
    const client = await pool.connect();
    const pais = await client.query('SELECT * FROM pais WHERE email ILIKE $1 OR id::text = $1', [`%${query}%`]);
    const filhos = await client.query('SELECT * FROM filhos WHERE email ILIKE $1 OR id::text = $1', [`%${query}%`]);
    client.release();
    res.json({ users: [...pais.rows, ...filhos.rows] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add user (pai or filho)
router.post('/user/add', checkAdmin, async (req, res) => {
  const { tipo, nome_completo, email, senha, telefone, cpf, pai_id } = req.body; // Para filho, inclua pai_id
  try {
    const client = await pool.connect();
    let query, params;
    if (tipo === 'pai') {
      query = 'INSERT INTO pais (nome_completo, email, senha, telefone, cpf) VALUES ($1, $2, $3, $4, $5)';
      params = [nome_completo, email, senha, telefone, cpf];
    } else if (tipo === 'filho') {
      query = 'INSERT INTO filhos (pai_id, nome_completo, email, senha, telefone) VALUES ($1, $2, $3, $4, $5)';
      params = [pai_id, nome_completo, email, senha, telefone];
    }
    await client.query(query, params);
    client.release();
    res.json({ message: 'User added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/user/delete', checkAdmin, async (req, res) => {
  const { id, tipo } = req.body;
  try {
    const client = await pool.connect();
    const table = tipo === 'pai' ? 'pais' : 'filhos';
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    client.release();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password
router.put('/user/password', checkAdmin, async (req, res) => {
  const { id, tipo, nova_senha } = req.body;
  try {
    const client = await pool.connect();
    const table = tipo === 'pai' ? 'pais' : 'filhos';
    await client.query(`UPDATE ${table} SET senha = $1 WHERE id = $2`, [nova_senha, id]);
    client.release();
    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create table (SQL directo - PERIGOSO!)
router.post('/db/create-table', checkAdmin, async (req, res) => {
  const { sql } = req.body; // ex.: "CREATE TABLE test (id SERIAL PRIMARY KEY)"
  try {
    const client = await pool.connect();
    await client.query(sql);
    client.release();
    res.json({ message: 'Table created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute any SQL query (acesso direto - MUITO PERIGOSO!)
router.post('/db/query', checkAdmin, async (req, res) => {
  const { sql } = req.body;
  try {
    const client = await pool.connect();
    const result = await client.query(sql);
    client.release();
    res.json({ result: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;