const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Endpoint para cadastro (pai e criança)
router.post('/cadastro', async (req, res) => {
  console.log('Requisição recebida em /auth/cadastro:', req.body);
  const { pai, filho } = req.body;
  let paiId;

  try {
    if (!pai || !pai.nome_completo || !pai.senha || !pai.telefone || !pai.cpf || !pai.email) {
      console.log('Dados do responsável incompletos');
      return res.status(400).json({ error: 'Dados do responsável incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const paiResult = await client.query(
        'INSERT INTO pais (nome_completo, senha, telefone, cpf, email) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
        [pai.nome_completo, pai.senha, pai.telefone, pai.cpf, pai.email]
      );
      paiId = paiResult.rows[0].id;
      console.log('Responsável cadastrado com ID:', paiId);

      // Criar conta para o responsável
      await client.query('INSERT INTO contas (pai_id, saldo) VALUES ($1, $2)', [paiId, 0.00]);

      let criancaData = null;
      if (filho && filho.nome_completo && filho.senha && filho.telefone && filho.email) {
        const filhoResult = await client.query(
          'INSERT INTO filhos (nome_completo, senha, telefone, email, pai_id, icone, chave_pix) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email',
          [filho.nome_completo, filho.senha, filho.telefone, filho.email, paiId, filho.icone || 'default.png', filho.email]
        );
        criancaData = filhoResult.rows[0];
        console.log('Criança cadastrada com ID:', criancaData.id);

        // Criar conta para a criança
        await client.query('INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)', [criancaData.id, 0.00]);
      }

      res.status(201).json({
        user: { id: paiId, email: paiResult.rows[0].email, tipo: 'pai' },
        crianca: criancaData,
        message: 'Cadastro realizado com sucesso!'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      console.log('Usuário já existe:', error.detail);
      return res.status(400).json({ error: 'Usuário já existe: CPF ou email já cadastrado' });
    }
    console.error('Erro no cadastro:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar', details: error.message });
  }
});

// Endpoint de login
router.post('/login', async (req, res) => {
  console.log('Requisição recebida em /auth/login:', req.body);
  const { email, senha } = req.body;
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SET search_path TO banco_infantil');
        let result = await client.query('SELECT id, email, \'pai\' as tipo FROM pais WHERE email = $1 AND senha = $2', [email, senha]);
        if (result.rows.length > 0) {
          console.log('Login bem-sucedido para responsável:', email);
          return res.json({ user: result.rows[0], message: 'Login bem-sucedido!' });
        }

        result = await client.query('SELECT id, email, \'filho\' as tipo, chave_pix FROM filhos WHERE email = $1 AND senha = $2', [email, senha]);
        if (result.rows.length > 0) {
          console.log('Login bem-sucedido para criança:', email);
          return res.json({ user: result.rows[0], message: 'Login bem-sucedido!' });
        }

        console.log('Falha no login para:', email);
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      } finally {
        client.release();
      }
    } catch (error) {
      attempt++;
      if (attempt === maxRetries) {
        console.error('Erro no login após tentativas:', error.stack);
        return res.status(500).json({ error: 'Erro ao fazer login', details: error.message });
      }
      console.log(`Tentativa ${attempt} falhou, tentando novamente...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
});

// Endpoint para trocar senha
router.post('/alterar-senha', async (req, res) => {
  console.log('Requisição recebida em /auth/alterar-senha:', req.body);
  const { email, novaSenha, tipo } = req.body;

  try {
    if (!email || !novaSenha || !tipo || !['pai', 'filho'].includes(tipo)) {
      console.log('Dados inválidos:', { email, novaSenha, tipo });
      return res.status(400).json({ error: 'Email, nova senha e tipo (pai ou filho) são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');

      let result;
      if (tipo === 'pai') {
        result = await client.query(
          'UPDATE pais SET senha = $1 WHERE email = $2 RETURNING id',
          [novaSenha, email]
        );
      } else {
        result = await client.query(
          'UPDATE filhos SET senha = $1 WHERE email = $2 RETURNING id',
          [novaSenha, email]
        );
      }

      if (result.rows.length === 0) {
        console.log('Usuário não encontrado:', { email, tipo });
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.status(200).json({ message: 'Senha alterada com sucesso' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao alterar senha:', error.stack);
    res.status(500).json({ error: 'Erro ao alterar senha', details: error.message });
  }
});

module.exports = router;