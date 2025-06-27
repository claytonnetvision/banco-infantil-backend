// routes/accountRoutes.js
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
      const result = await client.query('SELECT saldo FROM contas_filhos WHERE filho_id = $1', [parseInt(filhoId)]);
      if (result.rows.length === 0) {
        // Criar conta padrão se não existir
        await client.query(
          'INSERT INTO contas_filhos (filho_id, saldo) VALUES ($1, $2) ON CONFLICT (filho_id) DO NOTHING RETURNING saldo',
          [parseInt(filhoId), 0]
        );
        return res.status(200).json({ saldo: 0 });
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

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;

      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);

      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'recebimento', valor, 'Adição de saldo pelo responsável', 'adicao_saldo']
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Saldo adicionado com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao adicionar saldo:', error.stack);
    res.status(500).json({ error: 'Erro ao adicionar saldo', details: error.message });
  }
});

// Endpoint para depositar dinheiro na conta do pai via PUT
router.put('/conta/deposito/:id', async (req, res) => {
  console.log('Requisição recebida em /conta/deposito:', req.params.id, req.body);
  const { id } = req.params;
  const { valor } = req.body;

  try {
    if (!valor || valor <= 0) {
      console.log('Valor inválido:', { valor });
      return res.status(400).json({ error: 'Valor é obrigatório e deve ser maior que 0' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const contaResult = await client.query(
        'SELECT * FROM contas WHERE id = $1 AND pai_id IS NOT NULL',
        [id]
      );
      if (contaResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      const novoSaldo = parseFloat(contaResult.rows[0].saldo) + parseFloat(valor);
      await client.query(
        'UPDATE contas SET saldo = $1 WHERE id = $2',
        [novoSaldo, id]
      );

      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [id, 'deposito', parseFloat(valor), 'Depósito manual', 'deposito']
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Depósito realizado com sucesso', saldo: novoSaldo, transacao: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao depositar:', error.stack);
    res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
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
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro na transação:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transação', details: error.message });
  }
});

// Endpoint para transferência responsável -> criança
router.post('/transferencia', async (req, res) => {
  console.log('Requisição recebida em /transferencia:', req.body);
  const { pai_id, filho_id, valor, descricao } = req.body;

  try {
    if (!pai_id || !filho_id || !valor || valor <= 0) {
      console.log('Dados da transferência incompletos');
      return res.status(400).json({ error: 'Dados da transferência incompletos ou valor inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valor, filho_id]);
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'transferencia', valor, descricao || `Transferência para criança ${filho_id}`, 'transferencia']
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você recebeu R$ ${valor.toFixed(2)} do seu responsável! ${descricao || ''}`, new Date()]
      );

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Transferência realizada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro na transferência:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência', details: error.message });
  }
});

// Endpoint para transferência externa via Pix
router.post('/transferencia/externa', async (req, res) => {
  console.log('Requisição recebida em /transferencia/externa:', req.body);
  const { pai_id, chave_pix, valor, descricao } = req.body;

  try {
    if (!pai_id || !chave_pix || !valor || valor <= 0) {
      console.log('Dados da transferência incompleta');
      return res.status(400).json({ error: 'Dados da transferência incompleta: ID do responsável, chave PIX e valor são obrigatórios' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      if (saldoPai < valor) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para a transferência' });
      }

      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaId, 'pix_externo', valor, descricao || `Pix para ${chave_pix}`, 'pix_externo']
      );
      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Pix enviado com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro na transferência externa:', error.stack);
    res.status(500).json({ error: 'Erro ao realizar transferência externa', details: error.message });
  }
});

// Endpoint para penalizar criança (remover dinheiro)
router.post('/penalizar', async (req, res) => {
  console.log('Requisição recebida em /penalizar:', req.body);
  const { pai_id, filho_id, valor, motivo } = req.body;

  try {
    if (!pai_id || !filho_id || !valor || valor <= 0 || !motivo) {
      console.log('Dados da penalidade incompletos:', { pai_id, filho_id, valor, motivo });
      return res.status(400).json({ error: 'Dados da penalidade incompletos ou inválidos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET search_path TO banco_infantil');

      const contaFilhoResult = await client.query('SELECT id, saldo FROM contas_filhos WHERE filho_id = $1', [filho_id]);
      if (contaFilhoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Conta da criança não encontrada para filho_id:', filho_id);
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      const saldoFilho = parseFloat(contaFilhoResult.rows[0].saldo);
      const contaFilhoId = contaFilhoResult.rows[0].id;
      console.log('Conta da criança encontrada:', { contaFilhoId, saldoFilho });

      if (saldoFilho < valor) {
        await client.query('ROLLBACK');
        console.log('Saldo insuficiente na criança:', { saldoFilho, valor });
        return res.status(400).json({ error: 'Saldo insuficiente na criança para a penalidade' });
      }

      const contaPaiResult = await client.query('SELECT id FROM contas WHERE pai_id = $1', [pai_id]);
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('Conta do responsável não encontrada para pai_id:', pai_id);
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const contaPaiId = contaPaiResult.rows[0].id;
      console.log('Conta do responsável encontrada:', { contaPaiId });

      await client.query('UPDATE contas_filhos SET saldo = saldo - $1 WHERE filho_id = $2', [valor, filho_id]);
      console.log('Saldo deduzido da criança:', { filho_id, valor });

      await client.query('UPDATE contas SET saldo = saldo + $1 WHERE pai_id = $2', [valor, pai_id]);
      console.log('Saldo adicionado ao responsável:', { pai_id, valor });

      console.log('Inserindo transação com contaPaiId:', contaPaiId);
      const result = await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [contaPaiId, 'penalidade', -valor, `Penalidade aplicada à criança ${filho_id}: ${motivo}`, 'penalidade']
      );
      console.log('Transação inserida:', result.rows[0]);

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você perdeu R$ ${valor.toFixed(2)} devido a uma penalidade. Motivo: ${motivo}`, new Date()]
      );
      console.log('Notificação inserida para filho_id:', filho_id);

      await client.query('COMMIT');
      res.status(201).json({ transacao: result.rows[0], message: 'Penalidade aplicada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro na penalidade:', { message: error.message, stack: error.stack });
      res.status(500).json({ error: 'Erro ao aplicar penalidade', details: error.message });
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.error('Erro na penalidade:', { message: error.message, stack: error.stack });
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
         JOIN contas_filhos cf ON t.conta_id = cf.id
         WHERE cf.filho_id = $1
         UNION
         SELECT t.id, t.conta_id, t.tipo, t.valor, t.descricao, t.data_criacao, t.origem
         FROM transacoes t
         JOIN contas c ON t.conta_id = c.id
         WHERE t.descricao LIKE '%' || $1 || '%'
         AND t.tipo = 'penalidade'
         ORDER BY data_criacao DESC
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
         JOIN contas_filhos cf ON t.conta_id = cf.id
         WHERE cf.filho_id = $1 AND t.origem = $2
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

module.exports = router;