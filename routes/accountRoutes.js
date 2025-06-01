const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Endpoint para consultar saldo do responsável
router.get('/conta/saldo/:paiId', async (req, res) => {
  console.log('Requisição recebida em /conta/saldo:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT saldo FROM contas WHERE pai_id = $1', [paiId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }
      res.status(200).json({ saldo: parseFloat(result.rows[0].saldo) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao consultar saldo:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar saldo', details: error.message });
  }
});

// Endpoint para consultar saldo da criança
router.get('/conta/saldo/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /conta/saldo/filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [filhoId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      res.status(200).json({ saldo: parseFloat(result.rows[0].saldo) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao consultar saldo da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar saldo', details: error.message });
  }
});

// Endpoint para adicionar saldo à conta do responsável
router.post('/conta/adicionar-saldo', async (req, res) => {
  console.log('Requisição recebida em /conta/adicionar-saldo:', req.body);
  const { pai_id, valor } = req.body;

  try {
    if (!pai_id || !valor || valor <= 0) {
      console.log('Dados inválidos:', { pai_id, valor });
      return res.status(400).json({ error: 'Dados inválidos: ID do responsável e valor são obrigatórios e valor deve ser maior que 0' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      // Adicionar saldo ao responsável
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);

      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'recebimento', valor, 'Adição de saldo pelo responsável', 'adicao_saldo']
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Saldo adicionado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar saldo:', error.stack);
    res.status(500).json({ error: 'Erro ao adicionar saldo', details: error.message });
  }
});

// Endpoint para transação (responsável)
router.post('/transacao', async (req, res) => {
  console.log('Requisição recebida em /transacao:', req.body);
  const { conta_id, tipo, valor, descricao } = req.body;

  try {
    if (!conta_id || !tipo || !valor || !['transferencia', 'recebimento'].includes(tipo)) {
      console.log('Dados da transação incompletos ou inválidos');
      return res.status(400).json({ error: 'Dados da transação incompletos ou inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');
      const valorAtualizado = tipo === 'transferencia' ? -valor : valor;
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE id = $2', [valorAtualizado, conta_id]);
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [conta_id, tipo, valor, descricao, 'manual']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transação realizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transação:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transação', details: error.message });
  }
});

// Endpoint para transferência responsável -> criança
router.post('/transferencia', async (req, res) => {
  console.log('Requisição recebida em /transferencia:', req.body);
  const { pai_id, filho_id, valor, descricao } = req.body;

  try {
    if (!pai_id || !filho_id || !valor) {
      console.log('Dados da transferência incompletos');
      return res.status(400).json({ error: 'Dados da transferência incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      // Adicionar à criança
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valor, filho_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'transferencia', valor, descricao || `Transferência para criança ${filho_id}`, 'transferencia']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transferência realizada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transferência:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência', details: error.message });
  }
});

// Endpoint para transferência externa via Pix
router.post('/transferencia/externa', async (req, res) => {
  console.log('Requisição recebida em /transferencia/externa:', req.body);
  const { pai_id, chave_pix, valor, descricao } = req.body;

  try {
    if (!pai_id || !chave_pix || !valor) {
      console.log('Dados da transferência incompleta');
      return res.status(400).json({ error: 'Dados da transferência incompleta: ID do responsável, chave PIX e valor são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      // Verificar saldo suficiente
      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'pix_externo', valor, descricao || `Pix para ${chave_pix}`, 'pix_externo']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Pix enviado com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na transferência externa:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência externa', details: error.message });
  }
});

// Endpoint para penalizar criança (remover dinheiro)
router.post('/penalizar', async (req, res) => {
  console.log('Requisição recebida em /penalizar:', req.body);
  const { pai_id, filho_id, valor, motivo } = req.body;

  try {
    if (!pai_id || !filho_id || !valor || !motivo) {
      console.log('Dados da penalidade incompletos');
      return res.status(400).json({ error: 'Dados da penalidade incompletos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar saldo da criança
      const contaFilhoResult = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [filho_id]);
      if (contaFilhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      const saldoFilho = parseFloat(contaFilhoResult.rows[0].saldo);

      if (saldoFilho < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente na criança para a penalidade' });
      }

      // Buscar a conta do responsável
      const contaPaiResult = await client.query('SELECT id FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      // Deduzir da criança
      await client.query('UPDATE contas_filhos SET saldo = saldo - $1 WHERE filho_id = $2', [valor, filho_id]);
      // Adicionar ao responsável
      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);
      // Registrar transação
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'penalidade', valor, `Penalidade para criança ${filho_id}: ${motivo}`, 'penalidade']
      );

      // Adicionar notificação para a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você foi penalizado pelo seu responsável e perdeu R$ ${valor.toFixed(2)}. Motivo: ${motivo}`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Penalidade aplicada com sucesso!' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro na penalidade:', error.stack);
    res.status(500).json({ error: 'Erro ao aplicar penalidade', details: error.message });
  }
});

// Endpoint para histórico de transações do pai
router.get('/transacoes/historico/pai/:paiId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/historico/pai:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT t.id, t.conta_id, t.tipo, t.valor, t.descricao, t.data_criacao, t.origem, f.nome_completo
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         LEFT JOIN filhos f ON t.descricao LIKE '%' || f.id || '%'
         WHERE c.pai_id = $1
         ORDER BY t.data_criacao DESC
         LIMIT 50`,
        [paiId]
      );
      res.status(200).json({
        transacoes: result.rows.map(t => ({
          id: t.id,
          tipo: t.tipo,
          valor: parseFloat(t.valor),
          descricao: t.descricao,
          origem: t.origem,
          crianca_nome: t.nome_completo || 'N/A',
          data_criacao: t.data_criacao
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar transações do pai:', error.stack);
    res.status(500).json({ error: 'Erro ao listar transações', details: error.message });
  }
});

// Endpoint para histórico de transações da criança
router.get('/transacoes/historico/filho/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/historico/filho:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT t.id, t.conta_id, t.tipo, t.valor, t.descricao, t.data_criacao, t.origem
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         JOIN filhos f ON f.pai_id = c.pai_id
         WHERE f.id = $1 AND t.descricao LIKE '%' || f.id || '%'
         ORDER BY t.data_criacao DESC
         LIMIT 50`,
        [filhoId]
      );
      res.status(200).json({
        transacoes: result.rows.map(t => ({
          id: t.id,
          tipo: t.tipo,
          valor: parseFloat(t.valor),
          descricao: t.descricao,
          origem: t.origem,
          data_criacao: t.data_criacao
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar transações da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao listar transações', details: error.message });
  }
});

// Endpoint para transações de tarefas
router.get('/transacoes/tarefas/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/tarefas:', req.params.filhoId);
  const { filhoId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT t.id, t.descricao, t.valor, t.data_criacao as data
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         JOIN filhos f ON f.pai_id = c.pai_id
         WHERE f.id = $1 AND t.origem = $2
         ORDER BY t.data_criacao DESC
         LIMIT 7`,
        [filhoId, 'tarefa']
      );
      const total = result.rows.reduce((sum, t) => sum + parseFloat(t.valor), 0);
      res.status(200).json({
        transacoes: result.rows.map(t => ({ ...t, valor: parseFloat(t.valor) })),
        total
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao listar transações de tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao listar transações', details: error.message });
  }
});

// Endpoint para total de tarefas do pai
router.get('/transacoes/tarefas/pai/:paiId', async (req, res) => {
  console.log('Requisição recebida em /transacoes/tarefas/pai:', req.params.paiId);
  const { paiId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO banco_infantil');
      const result = await client.query(
        `SELECT COALESCE(SUM(t.valor), 0) as total
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         WHERE c.pai_id = $1 AND t.origem = $2`,
        [paiId, 'tarefa']
      );
      res.status(200).json({ total: parseFloat(result.rows[0].total) });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao calcular total de tarefas:', error.stack);
    res.status(500).json({ error: 'Erro ao calcular total', details: error.message });
  }
});

// Endpoint para registrar vitória no campo minado
router.post('/jogo/campo-minado/vitoria', async (req, res) => {
  console.log('Requisição recebida em /jogo/campo-minado/vitoria:', req.body);
  const { filho_id, pai_id } = req.body;

  try {
    if (!filho_id || !pai_id) {
      console.log('Dados incompletos:', { filho_id, pai_id });
      return res.status(400).json({ error: 'ID da criança e do responsável são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      const recompensa = 0.10;

      if (saldoPai < recompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para conceder recompensa' });
      }

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [recompensa, pai_id]);
      // Adicionar à criança
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [recompensa, filho_id]);
      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
        [contaId, 'transferencia', recompensa, 'Recompensa por vitória no Campo Minado', 'jogo_campo_minado']
      );

      // Adicionar notificação
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você ganhou R$ ${recompensa.toFixed(2)} por vencer no Campo Minado!`, new Date()]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Vitória registrada! Recompensa concedida.' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar vitória:', error.stack);
    res.status(500).json({ error: 'Erro ao registrar vitória', details: error.message });
  }
});

// Endpoint para registrar vitória no jogo da memória
router.post('/jogo/memoria/vitoria', async (req, res) => {
  console.log('Requisição recebida em /jogo/memoria/vitoria:', req.body);
  const { filho_id, pai_id } = req.body;

  try {
    if (!filho_id || !pai_id) {
      console.log('Dados incompletos:', { filho_id, pai_id });
      return res.status(400).json({ error: 'ID da criança e do responsável são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      // Verificar conta do responsável
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      const recompensa = 0.10;

      if (saldoPai < recompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para conceder recompensa' });
      }

      // Deduzir do responsável
      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [recompensa, pai_id]);
      // Adicionar à criança
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [recompensa, filho_id]);
      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
        [contaId, 'transferencia', recompensa, 'Recompensa por vitória no Jogo da Memória', 'jogo_memoria']
      );

      // Adicionar notificação
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você ganhou R$ ${recompensa.toFixed(2)} por vencer no Jogo da Memória!`, new Date()]
      );

      // Verificar conquista "Primeiro Jogo da Memória"
      const conquistaResult = await client.query(
        `SELECT id FROM conquistas WHERE filho_id = $1 AND nome = $2`,
        [filho_id, 'Primeiro Jogo da Memória']
      );
      if (conquistaResult.rows.length === 0) {
        await client.query(
          `INSERT INTO conquistas (filho_id, nome, descricao, icone, recompensa) 
           VALUES ($1, $2, $3, $4, $5)`,
          [filho_id, 'Primeiro Jogo da Memória', 'Você venceu seu primeiro Jogo da Memória!', 'trofeu2.png', 0.50]
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
            [contaId, 'transferencia', 0.50, `Recompensa por conquista: Primeiro Jogo da Memória`, 'conquista']
          );
          await client.query(
            'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
            [filho_id, `Você desbloqueou a conquista "Primeiro Jogo da Memória" e ganhou R$ 0.50!`, new Date()]
          );
        }
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'Vitória registrada! Recompensa concedida.' });
    } finally {
      client.release();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar vitória:', error.stack);
    res.status(500).json({ error: 'Erro ao registrar vitória', details: error.message });
  }
});

module.exports = router;