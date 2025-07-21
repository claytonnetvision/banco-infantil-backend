const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

// Configuração do multer para uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage: storage });

// Criar um novo desafio
router.post('/criar', async (req, res) => {
  const { pai_id, filho_id, descricao, valor_recompensa, data_exibicao } = req.body;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const paiResult = await client.query('SELECT id FROM pais WHERE id = $1', [pai_id]);
    if (paiResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsável não encontrado' });
    }

    const filhoResult = await client.query('SELECT id FROM filhos WHERE id = $1 AND pai_id = $2', [filho_id, pai_id]);
    if (filhoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
    }

    const result = await client.query(
      'INSERT INTO desafios_criativos (pai_id, filho_id, descricao, valor_recompensa, data_exibicao) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [pai_id, filho_id, descricao, parseFloat(valor_recompensa), data_exibicao]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filho_id, `Novo desafio criativo disponível: ${descricao}`, new Date()]
    );

    await client.query('COMMIT');
    res.status(201).json({ desafio: result.rows[0], message: 'Desafio criado com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao criar desafio:', error.stack);
    res.status(500).json({ error: 'Erro ao criar desafio', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Clonar um desafio
router.post('/clonar/:desafio_id', async (req, res) => {
  const { desafio_id } = req.params;
  const { data_exibicao } = req.body;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const desafioResult = await client.query(
      'SELECT pai_id, filho_id, descricao, valor_recompensa FROM desafios_criativos WHERE id = $1',
      [desafio_id]
    );
    if (desafioResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }

    const { pai_id, filho_id, descricao, valor_recompensa } = desafioResult.rows[0];
    const result = await client.query(
      'INSERT INTO desafios_criativos (pai_id, filho_id, descricao, valor_recompensa, data_exibicao, clonado_de) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [pai_id, filho_id, descricao, parseFloat(valor_recompensa), data_exibicao, desafio_id]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filho_id, `Novo desafio clonado disponível: ${descricao}`, new Date()]
    );

    await client.query('COMMIT');
    res.status(201).json({ desafio: result.rows[0], message: 'Desafio clonado com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao clonar desafio:', error.stack);
    res.status(500).json({ error: 'Erro ao clonar desafio', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Listar desafios criados pelo pai
router.get('/listar/:pai_id', async (req, res) => {
  const { pai_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const result = await client.query(
      'SELECT * FROM desafios_criativos WHERE pai_id = $1 ORDER BY data_exibicao DESC',
      [pai_id]
    );

    res.status(200).json({ desafios: result.rows });
  } catch (error) {
    console.error('Erro ao listar desafios:', error.stack);
    res.status(500).json({ error: 'Erro ao listar desafios', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Listar desafios disponíveis para a criança
router.get('/:filho_id', async (req, res) => {
  const { filho_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const result = await client.query(
      'SELECT * FROM desafios_criativos WHERE filho_id = $1 AND data_exibicao <= CURRENT_TIMESTAMP ORDER BY data_exibicao DESC',
      [filho_id]
    );

    // Garantir que valor_recompensa seja um número
    const desafios = result.rows.map(row => ({
      ...row,
      valor_recompensa: parseFloat(row.valor_recompensa) || 0
    }));

    res.status(200).json({ desafios });
  } catch (error) {
    console.error('Erro ao listar desafios para criança:', error.stack);
    res.status(500).json({ error: 'Erro ao listar desafios', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Submeter resultado (com upload de anexo)
router.post('/enviar/:desafio_id', upload.single('anexo'), async (req, res) => {
  const { desafio_id } = req.params;
  const { filho_id, texto } = req.body;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const desafioResult = await client.query(
      'SELECT pai_id, filho_id FROM desafios_criativos WHERE id = $1',
      [desafio_id]
    );
    if (desafioResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }

    const { pai_id, filho_id: desafio_filho_id } = desafioResult.rows[0];
    if (parseInt(filho_id) !== desafio_filho_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado: desafio não pertence a esta criança' });
    }

    const anexo = req.file ? `/Uploads/${req.file.filename}` : texto ? texto : null;
    if (!anexo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Anexo ou texto é obrigatório' });
    }

    const result = await client.query(
      'INSERT INTO resultados_desafios_criativos (desafio_id, filho_id, anexo) VALUES ($1, $2, $3) RETURNING *',
      [desafio_id, filho_id, anexo]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filho_id, `Você enviou um resultado para o desafio ${desafio_id}`, new Date()]
    );

    await client.query('COMMIT');
    res.status(201).json({ resultado: result.rows[0], message: 'Resultado enviado com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao enviar resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao enviar resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Aprovar resultado
router.post('/aprovar/:resultado_id', async (req, res) => {
  const { resultado_id } = req.params;
  const { pai_id, aprovado } = req.body; // Adicionado pai_id e aprovado no body

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const resultadoResult = await client.query(
      'SELECT r.desafio_id, r.filho_id, dc.valor_recompensa ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.id = $1 AND dc.pai_id = $2 AND r.status = $3',
      [parseInt(resultado_id), parseInt(pai_id), 'pendente']
    );

    if (resultadoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado ou não pertence ao pai' });
    }

    const { desafio_id, filho_id, valor_recompensa } = resultadoResult.rows[0];
    const valorRecompensa = parseFloat(valor_recompensa) || 0;
    console.log(`Aprovando resultado ${resultado_id} - valor_recompensa: ${valorRecompensa}, pai_id: ${pai_id}, filho_id: ${filho_id}`);

    if (aprovado && valorRecompensa > 0) {
      const contaPaiResult = await client.query(
        'SELECT id, saldo FROM contas WHERE pai_id = $1',
        [parseInt(pai_id)]
      );
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }

      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      console.log(`Saldo do pai ${pai_id}: ${saldoPai}`);

      if (saldoPai < valorRecompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar o resultado' });
      }

      // Debitar do pai
      const updateContaPai = await client.query(
        'UPDATE contas SET saldo = saldo - $1 WHERE id = $2 RETURNING saldo',
        [valorRecompensa, contaId]
      );
      console.log(`Saldo do pai após débito: ${updateContaPai.rows[0].saldo}`);

      // Creditar na criança
      const updateContaFilho = await client.query(
        'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2 RETURNING saldo',
        [valorRecompensa, parseInt(filho_id)]
      );
      if (updateContaFilho.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      console.log(`Saldo da criança ${filho_id} após crédito: ${updateContaFilho.rows[0].saldo}`);

      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
        [contaId, 'transferencia', valorRecompensa, `Recompensa por desafio ${resultado_id}`, 'desafio_criativo']
      );

      // Notificar a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultado_id} foi aprovado! Você ganhou R$ ${valorRecompensa.toFixed(2)}.`, new Date()]
      );
    } else if (!aprovado) {
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultado_id} foi rejeitado.`, new Date()]
      );
    }

    await client.query(
      'UPDATE banco_infantil.resultados_desafios_criativos SET status = $1 WHERE id = $2',
      [aprovado ? 'aprovado' : 'rejeitado', parseInt(resultado_id)]
    );

    await client.query('COMMIT');
    console.log(`Resultado ${resultado_id} ${aprovado ? 'aprovado' : 'rejeitado'} por pai ${pai_id}`);
    res.status(200).json({ message: `Resultado ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso!` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao aprovar/rejeitar resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar/rejeitar resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Excluir resultado
router.delete('/excluir/:resultado_id', async (req, res) => {
  const { resultado_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const resultadoResult = await client.query(
      'SELECT filho_id FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );
    if (resultadoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado' });
    }

    await client.query(
      'DELETE FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [resultadoResult.rows[0].filho_id, `Seu resultado do desafio ${resultado_id} foi excluído.`, new Date()]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Resultado excluído com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao excluir resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para listar resultados pendentes
router.get('/resultados-pendentes/:paiId', async (req, res) => {
  const { paiId } = req.params;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    // Obter os filhos do pai
    const filhosResult = await client.query(
      'SELECT id FROM filhos WHERE pai_id = $1',
      [parseInt(paiId)]
    );

    if (filhosResult.rows.length === 0) {
      return res.status(200).json({ resultados: [], message: 'Nenhum filho encontrado para este responsável.' });
    }

    const filhoIds = filhosResult.rows.map(row => row.id);
    const result = await client.query(
      'SELECT r.id, r.desafio_id, r.filho_id, r.anexo, r.data_submissao, r.status, dc.descricao AS desafio_descricao, dc.valor_recompensa ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.filho_id = ANY($1) AND r.status = $2',
      [filhoIds, 'pendente']
    );

    console.log('Resultados pendentes encontrados:', result.rows);
    res.status(200).json({ resultados: result.rows });
  } catch (error) {
    console.error('Erro ao listar resultados pendentes:', error.stack);
    res.status(500).json({ error: 'Erro ao listar resultados pendentes', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para aprovar/rejeitar resultados
router.post('/aprovar/:resultadoId', async (req, res) => {
  const { resultadoId } = req.params;
  const { pai_id, aprovado } = req.body;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }
  if (!pai_id || typeof aprovado !== 'boolean') {
    console.log('Dados incompletos:', { pai_id, aprovado });
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    await client.query('BEGIN');

    const resultado = await client.query(
      'SELECT r.id, r.filho_id, r.desafio_id, dc.valor_recompensa, dc.pai_id ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.id = $1 AND dc.pai_id = $2 AND r.status = $3',
      [parseInt(resultadoId), parseInt(pai_id), 'pendente']
    );

    if (resultado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado ou não pertence ao pai' });
    }

    const { filho_id, valor_recompensa } = resultado.rows[0];
    const valorRecompensa = parseFloat(valor_recompensa) || 0;
    console.log(`Aprovando resultado ${resultadoId} - valor_recompensa: ${valorRecompensa}, pai_id: ${pai_id}, filho_id: ${filho_id}`);

    if (aprovado && valorRecompensa > 0) {
      const contaPaiResult = await client.query(
        'SELECT id, saldo FROM contas WHERE pai_id = $1',
        [parseInt(pai_id)]
      );
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }

      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      console.log(`Saldo do pai ${pai_id}: ${saldoPai}`);

      if (saldoPai < valorRecompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar o resultado' });
      }

      // Debitar do pai
      const updateContaPai = await client.query(
        'UPDATE contas SET saldo = saldo - $1 WHERE id = $2 RETURNING saldo',
        [valorRecompensa, contaId]
      );
      console.log(`Saldo do pai após débito: ${updateContaPai.rows[0].saldo}`);

      // Creditar na criança
      const updateContaFilho = await client.query(
        'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2 RETURNING saldo',
        [valorRecompensa, parseInt(filho_id)]
      );
      if (updateContaFilho.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      console.log(`Saldo da criança ${filho_id} após crédito: ${updateContaFilho.rows[0].saldo}`);

      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem, data_transacao) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [contaId, 'transferencia', valorRecompensa, `Recompensa por desafio ${resultadoId}`, 'desafio_criativo']
      );

      // Notificar a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi aprovado! Você ganhou R$ ${valorRecompensa.toFixed(2)}.`, new Date()]
      );
    } else if (!aprovado) {
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi rejeitado.`, new Date()]
      );
    }

    await client.query(
      'UPDATE banco_infantil.resultados_desafios_criativos SET status = $1 WHERE id = $2',
      [aprovado ? 'aprovado' : 'rejeitado', parseInt(resultadoId)]
    );

    await client.query('COMMIT');
    console.log(`Resultado ${resultadoId} ${aprovado ? 'aprovado' : 'rejeitado'} por pai ${pai_id}`);
    res.status(200).json({ message: `Resultado ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso!` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao aprovar/rejeitar resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar/rejeitar resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Excluir resultado
router.delete('/excluir/:resultado_id', async (req, res) => {
  const { resultado_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const resultadoResult = await client.query(
      'SELECT filho_id FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );
    if (resultadoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado' });
    }

    await client.query(
      'DELETE FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [resultadoResult.rows[0].filho_id, `Seu resultado do desafio ${resultado_id} foi excluído.`, new Date()]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Resultado excluído com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao excluir resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para listar resultados pendentes
router.get('/resultados-pendentes/:paiId', async (req, res) => {
  const { paiId } = req.params;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    // Obter os filhos do pai
    const filhosResult = await client.query(
      'SELECT id FROM filhos WHERE pai_id = $1',
      [parseInt(paiId)]
    );

    if (filhosResult.rows.length === 0) {
      return res.status(200).json({ resultados: [], message: 'Nenhum filho encontrado para este responsável.' });
    }

    const filhoIds = filhosResult.rows.map(row => row.id);
    const result = await client.query(
      'SELECT r.id, r.desafio_id, r.filho_id, r.anexo, r.data_submissao, r.status, dc.descricao AS desafio_descricao, dc.valor_recompensa ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.filho_id = ANY($1) AND r.status = $2',
      [filhoIds, 'pendente']
    );

    console.log('Resultados pendentes encontrados:', result.rows);
    res.status(200).json({ resultados: result.rows });
  } catch (error) {
    console.error('Erro ao listar resultados pendentes:', error.stack);
    res.status(500).json({ error: 'Erro ao listar resultados pendentes', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para aprovar/rejeitar resultados
router.post('/aprovar/:resultadoId', async (req, res) => {
  const { resultadoId } = req.params;
  const { pai_id, aprovado } = req.body;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }
  if (!pai_id || typeof aprovado !== 'boolean') {
    console.log('Dados incompletos:', { pai_id, aprovado });
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    await client.query('BEGIN');

    const resultado = await client.query(
      'SELECT r.id, r.filho_id, r.desafio_id, dc.valor_recompensa, dc.pai_id ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.id = $1 AND dc.pai_id = $2 AND r.status = $3',
      [parseInt(resultadoId), parseInt(pai_id), 'pendente']
    );

    if (resultado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado ou não pertence ao pai' });
    }

    const { filho_id, valor_recompensa } = resultado.rows[0];
    const valorRecompensa = parseFloat(valor_recompensa) || 0;
    console.log(`Aprovando resultado ${resultadoId} - valor_recompensa: ${valorRecompensa}, pai_id: ${pai_id}, filho_id: ${filho_id}`);

    if (aprovado && valorRecompensa > 0) {
      const contaPaiResult = await client.query(
        'SELECT id, saldo FROM contas WHERE pai_id = $1',
        [parseInt(pai_id)]
      );
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }

      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      console.log(`Saldo do pai ${pai_id}: ${saldoPai}`);

      if (saldoPai < valorRecompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar o resultado' });
      }

      // Debitar do pai
      const updateContaPai = await client.query(
        'UPDATE contas SET saldo = saldo - $1 WHERE id = $2 RETURNING saldo',
        [valorRecompensa, contaId]
      );
      console.log(`Saldo do pai após débito: ${updateContaPai.rows[0].saldo}`);

      // Creditar na criança
      const updateContaFilho = await client.query(
        'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2 RETURNING saldo',
        [valorRecompensa, parseInt(filho_id)]
      );
      if (updateContaFilho.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      console.log(`Saldo da criança ${filho_id} após crédito: ${updateContaFilho.rows[0].saldo}`);

      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem, data_transacao) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [contaId, 'transferencia', valorRecompensa, `Recompensa por desafio ${resultadoId}`, 'desafio_criativo']
      );

      // Notificar a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi aprovado! Você ganhou R$ ${valorRecompensa.toFixed(2)}.`, new Date()]
      );
    } else if (!aprovado) {
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi rejeitado.`, new Date()]
      );
    }

    await client.query(
      'UPDATE banco_infantil.resultados_desafios_criativos SET status = $1 WHERE id = $2',
      [aprovado ? 'aprovado' : 'rejeitado', parseInt(resultadoId)]
    );

    await client.query('COMMIT');
    console.log(`Resultado ${resultadoId} ${aprovado ? 'aprovado' : 'rejeitado'} por pai ${pai_id}`);
    res.status(200).json({ message: `Resultado ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso!` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao aprovar/rejeitar resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar/rejeitar resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Excluir resultado
router.delete('/excluir/:resultado_id', async (req, res) => {
  const { resultado_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const resultadoResult = await client.query(
      'SELECT filho_id FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );
    if (resultadoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado' });
    }

    await client.query(
      'DELETE FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [resultadoResult.rows[0].filho_id, `Seu resultado do desafio ${resultado_id} foi excluído.`, new Date()]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Resultado excluído com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao excluir resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para listar resultados pendentes
router.get('/resultados-pendentes/:paiId', async (req, res) => {
  const { paiId } = req.params;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    // Obter os filhos do pai
    const filhosResult = await client.query(
      'SELECT id FROM filhos WHERE pai_id = $1',
      [parseInt(paiId)]
    );

    if (filhosResult.rows.length === 0) {
      return res.status(200).json({ resultados: [], message: 'Nenhum filho encontrado para este responsável.' });
    }

    const filhoIds = filhosResult.rows.map(row => row.id);
    const result = await client.query(
      'SELECT r.id, r.desafio_id, r.filho_id, r.anexo, r.data_submissao, r.status, dc.descricao AS desafio_descricao, dc.valor_recompensa ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.filho_id = ANY($1) AND r.status = $2',
      [filhoIds, 'pendente']
    );

    console.log('Resultados pendentes encontrados:', result.rows);
    res.status(200).json({ resultados: result.rows });
  } catch (error) {
    console.error('Erro ao listar resultados pendentes:', error.stack);
    res.status(500).json({ error: 'Erro ao listar resultados pendentes', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para aprovar/rejeitar resultados
router.post('/aprovar/:resultadoId', async (req, res) => {
  const { resultadoId } = req.params;
  const { pai_id, aprovado } = req.body;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }
  if (!pai_id || typeof aprovado !== 'boolean') {
    console.log('Dados incompletos:', { pai_id, aprovado });
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    await client.query('BEGIN');

    const resultado = await client.query(
      'SELECT r.id, r.filho_id, r.desafio_id, dc.valor_recompensa, dc.pai_id ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.id = $1 AND dc.pai_id = $2 AND r.status = $3',
      [parseInt(resultadoId), parseInt(pai_id), 'pendente']
    );

    if (resultado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado ou não pertence ao pai' });
    }

    const { filho_id, valor_recompensa } = resultado.rows[0];
    const valorRecompensa = parseFloat(valor_recompensa) || 0;
    console.log(`Aprovando resultado ${resultadoId} - valor_recompensa: ${valorRecompensa}, pai_id: ${pai_id}, filho_id: ${filho_id}`);

    if (aprovado && valorRecompensa > 0) {
      const contaPaiResult = await client.query(
        'SELECT id, saldo FROM contas WHERE pai_id = $1',
        [parseInt(pai_id)]
      );
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }

      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      console.log(`Saldo do pai ${pai_id}: ${saldoPai}`);

      if (saldoPai < valorRecompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar o resultado' });
      }

      // Debitar do pai
      const updateContaPai = await client.query(
        'UPDATE contas SET saldo = saldo - $1 WHERE id = $2 RETURNING saldo',
        [valorRecompensa, contaId]
      );
      console.log(`Saldo do pai após débito: ${updateContaPai.rows[0].saldo}`);

      // Creditar na criança
      const updateContaFilho = await client.query(
        'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2 RETURNING saldo',
        [valorRecompensa, parseInt(filho_id)]
      );
      if (updateContaFilho.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      console.log(`Saldo da criança ${filho_id} após crédito: ${updateContaFilho.rows[0].saldo}`);

      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem, data_transacao) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [contaId, 'transferencia', valorRecompensa, `Recompensa por desafio ${resultadoId}`, 'desafio_criativo']
      );

      // Notificar a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi aprovado! Você ganhou R$ ${valorRecompensa.toFixed(2)}.`, new Date()]
      );
    } else if (!aprovado) {
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi rejeitado.`, new Date()]
      );
    }

    await client.query(
      'UPDATE banco_infantil.resultados_desafios_criativos SET status = $1 WHERE id = $2',
      [aprovado ? 'aprovado' : 'rejeitado', parseInt(resultadoId)]
    );

    await client.query('COMMIT');
    console.log(`Resultado ${resultadoId} ${aprovado ? 'aprovado' : 'rejeitado'} por pai ${pai_id}`);
    res.status(200).json({ message: `Resultado ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso!` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao aprovar/rejeitar resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar/rejeitar resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Excluir resultado
router.delete('/excluir/:resultado_id', async (req, res) => {
  const { resultado_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const resultadoResult = await client.query(
      'SELECT filho_id FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );
    if (resultadoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado' });
    }

    await client.query(
      'DELETE FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [resultadoResult.rows[0].filho_id, `Seu resultado do desafio ${resultado_id} foi excluído.`, new Date()]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Resultado excluído com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao excluir resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para listar resultados pendentes
router.get('/resultados-pendentes/:paiId', async (req, res) => {
  const { paiId } = req.params;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    // Obter os filhos do pai
    const filhosResult = await client.query(
      'SELECT id FROM filhos WHERE pai_id = $1',
      [parseInt(paiId)]
    );

    if (filhosResult.rows.length === 0) {
      return res.status(200).json({ resultados: [], message: 'Nenhum filho encontrado para este responsável.' });
    }

    const filhoIds = filhosResult.rows.map(row => row.id);
    const result = await client.query(
      'SELECT r.id, r.desafio_id, r.filho_id, r.anexo, r.data_submissao, r.status, dc.descricao AS desafio_descricao, dc.valor_recompensa ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.filho_id = ANY($1) AND r.status = $2',
      [filhoIds, 'pendente']
    );

    console.log('Resultados pendentes encontrados:', result.rows);
    res.status(200).json({ resultados: result.rows });
  } catch (error) {
    console.error('Erro ao listar resultados pendentes:', error.stack);
    res.status(500).json({ error: 'Erro ao listar resultados pendentes', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Novo endpoint para aprovar/rejeitar resultados
router.post('/aprovar/:resultadoId', async (req, res) => {
  const { resultadoId } = req.params;
  const { pai_id, aprovado } = req.body;

  if (!req.headers.authorization) {
    console.log('Erro: Nenhum token de autorização fornecido');
    return res.status(401).json({ error: 'Não autorizado' });
  }
  if (!pai_id || typeof aprovado !== 'boolean') {
    console.log('Dados incompletos:', { pai_id, aprovado });
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    await client.query('BEGIN');

    const resultado = await client.query(
      'SELECT r.id, r.filho_id, r.desafio_id, dc.valor_recompensa, dc.pai_id ' +
      'FROM banco_infantil.resultados_desafios_criativos r ' +
      'JOIN banco_infantil.desafios_criativos dc ON r.desafio_id = dc.id ' +
      'WHERE r.id = $1 AND dc.pai_id = $2 AND r.status = $3',
      [parseInt(resultadoId), parseInt(pai_id), 'pendente']
    );

    if (resultado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado ou não pertence ao pai' });
    }

    const { filho_id, valor_recompensa } = resultado.rows[0];
    const valorRecompensa = parseFloat(valor_recompensa) || 0;
    console.log(`Aprovando resultado ${resultadoId} - valor_recompensa: ${valorRecompensa}, pai_id: ${pai_id}, filho_id: ${filho_id}`);

    if (aprovado && valorRecompensa > 0) {
      const contaPaiResult = await client.query(
        'SELECT id, saldo FROM contas WHERE pai_id = $1',
        [parseInt(pai_id)]
      );
      if (contaPaiResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }

      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      console.log(`Saldo do pai ${pai_id}: ${saldoPai}`);

      if (saldoPai < valorRecompensa) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Saldo insuficiente para aprovar o resultado' });
      }

      // Debitar do pai
      const updateContaPai = await client.query(
        'UPDATE contas SET saldo = saldo - $1 WHERE id = $2 RETURNING saldo',
        [valorRecompensa, contaId]
      );
      console.log(`Saldo do pai após débito: ${updateContaPai.rows[0].saldo}`);

      // Creditar na criança
      const updateContaFilho = await client.query(
        'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2 RETURNING saldo',
        [valorRecompensa, parseInt(filho_id)]
      );
      if (updateContaFilho.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta da criança não encontrada' });
      }
      console.log(`Saldo da criança ${filho_id} após crédito: ${updateContaFilho.rows[0].saldo}`);

      // Registrar transação
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem, data_transacao) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [contaId, 'transferencia', valorRecompensa, `Recompensa por desafio ${resultadoId}`, 'desafio_criativo']
      );

      // Notificar a criança
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi aprovado! Você ganhou R$ ${valorRecompensa.toFixed(2)}.`, new Date()]
      );
    } else if (!aprovado) {
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [parseInt(filho_id), `Seu desafio ${resultadoId} foi rejeitado.`, new Date()]
      );
    }

    await client.query(
      'UPDATE banco_infantil.resultados_desafios_criativos SET status = $1 WHERE id = $2',
      [aprovado ? 'aprovado' : 'rejeitado', parseInt(resultadoId)]
    );

    await client.query('COMMIT');
    console.log(`Resultado ${resultadoId} ${aprovado ? 'aprovado' : 'rejeitado'} por pai ${pai_id}`);
    res.status(200).json({ message: `Resultado ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso!` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao aprovar/rejeitar resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao aprovar/rejeitar resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// Excluir resultado
router.delete('/excluir/:resultado_id', async (req, res) => {
  const { resultado_id } = req.params;

  if (!req.headers.authorization) return res.status(401).json({ error: 'Não autorizado' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const resultadoResult = await client.query(
      'SELECT filho_id FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );
    if (resultadoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resultado não encontrado' });
    }

    await client.query(
      'DELETE FROM resultados_desafios_criativos WHERE id = $1',
      [resultado_id]
    );

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [resultadoResult.rows[0].filho_id, `Seu resultado do desafio ${resultado_id} foi excluído.`, new Date()]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Resultado excluído com sucesso' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao excluir resultado:', error.stack);
    res.status(500).json({ error: 'Erro ao excluir resultado', details: error.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;