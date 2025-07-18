const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const jwt = require('jsonwebtoken');

console.log('Carregando authRoutes.js');

// Chave secreta para JWT (mover para variável de ambiente em produção)
const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_aqui';

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
        'SELECT id, nome_completo, email, senha, data_criacao FROM pais WHERE email = $1 AND senha = $2',
        [email, senha]
      );

      let user = null;
      if (userResult.rows.length > 0) {
        user = { ...userResult.rows[0], tipo: 'pai' };
      } else {
        // Verificar se é uma criança (filho)
        userResult = await client.query(
          'SELECT id, nome_completo, email, senha, pai_id, icone, background, chave_pix, data_criacao FROM filhos WHERE email = $1 AND senha = $2',
          [email, senha]
        );
        if (userResult.rows.length > 0) {
          user = { ...userResult.rows[0], tipo: 'filho' };
        }
      }

      if (!user) {
        console.log('Credenciais inválidas para:', email);
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Gerar token JWT
      const token = jwt.sign(
        { id: user.id, tipo: user.tipo, email: user.email, data_criacao: user.data_criacao },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      console.log('Login bem-sucedido:', { userId: user.id, tipo: user.tipo });
      res.status(200).json({ user, token, message: 'Login realizado com sucesso!' });
    } catch (error) {
      console.error('Erro interno ao fazer login:', error.stack);
      res.status(500).json({ error: 'Erro ao fazer login', details: error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao conectar ao banco para login:', error.stack);
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

      // Cadastrar responsável (senha em texto puro)
      const paiResult = await client.query(
        'INSERT INTO pais (nome_completo, email, senha, telefone, cpf, data_criacao) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING id',
        [pai.nome_completo, pai.email, pai.senha, pai.telefone, pai.cpf]
      );
      const paiId = paiResult.rows[0].id;

      // Criar conta para o responsável
      await client.query(
        'INSERT INTO contas (pai_id, saldo) VALUES ($1, $2)',
        [paiId, 1000.00] // Saldo inicial de exemplo
      );

      // Cadastrar criança (senha em texto puro)
      const filhoResult = await client.query(
        'INSERT INTO filhos (pai_id, nome_completo, email, senha, telefone, icone, data_criacao) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING id',
        [paiId, filho.nome_completo, filho.email, filho.senha, filho.telefone, filho.icone || 'default.png']
      );
      const filhoId = filhoResult.rows[0].id;

      // Criar conta para a criança
      await client.query(
        'INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)',
        [filhoId, 0.00]
      );

      await client.query('COMMIT');

      // Gerar token JWT para login automático
      const user = {
        id: paiId,
        nome_completo: pai.nome_completo,
        email: pai.email,
        tipo: 'pai',
        data_criacao: new Date()
      };
      const token = jwt.sign(
        { id: user.id, tipo: user.tipo, email: user.email, data_criacao: user.data_criacao },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.status(201).json({ user, token, message: 'Cadastro realizado com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao cadastrar:', error.stack);
      res.status(500).json({ error: 'Erro ao cadastrar', details: error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao cadastrar:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar', details: error.message });
  }
});

// Rota para alterar senha sem criptografia
router.post('/alterar-senha', async (req, res) => {
  console.log('Requisição recebida em /auth/alterar-senha:', req.body);
  const { email, nova_senha, tipo } = req.body;

  try {
    if (!email || !nova_senha || !tipo) {
      return res.status(400).json({ error: 'Email, nova senha e tipo são obrigatórios' });
    }
    if (nova_senha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }
    if (!['pai', 'filho'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo deve ser "pai" ou "filho"' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const table = tipo === 'pai' ? 'pais' : 'filhos';
      const userResult = await client.query(`SELECT id FROM ${table} WHERE email = $1`, [email]);
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      await client.query(`UPDATE ${table} SET senha = $1 WHERE email = $2`, [nova_senha, email]);

      await client.query('COMMIT');
      res.json({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao alterar senha:', error.stack);
    res.status(500).json({ error: 'Erro ao alterar senha', details: error.message });
  }
});

module.exports = router;