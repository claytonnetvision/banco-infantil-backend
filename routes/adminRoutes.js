const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Usar variáveis de ambiente do .env
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'M@ch1nes@rob123!';

// Middleware para autenticar admin
let adminSession = false;

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Tentativa de login admin:', { username, password });
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    adminSession = true;
    res.json({ message: 'Admin logged in' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Middleware para checar session
const checkAdmin = (req, res, next) => {
  if (adminSession) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// List all users
router.get('/users', checkAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      console.log('Consultando tabelas pais e filhos...');
      // Adicionar IF NOT EXISTS para tipo, evitando erro se a coluna não existir
      const paisResult = await client.query(
        'SELECT id, nome_completo, email, senha, COALESCE(tipo, \'pai\') AS tipo FROM pais'
      );
      const filhosResult = await client.query(
        'SELECT id, nome_completo, email, senha, COALESCE(tipo, \'filho\') AS tipo FROM filhos'
      );
      const allUsers = [...paisResult.rows, ...filhosResult.rows];
      console.log('Consulta concluída:', { totalUsers: allUsers.length, paisRows: paisResult.rowCount, filhosRows: filhosResult.rowCount });
      if (allUsers.length === 0) {
        return res.status(200).json({ users: [], message: 'Nenhum usuário encontrado' });
      }
      res.status(200).json({ users: allUsers });
    } catch (err) {
      console.error('Erro na query de usuários:', err.stack);
      res.status(500).json({ error: 'Erro ao listar usuários', details: err.message });
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    console.error('Erro ao conectar ao pool:', err.stack);
    res.status(500).json({ error: 'Erro interno ao conectar ao pool', details: err.message });
  }
});

// Search user by email or id
router.get('/user/search', checkAdmin, async (req, res) => {
  const { query } = req.query;
  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const pais = await client.query('SELECT * FROM pais WHERE email ILIKE $1 OR id::text = $1', [`%${query}%`]);
      const filhos = await client.query('SELECT * FROM filhos WHERE email ILIKE $1 OR id::text = $1', [`%${query}%`]);
      const users = [...pais.rows, ...filhos.rows];
      res.status(200).json({ users });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add user
router.post('/user/add', checkAdmin, async (req, res) => {
  const { tipo, nome_completo, email, senha, telefone, cpf, pai_id } = req.body;
  try {
    const client = await pool.connect();
    let query, params;
    if (tipo === 'pai') {
      query = 'INSERT INTO pais (nome_completo, email, senha, telefone, cpf, tipo) VALUES ($1, $2, $3, $4, $5, $6)';
      params = [nome_completo, email, senha, telefone, cpf, 'pai'];
    } else if (tipo === 'filho') {
      query = 'INSERT INTO filhos (pai_id, nome_completo, email, senha, telefone, tipo) VALUES ($1, $2, $3, $4, $5, $6)';
      params = [pai_id, nome_completo, email, senha, telefone, 'filho'];
    }
    await client.query(query, params);
    client.release();
    res.status(201).json({ message: 'User added' });
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
    res.status(200).json({ message: 'User deleted' });
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
    res.status(200).json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create table
router.post('/db/create-table', checkAdmin, async (req, res) => {
  const { sql } = req.body;
  try {
    const client = await pool.connect();
    await client.query(sql);
    client.release();
    res.status(201).json({ message: 'Table created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute query
router.post('/db/query', checkAdmin, async (req, res) => {
  const { sql } = req.body;
  try {
    const client = await pool.connect();
    const result = await client.query(sql);
    client.release();
    res.status(200).json({ result: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;