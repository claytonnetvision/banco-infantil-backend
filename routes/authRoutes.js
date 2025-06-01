const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.post('/login', async (req, res) => {
  console.log('Requisição recebida em /auth/login:', req.body);
  const { email, senha } = req.body;

  try {
    if (!email || !senha) {
      console.log('Email e senha são obrigatórios');
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');

      // Verificar se é um responsável (pai)
      let userResult = await client.query(
        'SELECT id, nome_completo, email FROM pais WHERE email = $1 AND senha = $2',
        [email, senha]
      );

      let user = null;
      if (userResult.rows.length > 0) {
        user = { ...userResult.rows[0], tipo: 'pai' };
      } else {
        // Verificar se é uma criança (filho)
        userResult = await client.query(
          'SELECT id, nome_completo, email, pai_id, icone, background, chave_pix FROM filhos WHERE email = $1 AND senha = $2',
          [email, senha]
        );
        if (userResult.rows.length > 0) {
          user = { ...userResult.rows[0], tipo: 'filho' };
        }
      }

      if (!user) {
        console.log('Credenciais inválidas');
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      res.status(200).json({ user, message: 'Login realizado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao fazer login:', error.stack);
    res.status(500).json({ error: 'Erro ao fazer login', details: error.message });
  }
});

router.post('/cadastro', async (req, res) => {
  console.log('Requisição recebida em /auth/cadastro:', req.body);
  const { pai, filho } = req.body;

  try {
    if (!pai || !filho || !pai.email || !pai.senha || !pai.nome_completo || !pai.cpf || !pai.telefone ||
        !filho.email || !filho.senha || !filho.nome_completo || !filho.telefone) {
      console.log('Dados incompletos');
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se o email do responsável já existe
      const paiExistente = await client.query('SELECT id FROM pais WHERE email = $1', [pai.email]);
      if (paiExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Email do responsável já cadastrado' });
      }

      // Verificar se o email da criança já existe
      const filhoExistente = await client.query('SELECT id FROM filhos WHERE email = $1', [filho.email]);
      if (filhoExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Email da criança já cadastrado' });
      }

      // Cadastrar responsável
      const paiResult = await client.query(
        'INSERT INTO pais (nome_completo, email, senha, telefone, cpf) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [pai.nome_completo, pai.email, pai.senha, pai.telefone, pai.cpf]
      );
      const paiId = paiResult.rows[0].id;

      // Criar conta para o responsável
      await client.query(
        'INSERT INTO contas (pai_id, saldo) VALUES ($1, $2)',
        [paiId, 1000.00] // Saldo inicial de exemplo
      );

      // Cadastrar criança
      const filhoResult = await client.query(
        'INSERT INTO filhos (pai_id, nome_completo, email, senha, telefone, icone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [paiId, filho.nome_completo, filho.email, filho.senha, filho.telefone, filho.icone || 'default.png']
      );
      const filhoId = filhoResult.rows[0].id;

      // Criar conta para a criança
      await client.query(
        'INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)',
        [filhoId, 0.00]
      );

      await client.query('COMMIT');

      // Retornar o usuário responsável para login automático
      const user = {
        id: paiId,
        nome_completo: pai.nome_completo,
        email: pai.email,
        tipo: 'pai'
      };

      res.status(201).json({ user, message: 'Cadastro realizado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao cadastrar:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar', details: error.message });
  }
});

module.exports = router;