const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const json2csv = require('json2csv').parse; // Instale com: npm i json2csv

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
      const paisResult = await client.query('SELECT id, nome_completo, email, senha, COALESCE(tipo, \'pai\') AS tipo FROM pais');
      const filhosResult = await client.query('SELECT id, nome_completo, email, senha, COALESCE(tipo, \'filho\') AS tipo FROM filhos');
      const allUsers = [...paisResult.rows, ...filhosResult.rows];
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

// Search user
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
    res.status(201).json({ message: 'Usuário adicionado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user
router.put('/user/update', checkAdmin, async (req, res) => {
  const { id, tipo, nome_completo, email, senha, telefone, cpf, pai_id } = req.body;
  try {
    const client = await pool.connect();
    let query, params;
    if (tipo === 'pai') {
      query = 'UPDATE pais SET nome_completo = $1, email = $2, senha = $3, telefone = $4, cpf = $5 WHERE id = $6';
      params = [nome_completo, email, senha, telefone, cpf, id];
    } else if (tipo === 'filho') {
      query = 'UPDATE filhos SET nome_completo = $1, email = $2, senha = $3, telefone = $4, pai_id = $5 WHERE id = $6';
      params = [nome_completo, email, senha, telefone, pai_id, id];
    }
    await client.query(query, params);
    client.release();
    res.status(200).json({ message: 'Usuário atualizado com sucesso!' });
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
    res.status(200).json({ message: 'Usuário deletado com sucesso!' });
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
    res.status(200).json({ message: 'Senha alterada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manage schools
router.get('/escolas', checkAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT * FROM escolas');
      res.status(200).json({ escolas: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/escola/add', checkAdmin, async (req, res) => {
  const { nome, endereco, telefone } = req.body;
  try {
    const client = await pool.connect();
    const query = 'INSERT INTO escolas (nome, endereco, telefone) VALUES ($1, $2, $3)';
    await client.query(query, [nome, endereco, telefone]);
    client.release();
    res.status(201).json({ message: 'Escola adicionada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/escola/update', checkAdmin, async (req, res) => {
  const { id, nome, endereco, telefone } = req.body;
  try {
    const client = await pool.connect();
    const query = 'UPDATE escolas SET nome = $1, endereco = $2, telefone = $3 WHERE id = $4';
    await client.query(query, [nome, endereco, telefone, id]);
    client.release();
    res.status(200).json({ message: 'Escola atualizada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/escola/delete', checkAdmin, async (req, res) => {
  const { id } = req.body;
  try {
    const client = await pool.connect();
    await client.query('DELETE FROM escolas WHERE id = $1', [id]);
    client.release();
    res.status(200).json({ message: 'Escola deletada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reports
router.get('/report', checkAdmin, async (req, res) => {
  const { type } = req.query;
  try {
    const client = await pool.connect();
    let result;
    if (type === 'users') {
      const pais = await client.query('SELECT COUNT(*) as count FROM pais');
      const filhos = await client.query('SELECT COUNT(*) as count FROM filhos');
      result = { pais: pais.rows[0].count, filhos: filhos.rows[0].count };
    } else if (type === 'activities') {
      result = await client.query('SELECT filho_id, COUNT(*) as count FROM tarefas GROUP BY filho_id');
    }
    client.release();
    res.status(200).json({ report: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backup (simplificado, requer pg_dump no servidor)
router.get('/backup', checkAdmin, async (req, res) => {
  try {
    // Nota: Isso requer pg_dump configurado no servidor Render (não suportado diretamente no free tier)
    // Exemplo teórico - implemente com cuidado em um ambiente pago
    res.status(501).json({ message: 'Backup não suportado no plano free. Configure pg_dump em um ambiente pago.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log actions (simplificado, cria tabela admin_logs)
router.post('/log', checkAdmin, async (req, res) => {
  const { action, details } = req.body;
  try {
    const client = await pool.connect();
    await client.query(
      'INSERT INTO banco_infantil.admin_logs (action, details, created_at) VALUES ($1, $2, NOW())',
      [action, details]
    );
    client.release();
    res.status(201).json({ message: 'Log registrado com sucesso!' });
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
    res.status(201).json({ message: 'Tabela criada com sucesso!' });
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

// Export users
router.get('/users/export', checkAdmin, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const paisResult = await client.query('SELECT id, nome_completo, email, senha, tipo FROM pais');
      const filhosResult = await client.query('SELECT id, nome_completo, email, senha, tipo FROM filhos');
      const allUsers = [...paisResult.rows, ...filhosResult.rows];
      const csv = json2csv(allUsers);
      res.set('Content-Disposition', 'attachment; filename=users.csv');
      res.set('Content-Type', 'text/csv');
      res.status(200).send(csv);
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;