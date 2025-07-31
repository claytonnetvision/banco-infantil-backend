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
  console.log('Tentativa de login admin:', { username, password, expectedUser: ADMIN_USER, expectedPass: ADMIN_PASS });
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    adminSession = true;
    res.json({ message: 'Admin logged in' });
  } else {
    console.error('Credenciais inválidas:', { username, password });
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
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const paisResult = await client.query('SELECT id, nome_completo, email, senha, COALESCE(tipo, \'pai\') AS tipo, ativo, data_criacao FROM pais');
    const filhosResult = await client.query('SELECT id, nome_completo, email, senha, COALESCE(tipo, \'filho\') AS tipo, pai_id, ativo, data_criacao FROM filhos');
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
});

// Search user
router.get('/user/search', checkAdmin, async (req, res) => {
  let client;
  try {
    const { query } = req.query;
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const pais = await client.query('SELECT id, nome_completo, email, senha, tipo, ativo, data_criacao FROM pais WHERE email ILIKE $1 OR id::text = $1', [`%${query}%`]);
    const filhos = await client.query('SELECT id, nome_completo, email, senha, tipo, pai_id, ativo, data_criacao FROM filhos WHERE email ILIKE $1 OR id::text = $1', [`%${query}%`]);
    const users = [...pais.rows, ...filhos.rows];
    res.status(200).json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Add user
router.post('/user/add', checkAdmin, async (req, res) => {
  let client;
  try {
    const { tipo, nome_completo, email, senha, telefone, cpf, pai_id } = req.body;
    client = await pool.connect();
    let query, params;
    if (tipo === 'pai') {
      query = 'INSERT INTO pais (nome_completo, email, senha, telefone, cpf, tipo, ativo, data_criacao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id';
      params = [nome_completo, email, senha, telefone, cpf, 'pai', true, new Date()];
    } else if (tipo === 'filho') {
      query = 'INSERT INTO filhos (pai_id, nome_completo, email, senha, telefone, tipo, ativo, data_criacao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id';
      params = [pai_id, nome_completo, email, senha, telefone, 'filho', true, new Date()];
    }
    const result = await client.query(query, params);
    res.status(201).json({ message: 'Usuário adicionado com sucesso!', userId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Update user
router.put('/user/update', checkAdmin, async (req, res) => {
  let client;
  try {
    const { id, tipo, nome_completo, email, senha, telefone, cpf, pai_id, ativo } = req.body;
    if (!nome_completo || !email || !senha || !telefone) {
      return res.status(400).json({ error: 'Campos obrigatórios (nome_completo, email, senha, telefone) não podem ser nulos' });
    }
    client = await pool.connect();
    let query, params;
    if (tipo === 'pai') {
      query = 'UPDATE pais SET nome_completo = $1, email = $2, senha = $3, telefone = $4, cpf = COALESCE($5, \'\'), ativo = $6 WHERE id = $7';
      params = [nome_completo, email, senha, telefone, cpf, ativo !== undefined ? ativo : true, id];
    } else if (tipo === 'filho') {
      query = 'UPDATE filhos SET nome_completo = $1, email = $2, senha = $3, telefone = $4, pai_id = $5, ativo = $6 WHERE id = $7';
      params = [nome_completo, email, senha, telefone, pai_id || null, ativo !== undefined ? ativo : true, id];
    }
    await client.query(query, params);
    res.status(200).json({ message: 'Usuário atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err.stack);
    res.status(500).json({ error: 'Erro ao atualizar usuário', details: err.message });
  } finally {
    if (client) client.release();
  }
});

// Delete user
router.delete('/user/delete', checkAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');
    await client.query('SET CONSTRAINTS ALL DEFERRED'); // Desativa temporariamente as constraints
    const { id, tipo } = req.body;
    const table = tipo === 'pai' ? 'pais' : 'filhos';
    if (tipo === 'filho') {
      // Deletar todas as dependências do filho
      await client.query('DELETE FROM respostas_desafios WHERE crianca_id = $1', [id]);
      await client.query('DELETE FROM tarefas WHERE filho_id = $1 OR tarefa_automatica_id IN (SELECT id FROM tarefas_automaticas WHERE filho_id = $1)', [id]);
      await client.query('DELETE FROM tarefas_automaticas WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM notificacoes WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM contas_filhos WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM conjuntos_desafios WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM missoes_personalizadas WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM mesadas WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM transacoes WHERE conta_id IN (SELECT id FROM contas_filhos WHERE filho_id = $1)', [id]);
      await client.query('DELETE FROM desafios_matematicos WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM missoes_diarias WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM conquistas WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM tentativas_desafios WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM trofeus_diarios WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM objetivos WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM quiz_config WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM desafios_gerados_ia WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM perguntas_gerados_ia WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM respostas_perguntas_ia WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM desafios_ia WHERE filho_id = $1', [id]);
      await client.query('DELETE FROM analises_psicologicas WHERE filho_id = $1', [id]);
    } else if (tipo === 'pai') {
      // Deletar todas as dependências do pai e seus filhos
      const filhosResult = await client.query('SELECT id FROM filhos WHERE pai_id = $1', [id]);
      const filhoIds = filhosResult.rows.map(row => row.id);
      if (filhoIds.length > 0) {
        await client.query('DELETE FROM respostas_desafios WHERE crianca_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM tarefas WHERE filho_id = ANY($1) OR tarefa_automatica_id IN (SELECT id FROM tarefas_automaticas WHERE filho_id = ANY($1))', [filhoIds]);
        await client.query('DELETE FROM tarefas_automaticas WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM notificacoes WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM contas_filhos WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM conjuntos_desafios WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM missoes_personalizadas WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM mesadas WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM transacoes WHERE conta_id IN (SELECT id FROM contas_filhos WHERE filho_id = ANY($1))', [filhoIds]);
        await client.query('DELETE FROM desafios_matematicos WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM missoes_diarias WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM conquistas WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM tentativas_desafios WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM trofeus_diarios WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM objetivos WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM quiz_config WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM desafios_gerados_ia WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM perguntas_gerados_ia WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM respostas_perguntas_ia WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM desafios_ia WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM analises_psicologicas WHERE filho_id = ANY($1)', [filhoIds]);
        await client.query('DELETE FROM filhos WHERE pai_id = $1', [id]);
      }
      await client.query('DELETE FROM notificacoes_pais WHERE pai_id = $1', [id]);
      await client.query('DELETE FROM transacoes WHERE conta_id IN (SELECT id FROM contas WHERE pai_id = $1)', [id]);
      await client.query('DELETE FROM contas WHERE pai_id = $1', [id]);
      await client.query('DELETE FROM conjuntos_desafios WHERE pai_id = $1', [id]);
      await client.query('DELETE FROM mesadas WHERE pai_id = $1', [id]);
      await client.query('DELETE FROM tarefas_automaticas WHERE pai_id = $1', [id]);
      await client.query('DELETE FROM desafios_gerados_ia WHERE pai_id = $1', [id]);
      await client.query('DELETE FROM missoes_personalizadas WHERE pai_id = $1', [id]);
    }
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.status(200).json({ message: 'Usuário deletado com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar usuário:', err.stack);
    res.status(500).json({ error: 'Erro ao deletar usuário', details: err.message });
  } finally {
    if (client) {
      await client.query('SET CONSTRAINTS ALL IMMEDIATE'); // Reativa as constraints
      client.release();
    }
  }
});

// Change password
router.put('/user/password', checkAdmin, async (req, res) => {
  let client;
  try {
    const { id, tipo, nova_senha } = req.body;
    client = await pool.connect();
    const table = tipo === 'pai' ? 'pais' : 'filhos';
    await client.query(`UPDATE ${table} SET senha = $1 WHERE id = $2`, [nova_senha, id]);
    res.status(200).json({ message: 'Senha alterada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Manage schools
router.get('/escolas', checkAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query('SELECT * FROM escolas');
    res.status(200).json({ escolas: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

router.post('/escola/add', checkAdmin, async (req, res) => {
  let client;
  try {
    const { nome, endereco, telefone } = req.body;
    client = await pool.connect();
    const query = 'INSERT INTO escolas (nome, endereco, telefone) VALUES ($1, $2, $3)';
    await client.query(query, [nome, endereco, telefone]);
    res.status(201).json({ message: 'Escola adicionada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

router.put('/escola/update', checkAdmin, async (req, res) => {
  let client;
  try {
    const { id, nome, endereco, telefone } = req.body;
    client = await pool.connect();
    const query = 'UPDATE escolas SET nome = $1, endereco = $2, telefone = $3 WHERE id = $4';
    await client.query(query, [nome, endereco, telefone, id]);
    res.status(200).json({ message: 'Escola atualizada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

router.delete('/escola/delete', checkAdmin, async (req, res) => {
  let client;
  try {
    const { id } = req.body;
    client = await pool.connect();
    await client.query('DELETE FROM escolas WHERE id = $1', [id]);
    res.status(200).json({ message: 'Escola deletada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Reports
router.get('/report', checkAdmin, async (req, res) => {
  let client;
  try {
    const { type } = req.query;
    client = await pool.connect();
    let result;
    if (type === 'users') {
      const pais = await client.query('SELECT COUNT(*) as count FROM pais');
      const filhos = await client.query('SELECT COUNT(*) as count FROM filhos');
      result = { pais: pais.rows[0].count, filhos: filhos.rows[0].count };
    } else if (type === 'activities') {
      result = await client.query('SELECT filho_id, COUNT(*) as count FROM tarefas GROUP BY filho_id');
    }
    res.status(200).json({ report: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Backup (simplificado, requer pg_dump no servidor)
router.get('/backup', checkAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    // Nota: Isso requer pg_dump configurado no servidor Render (não suportado diretamente no free tier)
    // Exemplo teórico - implemente com cuidado em um ambiente pago
    res.status(501).json({ message: 'Backup não suportado no plano free. Configure pg_dump em um ambiente pago.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Log actions (simplificado, cria tabela admin_logs)
router.post('/log', checkAdmin, async (req, res) => {
  let client;
  try {
    const { action, details } = req.body;
    client = await pool.connect();
    await client.query(
      'INSERT INTO banco_infantil.admin_logs (action, details, created_at) VALUES ($1, $2, NOW())',
      [action, details]
    );
    res.status(201).json({ message: 'Log registrado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Create table
router.post('/db/create-table', checkAdmin, async (req, res) => {
  let client;
  try {
    const { sql } = req.body;
    client = await pool.connect();
    await client.query(sql);
    res.status(201).json({ message: 'Tabela criada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Execute query
router.post('/db/query', checkAdmin, async (req, res) => {
  let client;
  try {
    const { sql } = req.body;
    client = await pool.connect();
    const result = await client.query(sql);
    res.status(200).json({ result: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});
router.put('/user/activate-license', async (req, res) => {
  const { id, tipo } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');
    const table = tipo === 'pai' ? 'pais' : 'filhos';
    const result = await client.query(
      `UPDATE ${table} SET licenca_ativa = true, data_ativacao = CURRENT_DATE, data_expiracao = CURRENT_DATE + INTERVAL '6 months' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new Error('Usuário não encontrado');
    }
    res.json({ message: 'Licença ativada com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
// Export users
router.get('/users/export', checkAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const paisResult = await client.query('SELECT id, nome_completo, email, senha, tipo, ativo, data_criacao FROM pais');
    const filhosResult = await client.query('SELECT id, nome_completo, email, senha, tipo, pai_id, ativo, data_criacao FROM filhos');
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
});

module.exports = router;