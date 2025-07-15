const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const cron = require('node-cron');

// Tarefa agendada para limpar tarefas antigas diariamente
cron.schedule('0 0 * * *', async () => {
  console.log('Executando limpeza de tarefas antigas:', new Date().toISOString());
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    await client.query('BEGIN');

    // Excluir tarefas pendentes ou concluídas pelo filho com mais de 24 horas,
    // exceto aquelas vinculadas a tarefas automáticas ativas
    const deletedTarefas = await client.query(`
      DELETE FROM tarefas
      WHERE status IN ($1, $2)
      AND data_criacao < CURRENT_TIMESTAMP - INTERVAL '1 day'
      AND (tarefa_automatica_id IS NULL OR 
           tarefa_automatica_id NOT IN (
             SELECT id FROM tarefas_automaticas WHERE data_fim >= CURRENT_DATE
           ))
      RETURNING id, filho_id, descricao
    `, ['pendente', 'concluida_pelo_filho']);

    // Notificar exclusão de tarefas
    for (const tarefa of deletedTarefas.rows) {
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [tarefa.filho_id, `Tarefa "${tarefa.descricao}" expirou e foi removida.`, new Date()]
      );
    }

    await client.query('COMMIT');
    console.log('Limpeza de tarefas antigas concluída com sucesso:', deletedTarefas.rows.length, 'tarefas removidas.');
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro na limpeza agendada:', error.stack);
  } finally {
    if (client) client.release();
  }
});

// Endpoint para cadastrar tarefa
router.post('/tarefa', async (req, res) => {
  console.log('Requisição recebida em /tarefa:', req.body);
  const { filho_id, descricao, valor } = req.body;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!filho_id || !descricao || valor === undefined || isNaN(parseFloat(valor))) {
      console.log('Dados da tarefa incompletos ou valor inválido:', { filho_id, descricao, valor });
      return res.status(400).json({ error: 'Dados da tarefa incompletos ou valor inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      await client.query('BEGIN');

      const filhoResult = await client.query('SELECT id, pai_id FROM filhos WHERE id = $1', [parseInt(filho_id)]);
      if (filhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança não encontrada' });
      }
      const pai_id = filhoResult.rows[0].pai_id;

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      if (saldoPai < parseFloat(valor)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a tarefa' });
      }

      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status, data_criacao, tarefa_automatica_id) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, NULL) RETURNING id',
        [parseInt(filho_id), descricao, parseFloat(valor), 'pendente']
      );

      // Atualizar progresso de missões relacionadas a tarefas
      await client.query(
        `UPDATE missoes_personalizadas 
         SET progresso = progresso + 1 
         WHERE filho_id = $1 
         AND tipo = 'tarefas' 
         AND status = $2`,
        [parseInt(filho_id), 'pendente']
      );

      const missaoResult = await client.query(
        `SELECT id, progresso, meta, recompensa 
         FROM missoes_personalizadas 
         WHERE filho_id = $1 
         AND tipo = 'tarefas' 
         AND status = $2`,
        [parseInt(filho_id), 'pendente']
      );

      if (missaoResult.rows.length > 0 && missaoResult.rows[0].progresso >= missaoResult.rows[0].meta) {
        await client.query(
          `UPDATE missoes_personalizadas 
           SET status = 'aprovada' 
           WHERE id = $1`,
          [missaoResult.rows[0].id]
        );

        const contaPaiResult = await client.query(
          'SELECT id, saldo FROM contas WHERE pai_id = $1',
          [pai_id]
        );
        if (contaPaiResult.rows.length > 0 && contaPaiResult.rows[0].saldo >= missaoResult.rows[0].recompensa) {
          const contaId = contaPaiResult.rows[0].id;
          await client.query(
            'UPDATE contas SET saldo = saldo - $1 WHERE id = $2',
            [missaoResult.rows[0].recompensa, contaId]
          );
          await client.query(
            'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
            [missaoResult.rows[0].recompensa, parseInt(filho_id)]
          );
          await client.query(
            'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
            [contaId, 'transferencia', missaoResult.rows[0].recompensa, `Recompensa por missão personalizada de tarefas`, 'missao_personalizada']
          );
          await client.query(
            'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
            [parseInt(filho_id), `Você completou a missão personalizada de tarefas e ganhou R$ ${missaoResult.rows[0].recompensa.toFixed(2)}!`, new Date()]
          );
        }
      }

      // Atualizar progresso de objetivos
      if (result.rows.length > 0) {
        await client.query(
          `UPDATE objetivos 
           SET valor_atual = GREATEST(0, LEAST(valor_atual + $1, valor_total)) 
           WHERE filho_id = $2 AND status = 'pendente'`,
          [parseFloat(valor), parseInt(filho_id)]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ tarefa: result.rows[0], message: 'Tarefa cadastrada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
  const { hoje } = req.query;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const queryText = hoje === 'true'
        ? `SELECT id, descricao, status, valor, data_criacao
           FROM tarefas WHERE filho_id = $1 AND status IN ($2, $3) AND DATE(data_criacao) = CURRENT_DATE
           ORDER BY data_criacao DESC`
        : `SELECT id, descricao, status, valor, data_criacao
           FROM tarefas WHERE filho_id = $1 AND status IN ($2, $3)
           ORDER BY data_criacao DESC`;
      const result = await client.query(queryText, [parseInt(filhoId), 'pendente', 'concluida_pelo_filho']);
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
  const { hoje } = req.query;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const queryText = hoje === 'true'
        ? `SELECT t.id, t.filho_id, t.descricao, t.valor, t.status, t.data_criacao, f.nome_completo
           FROM tarefas t JOIN filhos f ON t.filho_id = f.id
           WHERE f.pai_id = $1 AND DATE(t.data_criacao) = CURRENT_DATE
           ORDER BY t.status, t.data_criacao DESC`
        : `SELECT t.id, t.filho_id, t.descricao, t.valor, t.status, t.data_criacao, f.nome_completo
           FROM tarefas t JOIN filhos f ON t.filho_id = f.id
           WHERE f.pai_id = $1
           ORDER BY t.status, t.data_criacao DESC`;
      const result = await client.query(queryText, [parseInt(paiId)]);
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    if (!pai_id || !filho_id) {
      console.log('ID do responsável e da criança são obrigatórios');
      return res.status(400).json({ error: 'ID do responsável e da criança são obrigatórios' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const tarefaResult = await client.query('SELECT valor, status FROM tarefas WHERE id = $1 AND filho_id = $2', [tarefaId, parseInt(filho_id)]);
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

    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [parseInt(pai_id)]);
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
    await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valorTarefa, parseInt(pai_id)]);
    await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorTarefa, parseInt(filho_id)]);
    await client.query(
      `UPDATE objetivos 
       SET valor_atual = GREATEST(0, LEAST(valor_atual + $1, valor_total)) 
       WHERE filho_id = $2 AND status = 'pendente'`,
      [valorTarefa, parseInt(filho_id)]
    );
    const result = await client.query(
      'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [contaId, 'transferencia', valorTarefa, `Recompensa por tarefa ${tarefaId}`, 'tarefa']
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [parseInt(filho_id), `Sua tarefa foi aprovada! Você ganhou R$ ${valorTarefa.toFixed(2)}.`, new Date()]
    );

    const conquistaResult = await client.query(
      `SELECT id FROM conquistas WHERE filho_id = $1 AND nome = $2`,
      [parseInt(filho_id), 'Primeira Tarefa Concluída']
    );
    if (conquistaResult.rows.length === 0) {
      await client.query(
        `INSERT INTO conquistas (filho_id, nome, descricao, icone, recompensa) 
         VALUES ($1, $2, $3, $4, $5)`,
        [parseInt(filho_id), 'Primeira Tarefa Concluída', 'Você concluiu sua primeira tarefa!', 'trofeu1.png', 0.50]
      );
      if (saldoPai >= 0.50) {
        await client.query(
          'UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2',
          [0.50, parseInt(pai_id)]
        );
        await client.query(
          'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
          [0.50, parseInt(filho_id)]
        );
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
          [contaId, 'transferencia', 0.50, `Recompensa por conquista: Primeira Tarefa Concluída`, 'conquista']
        );
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [parseInt(filho_id), `Você desbloqueou a conquista "Primeira Tarefa Concluída" e ganhou R$ 0.50!`, new Date()]
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const tarefaResult = await client.query('SELECT id, filho_id FROM tarefas WHERE id = $1 AND status = $2', [tarefaId, 'pendente']);
      if (tarefaResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tarefa não encontrada ou não está pendente' });
      }
      const filho_id = tarefaResult.rows[0].filho_id;

      const result = await client.query('UPDATE tarefas SET status = $1 WHERE id = $2 RETURNING id', ['concluida_pelo_filho', tarefaId]);
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, 'Tarefa marcada como concluída! Aguardando aprovação do responsável.', new Date()]
      );
      res.status(200).json({ message: 'Tarefa marcada como concluída!' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao marcar tarefa como concluída:', error.stack);
    res.status(500).json({ error: 'Erro ao marcar tarefa', details: error.message });
  }
});

// Endpoint para criar tarefa automática
router.post('/tarefas-automaticas', async (req, res) => {
  console.log('Requisição recebida em /tarefas-automaticas:', req.body);
  const { pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim } = req.body;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
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

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [parseInt(pai_id)]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a tarefa' });
      }

      const result = await client.query(
        'INSERT INTO tarefas_automaticas (pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [parseInt(pai_id), parseInt(filho_id), descricao, parseFloat(valor), `{${dias_semana.join(',')}}`, data_inicio, data_fim, true]
      );

      // Criar tarefa imediatamente, vinculando à tarefa automática
      const tarefaResult = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status, data_criacao, tarefa_automatica_id) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5) RETURNING id',
        [parseInt(filho_id), descricao, parseFloat(valor), 'pendente', result.rows[0].id]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Nova tarefa automática aplicada: ${descricao} (R$ ${parseFloat(valor).toFixed(2)})`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ tarefa_automatica: result.rows[0], message: 'Tarefa automática configurada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Excluir tarefas automáticas vencidas e suas tarefas associadas
      const tarefasVencidas = await client.query(
        'SELECT ta.id, ta.filho_id FROM tarefas_automaticas ta WHERE ta.pai_id = $1 AND ta.data_fim < CURRENT_DATE - INTERVAL \'1 day\'',
        [parseInt(paiId)]
      );

      for (const tarefa of tarefasVencidas.rows) {
        // Remover tarefas associadas na tabela tarefas
        await client.query(
          'DELETE FROM tarefas WHERE tarefa_automatica_id = $1',
          [tarefa.id]
        );
        // Remover a tarefa automática
        await client.query('DELETE FROM tarefas_automaticas WHERE id = $1', [tarefa.id]);
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [parseInt(tarefa.filho_id), 'Uma tarefa automática expirou e foi removida com suas tarefas associadas.', new Date()]
        );
      }

      // Verificar estrutura da tabela para depuração
      const tableCheck = await client.query('SELECT column_name FROM information_schema.columns WHERE table_name = \'tarefas_automaticas\' AND table_schema = \'banco_infantil\'');
      console.log('Colunas da tabela tarefas_automaticas:', tableCheck.rows.map(row => row.column_name));

      // Listar tarefas automáticas válidas usando criado_em para ordenação
      const result = await client.query(
        'SELECT ta.id, ta.filho_id, ta.descricao, ta.valor::float, ta.dias_semana, ta.data_inicio, ta.data_fim, ta.ativo, f.nome_completo ' +
        'FROM tarefas_automaticas ta JOIN filhos f ON ta.filho_id = f.id WHERE ta.pai_id = $1 ORDER BY ta.criado_em DESC',
        [parseInt(paiId)]
      );

      await client.query('COMMIT');
      console.log('Tarefas automáticas encontradas:', result.rows);
      res.status(200).json({ tarefas_automaticas: result.rows });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao listar tarefas automáticas:', error.stack);
      res.status(500).json({ error: 'Erro ao listar tarefas automáticas', details: error.message });
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
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
        [id, parseInt(pai_id), parseInt(filho_id)]
      );
      if (tarefaExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarefa automática não encontrada ou não pertence ao usuário' });
      }

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [parseInt(pai_id)]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a tarefa' });
      }

      const result = await client.query(
        'UPDATE tarefas_automaticas SET descricao = $1, valor = $2, dias_semana = $3, data_inicio = $4, data_fim = $5, ativo = $6 WHERE id = $7 RETURNING id',
        [descricao, parseFloat(valor), `{${dias_semana.join(',')}}`, data_inicio, data_fim, true, id]
      );

      // Criar nova tarefa vinculada à tarefa automática atualizada
      await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status, data_criacao, tarefa_automatica_id) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5) RETURNING id',
        [parseInt(filho_id), descricao, parseFloat(valor), 'pendente', id]
      );

      await client.query('COMMIT');
      res.status(200).json({ tarefa_automatica: result.rows[0], message: 'Tarefa automática atualizada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
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

      // Deletar tarefas associadas primeiro
      await client.query('DELETE FROM tarefas WHERE tarefa_automatica_id = $1', [id]);

      // Agora deletar a tarefa automática
      await client.query('DELETE FROM tarefas_automaticas WHERE id = $1', [id]);

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filhoId), 'Uma tarefa automática foi cancelada pelo responsável.', new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Tarefa automática excluída com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
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
        [parseInt(filhoId), `Uma tarefa automática foi ${ativo ? 'ativada' : 'desativada'} pelo responsável.`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ tarefa_automatica: result.rows[0], message: `Tarefa automática ${ativo ? 'ativada' : 'desativada'} com sucesso!` });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
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

      // Verificar se já existe uma tarefa com a mesma descrição para o filho no mesmo dia
      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas WHERE filho_id = $1 AND descricao = $2 AND DATE(data_criacao) = CURRENT_DATE',
        [parseInt(tarefa.filho_id), tarefa.descricao]
      );

      if (tarefaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma tarefa com essa descrição para hoje' });
      }

      const result = await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status, data_criacao, tarefa_automatica_id) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5) RETURNING id',
        [parseInt(tarefa.filho_id), tarefa.descricao, parseFloat(tarefa.valor), 'pendente', id]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(tarefa.filho_id), `Nova tarefa automática aplicada: ${tarefa.descricao} (R$ ${parseFloat(tarefa.valor).toFixed(2)})`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ tarefa: result.rows[0], message: 'Tarefa aplicada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
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
        [parseInt(filho_id), parseInt(tarefaOriginal.pai_id)]
      );

      if (filhoExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Criança destino não encontrada ou não pertence ao responsável' });
      }

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [parseInt(tarefaOriginal.pai_id)]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      if (saldoPai < parseFloat(tarefaOriginal.valor)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a tarefa' });
      }

      const tarefaDuplicada = await client.query(
        'SELECT id FROM tarefas_automaticas WHERE pai_id = $1 AND filho_id = $2 AND descricao = $3 AND data_inicio = $4 AND data_fim = $5',
        [parseInt(tarefaOriginal.pai_id), parseInt(filho_id), tarefaOriginal.descricao, tarefaOriginal.data_inicio, tarefaOriginal.data_fim]
      );

      if (tarefaDuplicada.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Já existe uma tarefa automática idêntica para esta criança' });
      }

      const result = await client.query(
        'INSERT INTO tarefas_automaticas (pai_id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [
          parseInt(tarefaOriginal.pai_id),
          parseInt(filho_id),
          tarefaOriginal.descricao,
          parseFloat(tarefaOriginal.valor),
          `{${tarefaOriginal.dias_semana.join(',')}}`,
          tarefaOriginal.data_inicio,
          tarefaOriginal.data_fim,
          tarefaOriginal.ativo
        ]
      );

      // Criar tarefa imediatamente para a nova tarefa clonada
      await client.query(
        'INSERT INTO tarefas (filho_id, descricao, valor, status, data_criacao, tarefa_automatica_id) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5) RETURNING id',
        [parseInt(filho_id), tarefaOriginal.descricao, parseFloat(tarefaOriginal.valor), 'pendente', result.rows[0].id]
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Nova tarefa automática clonada: ${tarefaOriginal.descricao} (R$ ${parseFloat(tarefaOriginal.valor).toFixed(2)})`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ tarefa_automatica: result.rows[0], message: 'Tarefa automática clonada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao clonar tarefa automática:', error.stack);
    res.status(500).json({ error: 'Erro ao clonar tarefa automática', details: error.message });
  }
});

// Endpoint para monitoramento
router.get('/monitoramento/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /monitoramento:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const tarefasResult = await client.query(
        `SELECT t.id, t.descricao, t.valor, t.data_criacao as data FROM tarefas 
         WHERE t.filho_id = $1 AND t.status = $2 ORDER BY t.data_criacao DESC`,
        [parseInt(filhoId), 'aprovada']
      );

      const transacoesResult = await client.query(
        `SELECT t.id, t.tipo, t.valor, t.descricao, t.data_criacao as data FROM transacoes t JOIN contas c ON t.conta_id = c.id JOIN filhos f ON f.pai_id = c.pai_id WHERE f.id = $1 AND t.descricao LIKE '%' || f.id || '%' ORDER BY t.data_criacao DESC`,
        [parseInt(filhoId)]
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

module.exports = router;