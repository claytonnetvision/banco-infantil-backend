// backend/routes/passwordRoutes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.post('/alterar-senha', async (req, res) => {
  const { email, novaSenha, tipo } = req.body;

  if (!email || !novaSenha || !tipo) {
    return res.status(400).json({ error: 'Email, nova senha e tipo são obrigatórios' });
  }

  try {
    const client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const table = tipo === 'pai' ? 'pais' : 'filhos';
    const result = await client.query(
      `UPDATE ${table} SET senha = $1 WHERE email = $2 RETURNING id`,
      [novaSenha, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.status(200).json({ message: 'Senha alterada com sucesso!' });
    client.release();
  } catch (error) {
    console.error('Erro ao alterar senha:', error.stack);
    res.status(500).json({ error: 'Erro ao alterar senha', details: error.message });
  }
});

module.exports = router;