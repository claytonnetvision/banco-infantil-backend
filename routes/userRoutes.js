const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const multer = require('multer');
const { upload } = require('../upload');

// Middleware para tratar erros do Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'Erro no upload: ' + err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// Verificar se upload está definido
const uploadMiddleware = upload ? upload : {
  single: () => (req, res, next) => {
    console.error('Upload não configurado. Verifique upload.js');
    res.status(500).json({ error: 'Upload de arquivos não disponível' });
  }
};

// Endpoint para upload de avatar da criança
router.post('/perfil/avatar', uploadMiddleware.single('avatar'), handleMulterError, async (req, res) => {
  console.log('Requisição recebida em /perfil/avatar:', { filhoId: req.body.filhoId, file: req.file });
  const { filhoId } = req.body;
  const avatar = req.file ? req.file.filename : null;

  try {
    if (!filhoId || !avatar) {
      console.log('ID da criança ou arquivo de avatar ausente');
      return res.status(400).json({ error: 'ID da criança ou arquivo de avatar ausente' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'UPDATE filhos SET icone = $1 WHERE id = $2 RETURNING icone',
        [avatar, filhoId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      res.status(200).json({ message: 'Avatar atualizado com sucesso', avatar: result.rows[0].icone });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar avatar:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar avatar', details: error.message });
  }
});

// Endpoint para upload de fundo da criança
router.post('/perfil/background', uploadMiddleware.single('background'), handleMulterError, async (req, res) => {
  console.log('Requisição recebida em /perfil/background:', { filhoId: req.body.filhoId, file: req.file });
  const { filhoId } = req.body;
  const background = req.file ? req.file.filename : null;

  try {
    if (!filhoId || !background) {
      console.log('ID da criança ou arquivo de fundo ausente');
      return res.status(400).json({ error: 'ID da criança ou arquivo de fundo ausente' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'UPDATE filhos SET background = $1 WHERE id = $2 RETURNING background',
        [background, filhoId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      res.status(200).json({ message: 'Fundo atualizado com sucesso', background: result.rows[0].background });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar fundo:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar fundo', details: error.message });
  }
});

// Endpoint para atualizar foto de perfil
router.post('/perfil/foto', uploadMiddleware.single('foto'), async (req, res) => {
  console.log('Requisição recebida em /perfil/foto:', { paiId: req.body.paiId, file: req.file });
  const { paiId } = req.body;
  const foto = req.file ? req.file.filename : null;

  try {
    if (!paiId || !foto) {
      console.log('ID do responsável ou foto ausente');
      return res.status(400).json({ error: 'ID do responsável ou foto ausente' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE pais SET foto_perfil = $1 WHERE id = $2 RETURNING foto_perfil', [foto, paiId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Responsável não encontrado' });
      }
      res.status(200).json({ message: 'Foto de perfil atualizada com sucesso', foto: result.rows[0].foto_perfil });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar foto:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar foto', details: error.message });
  }
});

// Endpoint para atualizar o ícone da criança
router.post('/update-icon/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /update-icon/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;
  const { icon } = req.body;

  try {
    if (!icon) {
      console.log('Ícone não fornecido');
      return res.status(400).json({ error: 'Ícone não fornecido' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE filhos SET icone = $1 WHERE id = $2 RETURNING icone', [icon, filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }

      res.status(200).json({ message: 'Ícone atualizado com sucesso', icone: result.rows[0].icone });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar ícone:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar ícone', details: error.message });
  }
});

// Endpoint para atualizar o fundo do perfil da criança
router.post('/update-background/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /update-background/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;
  const { background } = req.body;

  try {
    if (!background) {
      console.log('Fundo não fornecido');
      return res.status(400).json({ error: 'Fundo não fornecido' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE filhos SET background = $1 WHERE id = $2 RETURNING background', [background, filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Criança não encontrada' });
      }

      res.status(200).json({ message: 'Fundo atualizado com sucesso', background: result.rows[0].background });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar fundo:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar fundo', details: error.message });
  }
});

// Endpoint para listar crianças
router.get('/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /filhos, paiId:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT id, nome_completo, email, icone FROM filhos WHERE pai_id = $1', [paiId]);
      console.log('Crianças encontradas:', result.rows);
      res.status(200).json({ 
        filhos: result.rows,
        message: result.rows.length === 0 ? 'Nenhuma criança encontrada para este responsável.' : 'Crianças carregadas com sucesso.'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar crianças:', error.stack);
    res.status(500).json({ error: 'Erro ao listar crianças', details: error.message });
  }
});

// Endpoint de debug para listar crianças com detalhes
router.get('/debug/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /debug/filhos:', req.params.paiId);
  const { paiId } = req.params;
  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT id, nome_completo, email, icone, pai_id FROM filhos WHERE pai_id = $1', [paiId]);
      console.log('Crianças (debug):', result.rows);
      res.status(200).json({ filhos: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar crianças (debug):', error.stack);
    res.status(500).json({ error: 'Erro ao listar crianças', details: error.message });
  }
});

// Endpoint para cadastrar criança
router.post('/filho', async (req, res) => {
  console.log('Requisição recebida em /filho:', req.body);
  const { nome_completo, senha, telefone, email, pai_id, icone } = req.body;

  try {
    if (!nome_completo || !senha || !telefone || !email || !pai_id) {
      console.log('Dados da criança incompletos');
      return res.status(400).json({ error: 'Dados da criança incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO filhos (nome_completo, senha, telefone, email, pai_id, icone, chave_pix) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email',
        [nome_completo, senha, telefone, email, pai_id, icone || 'default.png', email]
      );
      const filhoId = result.rows[0].id;

      // Criar conta para a criança
      await client.query('INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2)', [filhoId, 0.00]);

      res.status(201).json({ filho: result.rows[0], message: 'Criança cadastrada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      console.log('Email da criança já existe:', error.detail);
      return res.status(400).json({ error: 'Email da criança já cadastrado' });
    }
    console.error('Erro ao cadastrar criança:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar criança', details: error.message });
  }
});

// Endpoint para dados da criança
router.get('/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, nome_completo, email, telefone, icone, background, pai_id, chave_pix FROM filhos WHERE id = $1',
        [filhoId]
      );
      if (result.rows.length === 0) {
        console.log('Criança não encontrada:', { filhoId });
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      res.status(200).json({ filho: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar dados da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar dados da criança', details: error.message });
  }
});

// Endpoint para excluir perfil da criança
router.delete('/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /filho/:filhoId (DELETE):', req.params.filhoId, req.body);
  const { filhoId } = req.params;
  const { pai_id } = req.body;

  try {
    if (!pai_id) {
      console.log('ID do responsável não fornecido');
      return res.status(400).json({ error: 'ID do responsável é obrigatório' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a criança pertence ao responsável
      const filhoResult = await client.query(
        'SELECT id FROM filhos WHERE id = $1 AND pai_id = $2',
        [filhoId, pai_id]
      );
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Criança não encontrada ou não pertence ao responsável:', { filhoId, pai_id });
        return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
      }

      // Excluir dados associados
      await client.query('DELETE FROM contas_filhos WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM transacoes WHERE descricao LIKE $1', [`%${filhoId}%`]);
      await client.query('DELETE FROM tarefas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM tarefas_automaticas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM respostas_desafios WHERE crianca_id = $1', [filhoId]);
      await client.query('DELETE FROM conjuntos_desafios WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM desafios_matematicos WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM tentativas_desafios WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM notificacoes WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM mesadas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM missoes_personalizadas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM perguntas_gerados_ia WHERE filho_id = $1', [filhoId]);

      // Excluir a criança
      await client.query('DELETE FROM filhos WHERE id = $1', [filhoId]);

      await client.query('COMMIT');
      console.log('Perfil da criança excluído com sucesso:', { filhoId });
      res.status(200).json({ message: 'Perfil da criança excluído com sucesso' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao excluir perfil da criança:', error.stack);
      res.status(500).json({ error: 'Erro ao excluir perfil da criança', details: error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao conectar ao banco:', error.stack);
    res.status(500).json({ error: 'Erro ao conectar ao banco', details: error.message });
  }
});

// Endpoint para limpar dados da criança
router.delete('/admin/limpar-dados/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /admin/limpar-dados/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a criança existe
      const filhoResult = await client.query('SELECT id FROM filhos WHERE id = $1', [parseInt(filhoId)]);
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Criança não encontrada:', { filhoId });
        return res.status(404).json({ error: 'Criança não encontrada' });
      }

      // Excluir dados associados
      await client.query('DELETE FROM tarefas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM tarefas_automaticas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM missoes_diarias WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM perguntas_gerados_ia WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM respostas_desafios WHERE crianca_id = $1', [filhoId]);
      await client.query('DELETE FROM conjuntos_desafios WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM desafios_matematicos WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM tentativas_desafios WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM notificacoes WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM mesadas WHERE filho_id = $1', [filhoId]);
      await client.query('DELETE FROM missoes_personalizadas WHERE filho_id = $1', [filhoId]);

      await client.query('COMMIT');
      console.log('Dados da criança limpos com sucesso:', { filhoId });
      res.status(200).json({ message: 'Dados limpos com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao limpar dados:', error.stack);
      res.status(500).json({ error: 'Erro ao limpar dados', details: error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao conectar ao banco:', error.stack);
    res.status(500).json({ error: 'Erro ao conectar ao banco', details: error.message });
  }
});

module.exports = router;