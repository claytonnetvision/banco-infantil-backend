// backend/routes/taskRoutes.js
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
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [filho_id, descricao, valor, 'pendente']
      );

      await client.query(
        `UPDATE missoes_diarias 
         SET progresso = progresso + 1 
         WHERE filho_id = $1 
         AND tipo = 'tarefas' 
         AND data_criacao = CURRENT_DATE 
         AND status = 'pendente'`,
        [filho_id]
      );

      const missaoResult = await client.query(
        `SELECT id, progresso, meta, recompensa 
         FROM missoes_diarias 
         WHERE filho_id = $1 
         AND tipo = 'tarefas' 
         AND data_criacao = CURRENT_DATE 
         AND status = 'pendente'`,
        [filho_id]
      );

      if (missaoResult.rows.length > 0 && missaoResult.rows[0].progresso >= missaoResult.rows[0].meta) {
        await client.query(
          `UPDATE missoes_diarias 
           SET status = 'concluido' 
           WHERE id = $1`,
          [missaoResult.rows[0].id]
        );

        const contaPaiResult = await client.query(
          'SELECT id, saldo FROM contas WHERE pai_id = (SELECT pai_id FROM filhos WHERE id = $1)',
          [filho_id]
        );
        if (contaPaiResult.rows.length > 0 && contaPaiResult.rows[0].saldo >= missaoResult.rows[0].recompensa) {
          const contaId = contaPaiResult.rows[0].id;
          await client.query(
            'UPDATE contas SET saldo = saldo - $1 WHERE id = $2',
            [missaoResult.rows[0].recompensa, contaId]
          );
          await client.query(
            'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
            [missaoResult.rows[0].recompensa, filho_id]
          );
          await client.query(
            'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
            [contaId, 'transferencia', missaoResult.rows[0].recompensa, `Recompensa por missão diária de tarefas`, 'missao_diaria']
          );
          await client.query(
            'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
            [filho_id, `Você completou a missão diária de tarefas e ganhou R$ ${missaoResult.rows[0].recompensa.toFixed(2)}!`, new Date()]
          );
        }
      }

      if (result.rows.length > 0) {
        await client.query(
          `UPDATE objetivos 
           SET valor_atual = valor_atual + $1 
           WHERE filho_id = $2 AND status = 'pendente'`,
          [valor, filho_id]
        );
      }

      await client.query('COMMIT');
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

    const valorTarefa = parseFloat(tarefa.valor);
    if (isNaN(valorTarefa) || valorTarefa <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Valor da tarefa é inválido' });
    }

    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
    if (contaPaiResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada' });
    }
    const contaId = contaPaiResult.rows[0].id;
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

    if (saldoPai < valorTarefa) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para aprovar a tarefa' });
    }

    await client.query('UPDATE tarefas SET status = $1 WHERE id = $2', ['aprovada', tarefaId]);
    await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valorTarefa, pai_id]);
    await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorTarefa, filho_id]);
    await client.query(
      `UPDATE objetivos 
       SET valor_atual = valor_atual + $1 
       WHERE filho_id = $2 AND status = 'pendente'`,
      [valorTarefa, filho_id]
    );
    const result = await client.query(
      'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [contaId, 'transferencia', valorTarefa, `Recompensa por tarefa ${tarefaId}`, 'tarefa']
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filho_id, `Sua tarefa foi aprovada! Você ganhou R$ ${valorTarefa.toFixed(2)}.`, new Date()]
    );

    const conquistaResult = await client.query(
      `SELECT id FROM conquistas WHERE filho_id = $1 AND nome = $2`,
      [filho_id, 'Primeira Tarefa Concluída']
    );
    if (conquistaResult.rows.length === 0) {
      await client.query(
        `INSERT INTO conquistas (filho_id, nome, descricao, icone, recompensa) 
         VALUES ($1, $2, $3, $4, $5)`,
        [filho_id, 'Primeira Tarefa Concluída', 'Você concluiu sua primeira tarefa!', 'trofeu1.png', 0.50]
      );
      if (saldoPai >= 0.50) {
        await client.query(
          'UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2',
          [0.50, pai_id]
        );
        await client.query(
          'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
          [0.50, filho_id]
        );
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
          [contaId, 'transferencia', 0.50, `Recompensa por conquista: Primeira Tarefa Concluída`, 'conquista']
        );
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [filho_id, `Você desbloqueou a conquista "Primeira Tarefa Concluída" e ganhou R$ 0.50!`, new Date()]
        );
      }
    }

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

      const mesadaExistente = await client.query(
        'SELECT id FROM mesadas WHERE pai_id = $1 AND filho_id = $2',
        [pai_id, filho_id]
      );
      if (mesadaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma mesada configurada para esta criança' });
      }

      const result = await client.query(
        'INSERT INTO mesadas (pai_id, filho_id, valor, dia_semana, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id, pai_id, filho_id, valor, dia_semana, ativo',
        [pai_id, filho_id, valor, dia_semana, true]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Nova mesada configurada: R$ ${valor.toFixed(2)} às ${dia_semana}.`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ mesada: result.rows[0], message: 'Mesada configurada com sucesso!' });
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
        [id, pai_id, filho_id]
      );
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada ou não pertence ao usuário' });
      }

      const result = await client.query(
        'UPDATE mesadas SET valor = $1, dia_semana = $2, ativo = $3 WHERE id = $4 RETURNING id, pai_id, filho_id, valor, dia_semana, ativo',
        [valor, dia_semana, true, id]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Sua mesada foi atualizada para R$ ${valor.toFixed(2)} às ${dia_semana}.`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ mesada: result.rows[0], message: 'Mesada atualizada com sucesso!' });
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
    if (!pai_id || !filho_id) {
      console.log('ID do responsável e da criança são obrigatórios');
      return res.status(400).json({ error: 'ID do responsável e da criança são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const mesadaExistente = await client.query(
        'SELECT id, filho_id FROM mesadas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, pai_id, filho_id]
      );
      if (mesadaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mesada não encontrada ou não pertence ao usuário' });
      }

      await client.query('DELETE FROM mesadas WHERE id = $1', [id]);

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Sua mesada foi cancelada pelo seu responsável.`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Mesada excluída com sucesso!' });
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
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Excluir tarefas automáticas vencidas
      const tarefasVencidas = await client.query(
        `SELECT id, filho_id FROM tarefas_automaticas 
         WHERE pai_id = $1 AND data_fim < CURRENT_DATE`,
        [paiId]
      );

      for (const tarefa of tarefasVencidas.rows) {
        await client.query('DELETE FROM tarefas_automaticas WHERE id = $1', [tarefa.id]);
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [tarefa.filho_id, `Uma tarefa automática expirou e foi removida.`, new Date()]
        );
      }

      // Listar tarefas automáticas válidas
      const result = await client.query(
        `SELECT ta.id, ta.filho_id, ta.descricao, ta.valor::float, ta.dias_semana, ta.data_inicio, ta.data_fim, ta.ativo, f.nome_completo
         FROM tarefas_automaticas ta
         JOIN filhos f ON ta.filho_id = f.id
         WHERE ta.pai_id = $1
         ORDER BY ta.criado_em DESC`,
        [paiId]
      );

      await client.query('COMMIT');
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

      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas_automaticas WHERE id = $1 AND pai_id = $2 AND filho_id = $3',
        [id, pai_id, filho_id]
      );
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada ou não pertence ao usuário' });
      }

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

      const tarefaExistente = await client.query('SELECT id, filho_id FROM tarefas_automaticas WHERE id = $1', [id]);
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const filhoId = tarefaExistente.rows[0].filho_id;

      await client.query('DELETE FROM tarefas_automaticas WHERE id = $1', [id]);

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

      const tarefaExistente = await client.query('SELECT id, filho_id FROM tarefas_automaticas WHERE id = $1', [id]);
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const filhoId = tarefaExistente.rows[0].filho_id;

      const result = await client.query(
        'UPDATE tarefas_automaticas SET ativo = $1 WHERE id = $2 RETURNING id',
        [ativo, id]
      );

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

      if (!tarefa.ativo) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tarefa automática está desativada' });
      }

      if (hoje < dataInicio || hoje > dataFim) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tarefa automática fora do período válido' });
      }

      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas WHERE filho_id = $1 AND descricao = $2 AND DATE(data_criacao) = CURRENT_DATE',
        [tarefa.filho_id, tarefa.descricao]
      );

      if (tarefaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma tarefa com essa descrição para hoje' });
      }

      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [tarefa.filho_id, tarefa.descricao, tarefa.valor, 'pendente']
      );

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

      const tarefaOriginalResult = await client.query(
        'SELECT pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, ativo FROM tarefas_automaticas WHERE id = $1',
        [id]
      );

      if (tarefaOriginalResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada' });
      }

      const tarefaOriginal = tarefaOriginalResult.rows[0];

      const filhoExists = await client.query(
        'SELECT id FROM filhos WHERE id = $1 AND pai_id = $2',
        [filho_id, tarefaOriginal.pai_id]
      );

      if (filhoExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança destino não encontrada ou não pertence ao responsável' });
      }

      const tarefaDuplicada = await client.query(
        'SELECT id FROM tarefas_automaticas WHERE pai_id = $1 AND filho_id = $2 AND descricao = $3 AND data_inicio = $4 AND data_fim = $5',
        [tarefaOriginal.pai_id, filho_id, tarefaOriginal.descricao, tarefaOriginal.data_inicio, tarefaOriginal.data_fim]
      );

      if (tarefaDuplicada.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma tarefa automática idêntica para esta criança' });
      }

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
    console.error('Erro ao clonar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao clonar tarefa automática', details: error.message });
  }
});

// Endpoint para criar missões diárias para 15 dias
router.post('/missoes-diarias/criar', async (req, res) => {
  console.log('Requisição recebida em /missoes-diarias/criar:', req.body);
  const { pai_id, filho_id, tipo, meta, recompensa, dias } = req.body;

  try {
    if (!pai_id || !filho_id || !tipo || !meta || !recompensa || !dias || dias.length > 15) {
      console.log('Dados inválidos:', { pai_id, filho_id, tipo, meta, recompensa, dias });
      return res.status(400).json({ error: 'Dados inválidos ou mais de 15 dias selecionados' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      for (const dia of dias) {
        const dataCriacao = new Date(dia);
        const dataExpiracao = new Date(dataCriacao);
        dataExpiracao.setDate(dataExpiracao.getDate() + 1);

        await client.query(
          `INSERT INTO missoes_diarias (filho_id, tipo, meta, progresso, recompensa, status, data_criacao, data_expiracao)
           VALUES ($1, $2, $3, 0, $4, 'pendente', $5, $6)
           ON CONFLICT (filho_id, tipo, data_criacao) DO NOTHING`,
          [filho_id, tipo, meta, recompensa, dataCriacao, dataExpiracao]
        );
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'Missões diárias criadas com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao criar missões diárias:', error.stack);
    res.status(500).json({ error: 'Erro ao criar missões diárias', details: error.message });
  }
});

// Endpoint para buscar missões diárias
router.get('/missao-diaria/:filho_id', async (req, res) => {
  console.log('Requisição recebida em /missao-diaria:', req.params.filho_id);
  const { filho_id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT * FROM missoes_diarias WHERE filho_id = $1 AND data_criacao >= CURRENT_DATE`,
        [filho_id]
      );
      res.status(200).json({ missoes: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao buscar missões diárias:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar missões diárias', details: error.message });
  }
});

// Endpoint para criar troféu diário
router.post('/trofeus-diarios', async (req, res) => {
  console.log('Requisição recebida em /trofeus-diarios:', req.body);
  const { filho_id, icone, nome } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `INSERT INTO trofeus_diarios (filho_id, data, icone, nome)
         VALUES ($1, CURRENT_DATE, $2, $3)
         RETURNING id`,
        [filho_id, icone, nome]
      );
      res.status(200).json({ message: 'Troféu diário registrado!', trofeuId: result.rows[0].id });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao registrar troféu diário:', error.stack);
    res.status(500).json({ error: 'Erro ao registrar troféu diário', details: error.message });
  }
});

// Endpoint para buscar troféus diários
router.get('/trofeus-diarios/:filho_id', async (req, res) => {
  console.log('Requisição recebida em /trofeus-diarios:', req.params.filho_id);
  const { filho_id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT * FROM trofeus_diarios WHERE filho_id = $1 AND data >= CURRENT_DATE - INTERVAL '7 days'`,
        [filho_id]
      );
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
    if (!filho_id || !nome || !valor_total || valor_total <= 0) {
      console.log('Dados inválidos:', { filho_id, nome, valor_total });
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `INSERT INTO objetivos (filho_id, nome, valor_total, valor_atual, data_criacao, status)
         VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, 'pendente')
         RETURNING *`,
        [filho_id, nome, valor_total]
      );
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
    if (!nome || !valor_total || valor_total <= 0 || !filho_id) {
      console.log('Dados inválidos:', { nome, valor_total, filho_id });
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `UPDATE objetivos SET nome = $1, valor_total = $2 WHERE id = $3 AND filho_id = $4 RETURNING *`,
        [nome, valor_total, id, filho_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Objetivo não encontrado' });
      }

      res.status(200).json({ objetivo: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao atualizar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao atualizar objetivo', details: error.message });
  }
});

// Endpoint para buscar objetivo
router.get('/objetivo/:filho_id', async (req, res) => {
  console.log('Requisição recebida em /objetivo:', req.params.filho_id);
  const { filho_id } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT * FROM objetivos WHERE filho_id = $1 AND status = 'pendente' LIMIT 1`,
        [filho_id]
      );
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
    if (!filho_id || !valor_penalidade || valor_penalidade <= 0) {
      console.log('Dados inválidos:', { filho_id, valor_penalidade });
      return res.status(400).json({ error: 'Filho ID e valor da penalidade são obrigatórios e devem ser válidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `UPDATE objetivos 
         SET valor_atual = GREATEST(valor_atual - $1, 0) 
         WHERE filho_id = $2 AND status = 'pendente' 
         RETURNING *`,
        [valor_penalidade, filho_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Nenhum objetivo pendente encontrado para esta criança' });
      }

      if (result.rows[0].valor_atual >= result.rows[0].valor_total) {
        await client.query(
          `UPDATE objetivos 
           SET status = 'concluido', data_conclusao = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [result.rows[0].id]
        );
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [filho_id, `Você alcançou seu objetivo "${result.rows[0].nome}"! Parabéns!`, new Date()]
        );
      }

      res.status(200).json({ objetivo: result.rows[0], message: 'Progresso do objetivo atualizado' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao penalizar objetivo:', error.stack);
    res.status(500).json({ error: 'Erro ao penalizar objetivo', details: error.message });
  }
});

// Endpoint para listar conquistas de uma criança
router.get('/conquistas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /conquistas:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT id, data, icone, nome
         FROM trofeus_diarios
         WHERE filho_id = $1
         ORDER BY data DESC`,
        [filhoId]
      );
      res.status(200).json({ conquistas: result.rows });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar conquistas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar conquistas', details: error.message });
  }
});

module.exports = router;