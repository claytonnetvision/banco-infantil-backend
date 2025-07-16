const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { upload } = require('../upload');
const cron = require('node-cron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Tarefa agendada para limpar missões e desafios de IA expirados diariamente
cron.schedule('0 0 * * *', async () => {
  console.log('Executando limpeza de missões e desafios de IA expirados:', new Date().toISOString());
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM perguntas_gerados_ia WHERE data_expiracao < CURRENT_TIMESTAMP AND status = $1',
      ['pendente']
    );

    await client.query(
      'DELETE FROM missoes_personalizadas WHERE data_aprovacao IS NULL AND data_criacao < CURRENT_TIMESTAMP - INTERVAL \'1 day\' AND status = $1',
      ['pendente']
    );

    await client.query(
      'DELETE FROM missoes_diarias WHERE data_expiracao < CURRENT_TIMESTAMP AND status = $1',
      ['pendente']
    );

    await client.query('COMMIT');
    console.log('Limpeza de missões e desafios de IA expirados concluída com sucesso.');
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro na limpeza agendada:', error.stack);
  } finally {
    if (client) client.release();
  }
});

// Tarefa agendada para excluir análises antigas (7 dias)
cron.schedule('0 0 * * *', async () => {
  console.log('Executando limpeza de análises psicológicas antigas:', new Date().toISOString());
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    await client.query('BEGIN');

    const result = await client.query(
      'DELETE FROM analises_psicologicas WHERE data_analise < CURRENT_TIMESTAMP - INTERVAL \'7 days\' RETURNING id'
    );
    console.log(`Limpeza concluída: ${result.rowCount} análises excluídas.`);

    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro na limpeza agendada de análises:', error.stack);
  } finally {
    if (client) client.release();
  }
});

// Endpoint para configurar mesada
router.post('/mesada', async (req, res) => {
  console.log('Requisição recebida em /mesada:', req.body);
  const { pai_id, filho_id, valor, dia_semana } = req.body;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id || !filho_id || !valor || valor <= 0 || !dia_semana) {
      console.log('Dados inválidos:', { pai_id, filho_id, valor, dia_semana });
      return res.status(400).json({ error: 'Dados da mesada incompletos ou inválidos' });
    }

    const diasValidos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    if (!diasValidos.includes(dia_semana)) {
      console.log('Dia da semana inválido:', dia_semana);
      return res.status(400).json({ error: 'Dia da semana inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const paiExists = await client.query('SELECT id FROM pais WHERE id = $1', [parseInt(pai_id)]);
      if (paiExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Responsável não encontrado' });
      }

      const filhoExists = await client.query('SELECT id FROM filhos WHERE id = $1 AND pai_id = $2', [parseInt(filho_id), parseInt(pai_id)]);
      if (filhoExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
      }

      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE pai_id = $1 AND filho_id = $2',
        [parseInt(pai_id), parseInt(filho_id)]
      );
      if (mesadaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma mesada configurada para esta criança' });
      }

      const result = await client.query(
        'INSERT INTO mesadas (pai_id, filho_id, valor, dia_semana, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id, pai_id, filho_id, valor, dia_semana, ativo',
        [parseInt(pai_id), parseInt(filho_id), parseFloat(valor), dia_semana, true]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Nova mesada configurada: R$ ${parseFloat(valor).toFixed(2)} às ${dia_semana}.`, new Date()]
      );

      await client.query('COMMIT');
      console.log('Mesada criada:', result.rows[0]);
      res.status(201).json({ mesada: result.rows[0], message: 'Mesada configurada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao configurar mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao configurar mesada', details: error.message });
  }
});

// Endpoint para atualizar mesada
router.put('/mesada/:id', async (req, res) => {
  console.log('Requisição recebida em /mesada/:id (PUT):', req.params.id, req.body);
  const { id } = req.params;
  const { pai_id, filho_id, valor, dia_semana } = req.body;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id || !filho_id || !valor || valor <= 0 || !dia_semana) {
      console.log('Dados da mesada incompletos ou inválidos');
      return res.status(400).json({ error: 'Dados da mesada incompletos ou inválidos' });
    }

    const diasValidos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    if (!diasValidos.includes(dia_semana)) {
      console.log('Dia da semana inválido:', dia_semana);
      return res.status(400).json({ error: 'Dia da semana inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, parseInt(pai_id), parseInt(filho_id)]
      );
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada ou não pertence ao usuário' });
      }

      const result = await client.query(
        'UPDATE mesadas SET valor = $1, dia_semana = $2, ativo = $3 WHERE id = $4 RETURNING id, pai_id, filho_id, valor, dia_semana, ativo',
        [parseFloat(valor), dia_semana, true, id]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Sua mesada foi atualizada para R$ ${parseFloat(valor).toFixed(2)} às ${dia_semana}.`, new Date()]
      );

      await client.query('COMMIT');
      console.log('Mesada atualizada:', result.rows[0]);
      res.status(200).json({ mesada: result.rows[0], message: 'Mesada atualizada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar mesada', details: error.message });
  }
});

// Endpoint para excluir mesada
router.delete('/mesada/:id', async (req, res) => {
  console.log('Requisição recebida em /mesada/:id (DELETE):', req.params.id, req.body);
  const { id } = req.params;
  const { pai_id, filho_id } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id || !filho_id) {
      console.log('ID do responsável e da criança são obrigatórios');
      return res.status(400).json({ error: 'ID do responsável e da criança são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, parseInt(pai_id), parseInt(filho_id)]
      );
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada ou não pertence ao usuário' });
      }

      await client.query('DELETE FROM mesadas WHERE id = $1', [id]);

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Sua mesada foi cancelada pelo seu responsável.`, new Date()]
      );

      await client.query('COMMIT');
      console.log('Mesada excluída:', { id, pai_id, filho_id });
      res.status(200).json({ message: 'Mesada excluída com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao excluir mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir mesada', details: error.message });
  }
});

// Endpoint para listar mesadas
router.get('/mesadas/:paiId', async (req, res) => {
  console.log('Requisição recebida em /mesadas:', req.params.paiId);
  const { paiId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT m.id, m.filho_id, m.valor::float, m.dia_semana, m.ativo, f.nome_completo FROM mesadas m JOIN filhos f ON m.filho_id = f.id WHERE m.pai_id = $1',
        [parseInt(paiId)]
      );
      console.log('Mesadas encontradas:', result.rows);
      res.status(200).json({ mesadas: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar mesadas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar mesadas', details: error.message, mesadas: [] });
  }
});

// Endpoint para consultar mesada da criança
router.get('/mesada/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /mesada/filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT m.id, m.valor::float, m.dia_semana, m.ativo FROM mesadas m WHERE m.filho_id = $1',
        [parseInt(filhoId)]
      );
      console.log('Mesada encontrada:', result.rows);
      res.status(200).json({ mesada: result.rows[0] || null });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao consultar mesada da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar mesada', details: error.message });
  }
});

// Endpoint para listar notificações da criança
router.get('/notificacoes/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /notificacoes/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, mensagem, data_criacao FROM notificacoes WHERE filho_id = $1 ORDER BY data_criacao DESC LIMIT 10',
        [parseInt(filhoId)]
      );
      console.log('Notificações encontradas:', result.rows);
      res.status(200).json({ notificacoes: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar notificações:', error.stack);
    res.status(500).json({ error: 'Erro ao listar notificações', details: error.message });
  }
});

// Endpoint para listar perguntas de desafios de IA
router.get('/desafios/ia/perguntas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/ia/perguntas/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, pergunta, opcoes, resposta_correta, explicacao, valor_recompensa, data_expiracao ' +
        'FROM perguntas_gerados_ia WHERE filho_id = $1 AND status = $2 AND data_expiracao >= CURRENT_TIMESTAMP ' +
        'ORDER BY data_criacao DESC',
        [parseInt(filhoId), 'pendente']
      );
      console.log('Perguntas IA encontradas:', result.rows);
      if (result.rows.length === 0) {
        console.log('Nenhuma pergunta IA encontrada:', { filhoId });
        return res.status(200).json({ perguntas: [], error: 'Nenhuma pergunta IA encontrada' });
      }
      res.status(200).json({ perguntas: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar perguntas de IA:', error.stack);
    res.status(500).json({ error: 'Erro ao listar perguntas', details: error.message });
  }
});

// Endpoint para criar missões diárias para 15 dias
router.post('/missoes-diarias/criar', async (req, res) => {
  console.log('Requisição recebida em /missoes-diarias/criar:', req.body);
  const { pai_id, filho_id, tipo, meta, recompensa, dias } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id || !filho_id || !tipo || !meta || !recompensa || !dias || dias.length > 15) {
      console.log('Dados inválidos:', { pai_id, filho_id, tipo, meta, recompensa, dias });
      return res.status(400).json({ error: 'Dados inválidos ou mais de 15 dias selecionados' });
    }

    const tiposValidos = ['tarefas', 'boa_acao', 'tarefas_consecutivas', 'desafios'];
    if (!tiposValidos.includes(tipo)) {
      console.log('Tipo de missão inválido:', tipo);
      return res.status(400).json({ error: 'Tipo de missão inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      for (const dia of dias) {
        const dataCriacao = new Date(dia);
        const dataExpiracao = new Date(dataCriacao);
        dataExpiracao.setDate(dataExpiracao.getDate() + 1);
        dataExpiracao.setHours(23, 59, 59, 999);

        await client.query(
          `INSERT INTO missoes_diarias (filho_id, tipo, meta, progresso, recompensa, status, data_criacao, data_expiracao)
           VALUES ($1, $2, $3, 0, $4, $5, $6, $7)
           ON CONFLICT (filho_id, tipo, data_criacao) DO NOTHING`,
          [parseInt(filho_id), tipo, meta, parseFloat(recompensa), 'pendente', dataCriacao, dataExpiracao]
        );
      }

      await client.query('COMMIT');
      console.log('Missões diárias criadas para filhoId:', filho_id);
      res.status(200).json({ message: 'Missões diárias criadas com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao criar missões diárias:', error.stack);
    res.status(500).json({ error: 'Erro ao criar missões diárias', details: error.message });
  }
});

// Endpoint para concluir missão
router.post('/missoes-diarias/:id/concluir', async (req, res) => {
  console.log('Requisição recebida em /missoes-diarias/:id/concluir:', req.params.id, req.body);
  const { id } = req.params;
  const { filho_id } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id) {
      console.log('ID do filho é obrigatório');
      return res.status(400).json({ error: 'ID do filho é obrigatório' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const missaoResult = await client.query(
        'SELECT tipo, progresso, meta, recompensa, data_expiracao, filho_id FROM missoes_diarias WHERE id = $1 AND filho_id = $2 AND status = $3',
        [id, parseInt(filho_id), 'pendente']
      );
      if (missaoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Missão não encontrada ou já concluída' });
      }
      const missao = missaoResult.rows[0];
      if (missao.data_expiracao && new Date(missao.data_expiracao) < new Date()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Missão expirada' });
      }

      const novoProgresso = missao.progresso + 1;

      await client.query(
        'UPDATE missoes_diarias SET progresso = $1, status = CASE WHEN $1 >= $2 THEN $3 ELSE $4 END WHERE id = $5',
        [novoProgresso, missao.meta, 'aprovada', 'pendente', id]
      );

      if (novoProgresso >= missao.meta) {
        const contaPaiResult = await client.query(
          'SELECT id, saldo FROM contas WHERE pai_id IN (SELECT pai_id FROM filhos WHERE id = $1)',
          [parseInt(filho_id)]
        );
        if (contaPaiResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Conta do responsável não encontrada' });
        }
        const contaId = contaPaiResult.rows[0].id;
        const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

        if (saldoPai < parseFloat(missao.recompensa)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Saldo insuficiente para aprovar a missão' });
        }

        await client.query(
          'UPDATE contas SET saldo = saldo - $1 WHERE id = $2',
          [parseFloat(missao.recompensa), contaId]
        );
        await client.query(
          'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
          [parseFloat(missao.recompensa), parseInt(filho_id)]
        );
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
          [contaId, 'transferencia', parseFloat(missao.recompensa), `Recompensa por missão ${missao.tipo}`, 'missao_diaria']
        );
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [parseInt(filho_id), `Você concluiu a missão "${missao.tipo}" e ganhou R$ ${parseFloat(missao.recompensa).toFixed(2)}!`, new Date()]
        );
      }

      await client.query('COMMIT');
      console.log('Missão diária concluída:', { id, filho_id });
      res.status(200).json({ message: 'Missão concluída com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao concluir missão:', error.stack);
    res.status(500).json({ error: 'Erro ao concluir missão', details: error.message });
  }
});

// Endpoint para criar troféu diário
router.post('/trofeus-diarios', async (req, res) => {
  console.log('Requisição recebida em /trofeus-diarios:', req.body);
  const { filho_id, icone, nome } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO trofeus_diarios (filho_id, data, icone, nome) VALUES ($1, CURRENT_DATE, $2, $3) RETURNING id',
        [parseInt(filho_id), icone, nome]
      );
      console.log('Troféu diário registrado:', result.rows[0]);
      res.status(200).json({ message: 'Troféu diário registrado!', trofeuId: result.rows[0].id });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao registrar troféu diário:', error.stack);
    res.status(500).json({ error: 'Erro ao registrar troféu diário', details: error.message });
  }
});

// Endpoint para listar troféus diários
router.get('/trofeus-diarios/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /trofeus-diarios:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, nome, icone, data FROM trofeus_diarios WHERE filho_id = $1 ORDER BY data DESC',
        [parseInt(filhoId)]
      );
      console.log('Troféus encontrados:', result.rows);
      res.status(200).json({ trofeus: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar troféus diários:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar troféus diários', details: error.message });
  }
});

// Endpoint para criar objetivo
router.post('/objetivo', async (req, res) => {
  console.log('Requisição recebida em /objetivo:', req.body);
  const { filho_id, nome, valor_total } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id || !nome || !valor_total || valor_total <= 0) {
      console.log('Dados inválidos:', { filho_id, nome, valor_total });
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO objetivos (filho_id, nome, valor_total, valor_atual, data_criacao, status) VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, $4) RETURNING *',
        [parseInt(filho_id), nome, parseFloat(valor_total), 'pendente']
      );
      console.log('Objetivo criado:', result.rows[0]);
      res.status(200).json({ objetivo: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao criar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao criar objetivo', details: error.message });
  }
});

// Endpoint para atualizar objetivo
router.put('/objetivo/:id', async (req, res) => {
  console.log('Requisição recebida em /objetivo/:id (PUT):', req.params.id, req.body);
  const { id } = req.params;
  const { nome, valor_total, filho_id } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!nome || !valor_total || valor_total <= 0 || !filho_id) {
      console.log('Dados inválidos:', { nome, valor_total, filho_id });
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'UPDATE objetivos SET nome = $1, valor_total = $2 WHERE id = $3 AND filho_id = $4 RETURNING *',
        [nome, parseFloat(valor_total), id, parseInt(filho_id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Objetivo não encontrado' });
      }

      console.log('Objetivo atualizado:', result.rows[0]);
      res.status(200).json({ objetivo: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar objetivo', details: error.message });
  }
});

// Endpoint para listar objetivo
router.get('/objetivo/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /objetivo:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, nome, valor_total, valor_atual, status FROM objetivos WHERE filho_id = $1 AND status = $2',
        [parseInt(filhoId), 'pendente']
      );
      console.log('Objetivo encontrado:', result.rows);
      res.status(200).json({ objetivo: result.rows[0] || null });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar objetivo', details: error.message });
  }
});

// Endpoint para penalizar objetivo
router.put('/objetivo/penalizar', async (req, res) => {
  console.log('Requisição recebida em /objetivo/penalizar:', req.body);
  const { filho_id, valor_penalidade } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id || !valor_penalidade || valor_penalidade <= 0) {
      console.log('Dados inválidos:', { filho_id, valor_penalidade });
      return res.status(400).json({ error: 'Filho ID e valor da penalidade são obrigatórios e devem ser válidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'UPDATE objetivos SET valor_atual = GREATEST(0, valor_atual - $1) WHERE filho_id = $2 AND status = $3 RETURNING *',
        [parseFloat(valor_penalidade), parseInt(filho_id), 'pendente']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Nenhum objetivo pendente encontrado para esta criança' });
      }

      if (result.rows[0].valor_atual >= result.rows[0].valor_total) {
        await client.query(
          'UPDATE objetivos SET status = $1, data_conclusao = CURRENT_TIMESTAMP WHERE id = $2',
          ['concluido', result.rows[0].id]
        );
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [parseInt(filho_id), `Você alcançou seu objetivo "${result.rows[0].nome}"! Parabéns!`, new Date()]
        );
      }

      console.log('Objetivo penalizado:', result.rows[0]);
      res.status(200).json({ objetivo: result.rows[0], message: 'Progresso do objetivo atualizado' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao penalizar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao penalizar objetivo', details: error.message });
  }
});

// Endpoint para deletar objetivo
router.delete('/objetivo/:id', async (req, res) => {
  console.log('Requisição recebida em /objetivo/:id (DELETE):', req.params.id);
  const { id } = req.params;
  const { filho_id } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id) {
      console.log('ID do filho é obrigatório');
      return res.status(400).json({ error: 'ID do filho é obrigatório' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const objetivoExistente = await client.query(
        'SELECT id FROM objetivos WHERE id = $1 AND filho_id = $2',
        [id, parseInt(filho_id)]
      );
      if (objetivoExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Objetivo não encontrado' });
      }

      await client.query('DELETE FROM objetivos WHERE id = $1', [id]);

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), 'Seu objetivo foi removido.', new Date()]
      );

      await client.query('COMMIT');
      console.log('Objetivo deletado:', { id, filho_id });
      res.status(200).json({ message: 'Objetivo deletado com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao deletar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao deletar objetivo', details: error.message });
  }
});

// Endpoint para listar conquistas de uma criança
router.get('/conquistas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /conquistas:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, data, icone, nome FROM trofeus_diarios WHERE filho_id = $1 ORDER BY data DESC',
        [parseInt(filhoId)]
      );
      console.log('Conquistas encontradas:', result.rows);
      res.status(200).json({ conquistas: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar conquistas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar conquistas', details: error.message });
  }
});

// Endpoint para criar missão Time Familiar
router.post('/missao/time-familiar', async (req, res) => {
  console.log('Requisição recebida em /missao/time-familiar:', req.body);
  const { filho_id, pai_id, valor_recompensa, descricao, equipe_nomes } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id || !pai_id || !valor_recompensa || valor_recompensa <= 0 || !descricao) {
      console.log('Dados da missão incompletos:', { filho_id, pai_id, valor_recompensa, descricao, equipe_nomes });
      return res.status(400).json({ error: 'Dados da missão incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const filhoResult = await client.query('SELECT id, pai_id FROM filhos WHERE id = $1 AND pai_id = $2', [parseInt(filho_id), parseInt(pai_id)]);
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
      }

      const result = await client.query(
        'INSERT INTO missoes_personalizadas (filho_id, pai_id, tipo, valor_sugerido, valor_recompensa, descricao, equipe_nomes, status, data_criacao) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING id, filho_id, pai_id, tipo, valor_recompensa, descricao, equipe_nomes, status, data_criacao',
        [parseInt(filho_id), parseInt(pai_id), 'time_familiar', parseFloat(valor_recompensa), descricao, equipe_nomes || null, 'pendente']
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Missão Time Familiar enviada para aprovação: ${descricao}`, new Date()]
      );

      await client.query(
        'INSERT INTO notificacoes_pais (pai_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(pai_id), `Nova missão "Time Familiar" enviada por ${filho_id}`, new Date()]
      );

      await client.query('COMMIT');
      console.log('Missão Time Familiar criada:', result.rows[0]);
      res.status(201).json({ missao: result.rows[0], message: 'Missão Time Familiar enviada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao criar missão Time Familiar:', error.stack);
    res.status(500).json({ error: 'Erro ao criar missão Time Familiar', details: error.message });
  }
});

// Endpoint para missão "Resumo de Livro"
router.post('/missao/resumo-livro', async (req, res) => {
  console.log('Requisição recebida em /missao/resumo-livro:', req.body);
  const { filho_id, pai_id, valor_recompensa, descricao } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id || !pai_id || !valor_recompensa || !descricao) {
      console.log('Dados da missão incompletos:', { filho_id, pai_id, valor_recompensa, descricao });
      return res.status(400).json({ error: 'Dados da missão incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const filhoResult = await client.query('SELECT id, pai_id FROM filhos WHERE id = $1', [parseInt(filho_id)]);
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Filho não encontrado:', { filho_id });
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      if (filhoResult.rows[0].pai_id !== parseInt(pai_id)) {
        await client.query('ROLLBACK');
        console.log('Relação pai-filho inválida:', { filho_id, pai_id });
        return res.status(403).json({ error: 'O responsável não está associado a esta criança' });
      }

      const paiExists = await client.query('SELECT id FROM pais WHERE id = $1', [parseInt(pai_id)]);
      if (paiExists.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Pai não encontrado:', { pai_id });
        return res.status(404).json({ error: 'Responsável não encontrado' });
      }

      const result = await client.query(
        `INSERT INTO missoes_personalizadas (filho_id, pai_id, tipo, valor_sugerido, valor_recompensa, status, data_criacao, descricao)
         VALUES ($1, $2, $3, $4, $4, $5, CURRENT_TIMESTAMP, $6) RETURNING id, filho_id, pai_id, tipo, valor_recompensa, descricao, status, data_criacao`,
        [parseInt(filho_id), parseInt(pai_id), 'resumo_livro', parseFloat(valor_recompensa), 'pendente', descricao]
      );

      await client.query(
        'INSERT INTO notificacoes_pais (pai_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(pai_id), `Nova missão "Resumo de Livro" enviada por ${filho_id}`, new Date()]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Sua missão "Resumo de Livro" foi enviada para aprovação (R$ ${parseFloat(valor_recompensa).toFixed(2)}).`, new Date()]
      );

      await client.query('COMMIT');
      console.log('Missão Resumo de Livro criada:', result.rows[0]);
      res.status(201).json({ missao: result.rows[0], message: 'Missão "Resumo de Livro" enviada para aprovação!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao submeter missão "Resumo de Livro":', error.stack);
    res.status(500).json({ error: 'Erro ao submeter missão', details: error.message });
  }
});

// Endpoint para missão "Desenho"
router.post('/missao/desenho', upload.single('imagem'), async (req, res) => {
  console.log('Requisição recebida em /missao/desenho:', req.body, req.file);
  const { filho_id, pai_id, valor_recompensa } = req.body;
  const imagem = req.file ? `/Uploads/${req.file.filename}` : null;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id || !pai_id || !valor_recompensa || !imagem) {
      console.log('Dados da missão incompletos:', { filho_id, pai_id, valor_recompensa, imagem: imagem ? 'presente' : 'ausente' });
      return res.status(400).json({ error: 'Dados da missão incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const filhoResult = await client.query('SELECT id, pai_id FROM filhos WHERE id = $1', [parseInt(filho_id)]);
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Filho não encontrado:', { filho_id });
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      if (filhoResult.rows[0].pai_id !== parseInt(pai_id)) {
        await client.query('ROLLBACK');
        console.log('Relação pai-filho inválida:', { filho_id, pai_id });
        return res.status(403).json({ error: 'O responsável não está associado a esta criança' });
      }

      const paiExists = await client.query('SELECT id FROM pais WHERE id = $1', [parseInt(pai_id)]);
      if (paiExists.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Pai não encontrado:', { pai_id });
        return res.status(404).json({ error: 'Responsável não encontrado' });
      }

      const result = await client.query(
        `INSERT INTO missoes_personalizadas (filho_id, pai_id, tipo, valor_sugerido, valor_recompensa, status, data_criacao, imagem)
         VALUES ($1, $2, $3, $4, $4, $5, CURRENT_TIMESTAMP, $6) RETURNING id, filho_id, pai_id, tipo, valor_recompensa, status, data_criacao, imagem`,
        [parseInt(filho_id), parseInt(pai_id), 'desenho', parseFloat(valor_recompensa), 'pendente', imagem]
      );

      await client.query(
        'INSERT INTO notificacoes_pais (pai_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(pai_id), `Nova missão "Desenho" enviada por ${filho_id}`, new Date()]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Sua missão "Desenho" foi enviada para aprovação (R$ ${parseFloat(valor_recompensa).toFixed(2)}).`, new Date()]
      );

      await client.query('COMMIT');
      console.log('Missão Desenho criada:', result.rows[0]);
      res.status(201).json({ missao: result.rows[0], message: 'Missão "Desenho" enviada para aprovação!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao submeter missão "Desenho":', error.stack);
      res.status(500).json({ error: 'Erro ao submeter missão', details: error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao submeter missão "Desenho":', error.stack);
    res.status(500).json({ error: 'Erro ao submeter missão', details: error.message });
  }
});

// Endpoint para listar missões pendentes para aprovação (pai)
router.get('/missoes/pendentes/:paiId', async (req, res) => {
  console.log('Requisição recebida em /missoes/pendentes:', req.params.paiId);
  const { paiId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT mp.id, mp.filho_id, mp.pai_id, mp.tipo, mp.valor_recompensa, mp.descricao, mp.equipe_nomes, mp.status, mp.data_criacao, mp.imagem, f.nome_completo ' +
        'FROM missoes_personalizadas mp JOIN filhos f ON mp.filho_id = f.id ' +
        'WHERE mp.pai_id = $1 AND mp.status = $2 ' +
        'ORDER BY mp.data_criacao DESC',
        [parseInt(paiId), 'pendente']
      );
      console.log('Missões pendentes encontradas para paiId', paiId, ':', result.rows);
      res.status(200).json({
        missoes: result.rows.map(missao => ({
          ...missao,
          recompensa: parseFloat(missao.valor_recompensa)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar missões pendentes:', error.stack);
    res.status(500).json({ error: 'Erro ao listar missões pendentes', details: error.message });
  }
});

// Endpoint para listar missões pendentes da criança
router.get('/missoes/pendentes/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /missoes/pendentes/filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, tipo, valor_recompensa, descricao, equipe_nomes, status, data_criacao, imagem ' +
        'FROM missoes_personalizadas WHERE filho_id = $1 AND status = $2 ' +
        'ORDER BY data_criacao DESC',
        [parseInt(filhoId), 'pendente']
      );
      console.log('Missões pendentes encontradas para filhoId', filhoId, ':', result.rows);
      res.status(200).json({
        missoes: result.rows.map(missao => ({
          ...missao,
          recompensa: parseFloat(missao.valor_recompensa)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar missões pendentes da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao listar missões pendentes da criança', details: error.message });
  }
});

// Endpoint para aprovar ou rejeitar missão
router.post('/missao/aprovar/:missaoId', async (req, res) => {
  console.log('Requisição recebida em /missao/aprovar:', req.params.missaoId, req.body);
  const { missaoId } = req.params;
  const { pai_id, filho_id, aprovado } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id || !filho_id || typeof aprovado !== 'boolean') {
      console.log('Dados incompletos:', { pai_id, filho_id, aprovado });
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      await client.query('BEGIN');

      const missaoResult = await client.query(
        'SELECT valor_recompensa, status, data_criacao FROM missoes_personalizadas WHERE id = $1 AND filho_id = $2 AND pai_id = $3',
        [parseInt(missaoId), parseInt(filho_id), parseInt(pai_id)]
      );
      if (missaoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Missão não encontrada' });
      }
      const missao = missaoResult.rows[0];
      console.log('Missão encontrada:', missao);
      if (missao.status !== 'pendente') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Missão não está pendente' });
      }

      const valorRecompensa = parseFloat(missao.valor_recompensa);
      if (isNaN(valorRecompensa) || valorRecompensa <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Valor da recompensa inválido' });
      }

      if (aprovado) {
        const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [parseInt(pai_id)]);
        if (contaPaiResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Conta do responsável não encontrada' });
        }
        const contaId = contaPaiResult.rows[0].id;
        const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

        console.log('Verificando saldo:', { saldoPai, valorRecompensa });

        if (saldoPai < valorRecompensa) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Saldo insuficiente para aprovar a missão' });
        }

        await client.query(
          'UPDATE contas SET saldo = saldo - $1 WHERE id = $2',
          [valorRecompensa, contaId]
        );
        await client.query(
          'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
          [valorRecompensa, parseInt(filho_id)]
        );
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
          [contaId, 'transferencia', valorRecompensa, `Recompensa por missão ${missaoId}`, 'missao']
        );
      }

      await client.query(
        'UPDATE missoes_personalizadas SET status = $1, data_aprovacao = $2 WHERE id = $3',
        [aprovado ? 'aprovada' : 'rejeitada', aprovado ? new Date() : null, parseInt(missaoId)]
      );
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Missão ${aprovado ? 'aprovada' : 'rejeitada'} pelo responsável. ${aprovado ? `Você ganhou R$ ${valorRecompensa.toFixed(2)}!` : ''}`, new Date()]
      );

      await client.query('COMMIT');
      console.log(`Missão ${missaoId} ${aprovado ? 'aprovada' : 'rejeitada'} para filhoId ${filho_id}`);
      res.status(200).json({ message: `Missão ${aprovado ? 'aprovada' : 'rejeitada'} com sucesso!` });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao aprovar/rejeitar missão:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar/rejeitar missão', details: error.message });
  }
});

// Endpoint para gerar relatório PDF com jsPDF
const { jsPDF } = require('jspdf');
router.post('/gerar-relatorio-pdf', async (req, res) => {
  console.log('Requisição recebida em /gerar-relatorio-pdf:', req.body);
  const { missao } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!missao || !missao.id || !missao.filho_id || !missao.pai_id) {
      console.log('Dados da missão incompletos:', missao);
      return res.status(400).json({ error: 'Dados da missão incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const missaoResult = await client.query(
        'SELECT mp.id, mp.filho_id, mp.pai_id, mp.tipo, mp.valor_recompensa, mp.descricao, mp.equipe_nomes, mp.status, mp.data_criacao, mp.imagem, f.nome_completo, ap.analise ' +
        'FROM missoes_personalizadas mp ' +
        'JOIN filhos f ON mp.filho_id = f.id ' +
        'LEFT JOIN analises_psicologicas ap ON mp.id = ap.missao_id ' +
        'WHERE mp.id = $1 AND mp.filho_id = $2 AND mp.pai_id = $3',
        [parseInt(missao.id), parseInt(missao.filho_id), parseInt(missao.pai_id)]
      );

      if (missaoResult.rows.length === 0) {
        return res.status(404).json({ error: 'Missão não encontrada' });
      }

      const missaoData = missaoResult.rows[0];
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.text('Relatório de Missão - Banco Infantil', 10, 10);
      doc.setFontSize(12);

      // Informações da Missão
      let y = 20;
      doc.text(`Criança: ${missaoData.nome_completo}`, 10, y);
      y += 10;
      doc.text(`Tipo da Missão: ${{
        time_familiar: 'Time Familiar',
        resumo_livro: 'Resumo de Livro',
        desenho: 'Desenho'
      }[missaoData.tipo] || missaoData.tipo}`, 10, y);
      y += 10;
      doc.text(`Data de Criação: ${new Date(missaoData.data_criacao).toLocaleDateString('pt-BR')}`, 10, y);
      y += 10;
      doc.text(`Valor da Recompensa: R$ ${parseFloat(missaoData.valor_recompensa).toFixed(2)}`, 10, y);
      y += 10;
      if (missaoData.equipe_nomes) {
        doc.text(`Equipe: ${missaoData.equipe_nomes}`, 10, y);
        y += 10;
      }

      // Conteúdo da Missão
      doc.text('Conteúdo da Missão', 10, y);
      y += 10;
      const descricaoLines = doc.splitTextToSize(`Descrição da Criança: ${missaoData.descricao || 'Nenhuma descrição fornecida'}`, 180);
      doc.text(descricaoLines, 10, y);
      y += descricaoLines.length * 7;
      if (missaoData.imagem) {
        doc.text(`Imagem: http://localhost:5000${missaoData.imagem}`, 10, y);
        y += 10;
      }

      // Análise Psicológica
      doc.text('Análise Psicológica', 10, y);
      y += 10;
      const analiseLines = doc.splitTextToSize(`Análise: ${missaoData.analise || 'Nenhuma análise disponível'}`, 180);
      doc.text(analiseLines, 10, y);
      y += analiseLines.length * 7;

      // Nota para o Psicólogo
      doc.text('Nota para o Psicólogo', 10, y);
      y += 10;
      const notaLines = doc.splitTextToSize('Este relatório contém a descrição da criança e a análise gerada, que podem ser usadas para avaliar aspectos emocionais, criativos ou cognitivos.', 180);
      doc.text(notaLines, 10, y);

      const pdfBuffer = doc.output('arraybuffer');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_missao_${missaoData.id}.pdf`);
      res.send(Buffer.from(pdfBuffer));
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao gerar relatório PDF:', error.stack);
    res.status(500).json({ error: 'Erro ao gerar relatório PDF', details: error.message });
  }
});

// Endpoint para análise psicológica com Gemini
router.post('/analise-psicologica', async (req, res) => {
  console.log('Requisição recebida em /analise-psicologica:', req.body);
  const { missao } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!missao || !missao.id || !missao.filho_id || !missao.pai_id) {
      console.log('Dados da missão incompletos:', missao);
      return res.status(400).json({ error: 'Dados da missão incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const missaoResult = await client.query(
        'SELECT mp.id, mp.filho_id, mp.pai_id, mp.tipo, mp.valor_recompensa, mp.descricao, mp.equipe_nomes, mp.status, mp.data_criacao, mp.imagem, f.nome_completo ' +
        'FROM missoes_personalizadas mp JOIN filhos f ON mp.filho_id = f.id ' +
        'WHERE mp.id = $1 AND mp.filho_id = $2 AND mp.pai_id = $3',
        [parseInt(missao.id), parseInt(missao.filho_id), parseInt(missao.pai_id)]
      );

      if (missaoResult.rows.length === 0) {
        return res.status(404).json({ error: 'Missão não encontrada' });
      }

      const missaoData = missaoResult.rows[0];
      const textoCrianca = missaoData.descricao || 'Nenhum texto fornecido';
      const imagemPath = missaoData.imagem ? path.join(__dirname, '../', missaoData.imagem.replace(/^\/Uploads\//, 'Uploads/')) : null;

      const { analisarMissao } = require('../services/GeminiPsychologicalService');
      const analise = await analisarMissao({ missao: missaoData, imagemPath });

      const result = await client.query(
        'INSERT INTO analises_psicologicas (missao_id, filho_id, analise, texto_crianca, data_analise) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id',
        [parseInt(missaoData.id), parseInt(missaoData.filho_id), analise.analise, textoCrianca]
      );

      res.status(200).json({
        id: result.rows[0].id,
        analise: analise.analise,
        texto_crianca: textoCrianca,
        message: 'Análise psicológica gerada com sucesso!'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao gerar análise psicológica:', error.stack);
    res.status(500).json({ error: 'Erro ao gerar análise psicológica', details: error.message });
  }
});

// Endpoint para listar análises psicológicas
router.get('/analises/:paiId', async (req, res) => {
  console.log('Requisição recebida em /analises:', req.params.paiId);
  const { paiId } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT ap.id, ap.missao_id, ap.filho_id, ap.analise, ap.data_analise, mp.tipo, mp.descricao, mp.imagem, f.nome_completo ' +
        'FROM analises_psicologicas ap ' +
        'JOIN missoes_personalizadas mp ON ap.missao_id = mp.id ' +
        'JOIN filhos f ON ap.filho_id = f.id ' +
        'WHERE mp.pai_id = $1 ' +
        'ORDER BY ap.data_analise DESC',
        [parseInt(paiId)]
      );
      console.log('Análises psicológicas encontradas para paiId', paiId, ':', result.rows);
      res.status(200).json({ analises: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar análises psicológicas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar análises psicológicas', details: error.message });
  }
});

// Endpoint para excluir missão
router.delete('/missao/:id', async (req, res) => {
  console.log('Requisição recebida em /missao/:id:', req.params.id);
  const { id } = req.params;
  const { pai_id } = req.body;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id) {
      console.log('ID do responsável é obrigatório');
      return res.status(400).json({ error: 'ID do responsável é obrigatório' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      await client.query('BEGIN');

      const missaoExistente = await client.query(
        'SELECT id FROM missoes_personalizadas WHERE id = $1 AND pai_id = $2 AND status = $3',
        [parseInt(id), parseInt(pai_id), 'pendente']
      );
      if (missaoExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Missão não encontrada ou não pertence ao usuário' });
      }

      await client.query('DELETE FROM missoes_personalizadas WHERE id = $1', [parseInt(id)]);
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ((SELECT filho_id FROM missoes_personalizadas WHERE id = $1), $2, $3)',
        [parseInt(id), 'Sua missão foi excluída pelo responsável.', new Date()]
      );

      await client.query('COMMIT');
      console.log('Missão excluída:', { id, pai_id });
      res.status(200).json({ message: 'Missão excluída com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao excluir missão:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir missão', details: error.message });
  }
});

// Endpoint para excluir análise psicológica
router.delete('/analise/:id', async (req, res) => {
  console.log('Requisição recebida em /analise/:id:', req.params.id);
  const { id } = req.params;

  try {
    if (!req.headers.authorization) {
      console.log('Erro: Nenhum token de autorização fornecido');
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM analises_psicologicas WHERE id = $1 RETURNING id',
        [parseInt(id)]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Análise não encontrada' });
      }

      await client.query('COMMIT');
      console.log('Análise excluída:', { id });
      res.status(200).json({ message: 'Análise excluída com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao excluir análise:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir análise', details: error.message });
  }
});

module.exports = router;