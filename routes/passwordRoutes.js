const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { pool } = require('../db');

router.post('/alterar-senha', async (req, res) => {
  const { email, senha_atual, nova_senha, tipo } = req.body;

  if (!email || !senha_atual || !nova_senha || !tipo) {
    return res.status(400).json({ error: 'Email, senha atual, nova senha e tipo são obrigatórios' });
  }

  if (!['pai', 'filho'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo deve ser "pai" ou "filho"' });
  }

  try {
    const client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const table = tipo === 'pai' ? 'pais' : 'filhos';
    const result = await client.query(
      `SELECT id, senha FROM ${table} WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { id, senha } = result.rows[0];
    const senhaValida = await bcrypt.compare(senha_atual, senha);
    if (!senhaValida) {
      client.release();
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const novoHash = await bcrypt.hash(nova_senha, 10);
    await client.query(
      `UPDATE ${table} SET senha = $1 WHERE id = $2`,
      [novoHash, id]
    );

    res.status(200).json({ message: 'Senha alterada com sucesso!' });
    client.release();
  } catch (error) {
    console.error('Erro ao alterar senha:', error.stack);
    res.status(500).json({ error: 'Erro ao alterar senha', details: error.message });
  }
});

module.exports = router;