const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Endpoint para cadastrar tarefa
router.post('/tarefa', async (req, res) => {
  console.log('Requisição recebida em /tarefa:', req.body);
  const { filho_id, descricao, valor } = req.body;

  try {
    if (!filho_id || !descricao || valor === undefined) {
      console.log('Dados da tarefa incompletos');
      return res.status(400).json({ error: 'Dados da tarefa incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [filho_id, descricao, valor, 'pendente']
      );
      res.status(201).json({ tarefa: result.rows[0], message: 'Tarefa cadastrada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao cadastrar tarefa:', error.stack);
    res.status(500).json({ error: 'Erro ao cadastrar tarefa', details: error.message });
  }
});

// Endpoint para listar tarefas da criança
router.get('/tarefas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /tarefas:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, descricao, status, valor FROM tarefas WHERE filho_id = $1 AND DATE(data_criacao) = CURRENT_DATE',
        [filhoId]
      );
      res.status(200).json({
        tarefas: result.rows.map(tarefa => ({
          ...tarefa,
          valor: parseFloat(tarefa.valor)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar tarefas', details: error.message });
  }
});

// Endpoint para listar tarefas de todas as crianças
router.get('/tarefas/filhos/:paiId', async (req, res) => {
  console.log('Requisição recebida em /tarefas/filhos:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(`
        SELECT t.id, t.filho_id, t.descricao, t.valor, t.status, f.nome_completo
        FROM tarefas t
        JOIN filhos f ON t.filho_id = f.id
        WHERE f.pai_id = $1 AND DATE(t.data_criacao) = CURRENT_DATE
        ORDER BY t.status, t.data_criacao DESC
      `, [paiId]);

      res.status(200).json({
        tarefas: result.rows.map(tarefa => ({
          ...tarefa,
          valor: parseFloat(tarefa.valor)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar tarefas', details: error.message });
  }
});

// Endpoint para aprovar tarefa
router.post('/tarefa/aprovar/:tarefaId', async (req, res) => {
  console.log('Requisição recebida em /tarefa/aprovar:', req.params.tarefaId);
  const { tarefaId } = req.params;
  const { pai_id, filho_id } = req.body;

  let client = null;
  try {
    if (!pai_id || !filho_id) {
      console.log('ID do responsável e da criança são obrigatórios');
      return res.status(400).json({ error: 'ID do responsável e da criança são obrigatórios' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    // Verificar tarefa
    const tarefaResult = await client.query('SELECT valor, status FROM tarefas WHERE id = $1 AND filho_id = $2', [tarefaId, filho_id]);
    if (tarefaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    const tarefa = tarefaResult.rows[0];
    if (tarefa.status !== 'concluida_pelo_filho') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Tarefa não está concluída pela criança' });
    }

    // Validar e converter tarefa.valor para número
    const valorTarefa = parseFloat(tarefa.valor);
    if (isNaN(valorTarefa) || valorTarefa <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Valor da tarefa é inválido' });
    }

    // Buscar a conta do responsável
    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
    if (contaPaiResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada' });
    }
    const contaId = contaPaiResult.rows[0].id;
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

    // Verificar saldo suficiente
    if (saldoPai < valorTarefa) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para aprovar a tarefa' });
    }

    // Atualizar status da tarefa
    await client.query('UPDATE tarefas SET status = $1 WHERE id = $2', ['aprovada', tarefaId]);

    // Deduzir do responsável
    await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valorTarefa, pai_id]);
    // Adicionar à criança
    await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorTarefa, filho_id]);
    // Registrar transação
    const result = await client.query(
      'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [contaId, 'transferencia', valorTarefa, `Recompensa por tarefa ${tarefaId}`, 'tarefa']
    );

    // Adicionar notificação para a criança
    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filho_id, `Sua tarefa foi aprovada! Você ganhou R$ ${valorTarefa.toFixed(2)}.`, new Date()]
    );

    await client.query('COMMIT');
    res.status(200).json({ transacao: result.rows[0], message: 'Tarefa aprovada com sucesso!' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao aprovar tarefa:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar tarefa', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Endpoint para marcar tarefa como concluída
router.post('/tarefa/marcar-concluida/:tarefaId', async (req, res) => {
  console.log('Requisição recebida em /tarefa/marcar-concluida:', req.params.tarefaId);
  const { tarefaId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('UPDATE tarefas SET status = $1 WHERE id = $2 RETURNING id', ['concluida_pelo_filho', tarefaId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }
      res.status(200).json({ message: 'Tarefa marcada como concluída!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao marcar tarefa como concluída:', error.stack);
    res.status(500).json({ error: 'Erro ao marcar tarefa', details: error.message });
  }
});

// Endpoint para configurar mesada
router.post('/mesada', async (req, res) => {
  console.log('Requisição recebida em /mesada:', req.body);
  const { pai_id, filho_id, valor, dia_semana } = req.body;

  try {
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

      // Verificar se pai e filho existem
      const paiExists = await client.query('SELECT id FROM pais WHERE id = $1', [pai_id]);
      if (paiExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Responsável não encontrado' });
      }

      const filhoExists = await client.query('SELECT id FROM filhos WHERE id = $1 AND pai_id = $2', [filho_id, pai_id]);
      if (filhoExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
      }

      // Verificar se já existe mesada para a criança
      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE pai_id = $1 AND filho_id = $2',
        [pai_id, filho_id]
      );
      if (mesadaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma mesada configurada para esta criança' });
      }

      // Inserir mesada
      const result = await client.query(
        'INSERT INTO mesadas (pai_id, filho_id, valor, dia_semana, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [pai_id, filho_id, valor, dia_semana, true]
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Sua mesada de R$ ${valor.toFixed(2)} foi configurada para ${dia_semana}!`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ mesada: result.rows[0], message: 'Mesada configurada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
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

      // Verificar se a mesada existe e pertence ao pai
      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, pai_id, filho_id]
      );
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada ou não pertence ao usuário' });
      }

      // Atualizar mesada
      const result = await client.query(
        'UPDATE mesadas SET valor = $1, dia_semana = $2, ativo = $3 WHERE id = $4 RETURNING id',
        [valor, dia_semana, true, id]
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Sua mesada foi atualizada para R$ ${valor.toFixed(2)} às ${dia_semana}!`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ mesada: result.rows[0], message: 'Mesada atualizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar mesada', details: error.message });
  }
});

// Endpoint para excluir mesada
router.delete('/mesada/:id', async (req, res) => {
  console.log('Requisição recebida em /mesada/:id (DELETE):', req.params.id);
  const { id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a mesada existe
      const mesadaExistente = await client.query('SELECT id, filho_id FROM mesadas WHERE id = $1', [id]);
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada' });
      }

      const filhoId = mesadaExistente.rows[0].filho_id;

      // Excluir mesada
      await client.query('DELETE FROM mesadas WHERE id = $1', [id]);

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filhoId, 'Sua mesada foi cancelada pelo responsável.', new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Mesada excluída com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir mesada:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir mesada', details: error.message });
  }
});

// Endpoint para listar mesadas
router.get('/mesadas/:paiId', async (req, res) => {
  console.log('Requisição recebida em /mesadas:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT m.id, m.filho_id, m.valor::float, m.dia_semana, m.ativo, f.nome_completo FROM mesadas m JOIN filhos f ON m.filho_id = f.id WHERE m.pai_id = $1',
        [paiId]
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
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT m.id, m.valor::float, m.dia_semana, m.ativo FROM mesadas m WHERE m.filho_id = $1',
        [filhoId]
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
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        'SELECT id, mensagem, data_criacao FROM notificacoes WHERE filho_id = $1 ORDER BY data_criacao DESC LIMIT 10',
        [filhoId]
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

// Endpoint para monitoramento
router.get('/monitoramento/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /monitoramento:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const tarefasResult = await client.query(
        `SELECT t.id, t.descricao, t.valor, t.data_criacao as data
         FROM tarefas t
         WHERE t.filho_id = $1 AND t.status = $2
         ORDER BY t.data_criacao DESC`,
        [filhoId, 'aprovada']
      );

      const transacoesResult = await client.query(
        `SELECT t.id, t.tipo, t.valor, t.descricao, t.data_criacao as data
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         JOIN filhos f ON f.pai_id = c.pai_id
         WHERE f.id = $1 AND t.descricao LIKE '%' || f.id || '%'
         ORDER BY t.data_criacao DESC`,
        [filhoId]
      );

      res.status(200).json({
        tarefas: tarefasResult.rows.map(t => ({ ...t, valor: parseFloat(t.valor) })),
        transacoes: transacoesResult.rows.map(t => ({ ...t, valor: parseFloat(t.valor) })),
        saques: [],
        uso_cartao: []
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar dados de monitoramento:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar dados de monitoramento', details: error.message });
  }
});

// Endpoint para criar tarefa automática
router.post('/tarefas-automaticas', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas:', req.body);
  const { pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim } = req.body;

  try {
    if (!pai_id || !filho_id || !descricao || !valor || valor <= 0 || !dias_semana || !data_inicio || !data_fim) {
      console.log('Dados da tarefa automática incompletos');
      return res.status(400).json({ error: 'Dados da tarefa automática incompletos' });
    }

    const diasValidos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    if (!Array.isArray(dias_semana) || !dias_semana.every(dia => diasValidos.includes(dia))) {
      console.log('Dias da semana inválidos:', dias_semana);
      return res.status(400).json({ error: 'Dias da semana inválidos' });
    }

    const dataInicio = new Date(data_inicio);
    const dataFim = new Date(data_fim);
    if (isNaN(dataInicio) || isNaN(dataFim) || dataInicio > dataFim || dataFim > new Date(dataInicio.setDate(dataInicio.getDate() + 7))) {
      console.log('Datas inválidas:', { data_inicio, data_fim });
      return res.status(400).json({ error: 'Datas inválidas. O período deve ser de até 7 dias a partir da data de início.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se pai e filho existem
      const paiExists = await client.query('SELECT id FROM pais WHERE id = $1', [pai_id]);
      if (paiExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Responsável não encontrado' });
      }

      const filhoExists = await client.query('SELECT id FROM filhos WHERE id = $1 AND pai_id = $2', [filho_id, pai_id]);
      if (filhoExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
      }

      // Inserir tarefa automática
      const result = await client.query(
        'INSERT INTO tarefas_automaticas (pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, true]
      );

      await client.query('COMMIT');
      res.status(201).json({ tarefa_automatica: result.rows[0], message: 'Tarefa automática configurada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao configurar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao configurar tarefa automática', details: error.message });
  }
});

// Endpoint para listar tarefas automáticas
router.get('/tarefas-automaticas/listar/:paiId', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas/listar:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT ta.id, ta.filho_id, ta.descricao, ta.valor::float, ta.dias_semana, ta.data_inicio, ta.data_fim, ta.ativo, f.nome_completo
         FROM tarefas_automaticas ta
         JOIN filhos f ON ta.filho_id = f.id
         WHERE ta.pai_id = $1
         ORDER BY ta.criado_em DESC`,
        [paiId]
      );
      console.log('Tarefas automáticas encontradas:', result.rows);
      res.status(200).json({ tarefas_automaticas: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar tarefas automáticas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar tarefas automáticas', details: error.message });
  }
});

// Endpoint para atualizar tarefa automática
router.put('/tarefas-automaticas/:id', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas/:id (PUT):', req.params.id, req.body);
  const { id } = req.params;
  const { pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim } = req.body;

  try {
    if (!pai_id || !filho_id || !descricao || !valor || valor <= 0 || !dias_semana || !data_inicio || !data_fim) {
      console.log('Dados da tarefa automática incompletos');
      return res.status(400).json({ error: 'Dados da tarefa automática incompletos' });
    }

    const diasValidos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    if (!Array.isArray(dias_semana) || !dias_semana.every(dia => diasValidos.includes(dia))) {
      console.log('Dias da semana inválidos:', dias_semana);
      return res.status(400).json({ error: 'Dias da semana inválidos' });
    }

    const dataInicio = new Date(data_inicio);
    const dataFim = new Date(data_fim);
    if (isNaN(dataInicio) || isNaN(dataFim) || dataInicio > dataFim || dataFim > new Date(dataInicio.setDate(dataInicio.getDate() + 7))) {
      console.log('Datas inválidas:', { data_inicio, data_fim });
      return res.status(400).json({ error: 'Datas inválidas. O período deve ser de até 7 dias a partir da data de início.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a tarefa automática existe
      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas_automaticas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, pai_id, filho_id]
      );
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada ou não pertence ao usuário' });
      }

      // Atualizar tarefa automática
      const result = await client.query(
        'UPDATE tarefas_automaticas SET descricao = $1, valor = $2, dias_semana = $3, data_inicio = $4, data_fim = $5, ativo = $6 WHERE id = $7 RETURNING id',
        [descricao, valor, dias_semana, data_inicio, data_fim, true, id]
      );

      await client.query('COMMIT');
      res.status(200).json({ tarefa_automatica: result.rows[0], message: 'Tarefa automática atualizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar tarefa automática', details: error.message });
  }
});

// Endpoint para excluir tarefa automática
router.delete('/tarefas-automaticas/:id', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas/:id (DELETE):', req.params.id);
  const { id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a tarefa automática existe
      const tarefaExistente = await client.query('SELECT id, filho_id FROM tarefas_automaticas WHERE id = $1', [id]);
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const filhoId = tarefaExistente.rows[0].filho_id;

      // Excluir tarefa automática
      await client.query('DELETE FROM tarefas_automaticas WHERE id = $1', [id]);

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filhoId, 'Uma tarefa automática foi cancelada pelo responsável.', new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Tarefa automática excluída com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir tarefa automática', details: error.message });
  }
});

// Endpoint para ativar/desativar tarefa automática
router.put('/tarefas-automaticas/:id/ativar', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas/:id/ativar:', req.params.id, req.body);
  const { id } = req.params;
  const { ativo } = req.body;

  try {
    if (typeof ativo !== 'boolean') {
      console.log('Estado ativo inválido:', ativo);
      return res.status(400).json({ error: 'Estado ativo deve ser um booleano' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar se a tarefa automática existe
      const tarefaExistente = await client.query('SELECT id, filho_id FROM tarefas_automaticas WHERE id = $1', [id]);
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const filhoId = tarefaExistente.rows[0].filho_id;

      // Atualizar estado
      const result = await client.query(
        'UPDATE tarefas_automaticas SET ativo = $1 WHERE id = $2 RETURNING id',
        [ativo, id]
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filhoId, `Uma tarefa automática foi ${ativo ? 'ativada' : 'desativada'} pelo responsável.`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ tarefa_automatica: result.rows[0], message: `Tarefa automática ${ativo ? 'ativada' : 'desativada'} com sucesso!` });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao ativar/desativar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao ativar/desativar tarefa automática', details: error.message });
  }
});

// Endpoint para aplicar tarefa automática imediatamente
router.post('/tarefas-automaticas/:id/aplicar-agora', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas/:id/aplicar-agora:', req.params.id);
  const { id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a tarefa automática
      const tarefaResult = await client.query(
        'SELECT filho_id, descricao, valor, data_inicio, data_fim, ativo FROM tarefas_automaticas WHERE id = $1',
        [id]
      );

      if (tarefaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const tarefa = tarefaResult.rows[0];
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dataInicio = new Date(tarefa.data_inicio);
      const dataFim = new Date(tarefa.data_fim);

      // Verificar se a tarefa está ativa e dentro do período válido
      if (!tarefa.ativo) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tarefa automática está desativada' });
      }

      if (hoje < dataInicio || hoje > dataFim) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tarefa automática fora do período válido' });
      }

      // Verificar se já existe uma tarefa para hoje
      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas WHERE filho_id = $1 AND descricao = $2 AND DATE(data_criacao) = CURRENT_DATE',
        [tarefa.filho_id, tarefa.descricao]
      );

      if (tarefaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma tarefa com essa descrição para hoje' });
      }

      // Criar a tarefa
      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [tarefa.filho_id, tarefa.descricao, tarefa.valor, 'pendente']
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [tarefa.filho_id, `Nova tarefa automática aplicada: ${tarefa.descricao} (R$ ${parseFloat(tarefa.valor).toFixed(2)})`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ tarefa: result.rows[0], message: 'Tarefa aplicada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao aplicar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao aplicar tarefa automática', details: error.message });
  }
});

// Endpoint para clonar tarefa automática
router.post('/tarefas-automaticas/:id/clonar', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas/:id/clonar:', req.params.id, req.body);
  const { id } = req.params;
  const { filho_id } = req.body;

  try {
    if (!filho_id) {
      console.log('ID da criança destino não fornecido');
      return res.status(400).json({ error: 'ID da criança destino é obrigatório' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a tarefa automática original
      const tarefaOriginalResult = await client.query(
        'SELECT pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, ativo FROM tarefas_automaticas WHERE id = $1',
        [id]
      );

      if (tarefaOriginalResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const tarefaOriginal = tarefaOriginalResult.rows[0];

      // Verificar se o filho destino é válido e pertence ao mesmo pai
      const filhoExists = await client.query(
        'SELECT id FROM filhos WHERE id = $1 AND pai_id = $2',
        [filho_id, tarefaOriginal.pai_id]
      );

      if (filhoExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança destino não encontrada ou não pertence ao responsável' });
      }

      // Verificar se já existe uma tarefa automática idêntica para o filho destino
      const tarefaDuplicada = await client.query(
        'SELECT id FROM tarefas_automaticas WHERE pai_id = $1 AND filho_id = $2 AND descricao = $3 AND data_inicio = $4 AND data_fim = $5',
        [tarefaOriginal.pai_id, filho_id, tarefaOriginal.descricao, tarefaOriginal.data_inicio, tarefaOriginal.data_fim]
      );

      if (tarefaDuplicada.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma tarefa automática idêntica para esta criança' });
      }

      // Criar nova tarefa automática
      const result = await client.query(
        'INSERT INTO tarefas_automaticas (pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [
          tarefaOriginal.pai_id,
          filho_id,
          tarefaOriginal.descricao,
          tarefaOriginal.valor,
          tarefaOriginal.dias_semana,
          tarefaOriginal.data_inicio,
          tarefaOriginal.data_fim,
          tarefaOriginal.ativo
        ]
      );

      // Adicionar notificação para a criança destino
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Nova tarefa automática clonada: ${tarefaOriginal.descricao} (R$ ${parseFloat(tarefaOriginal.valor).toFixed(2)})`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ tarefa_automatica: result.rows[0], message: 'Tarefa automática clonada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao clonar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao clonar tarefa automática', details: error.message });
  }
});

module.exports = router;