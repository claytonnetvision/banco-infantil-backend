const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { PERGUNTAS_EDUCACAO_FINANCEIRA } = require('../DesafiosEducacaoFinanceira');
const { PERGUNTAS_ORTOGRAFIA } = require('../DesafiosOrtografia');
const { getRandomInt, generateMathChallenge, MODELOS_DESAFIOS } = require('../DesafiosMatematicos');

require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

router.post('/conjunto', async (req, res) => {
  console.log('Requisição recebida em /desafios/conjunto:', JSON.stringify(req.body, null, 2));
  const { pai_id, filho_id, tipo_desafios, valor_recompensa } = req.body;

  let client;
  try {
    // Validação inicial
    console.log('Validando parâmetros...');
    if (!pai_id || !filho_id || !tipo_desafios || !valor_recompensa || valor_recompensa <= 0) {
      console.log('Parâmetros inválidos:', { pai_id, filho_id, tipo_desafios, valor_recompensa });
      return res.status(400).json({ error: 'Parâmetros inválidos: pai_id, filho_id, tipo_desafios e valor_recompensa são obrigatórios' });
    }

    const totalPerguntas = (tipo_desafios.educacao_financeira || 0) + (tipo_desafios.ortografia || 0);
    if (totalPerguntas !== 10) {
      console.log('Total de perguntas inválido:', { totalPerguntas });
      return res.status(400).json({ error: 'O total de perguntas deve ser exatamente 10' });
    }

    // Conexão ao banco
    console.log('Conectando ao banco de dados...');
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    // Verificar existência do pai
    console.log('Verificando pai_id:', { pai_id });
    const paiResult = await client.query('SELECT id FROM pais WHERE id = $1', [pai_id]);
    if (paiResult.rows.length === 0) {
      console.log('Pai não encontrado:', { pai_id });
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsável não encontrado' });
    }

    // Verificar existência da criança
    console.log('Verificando filho_id:', { filho_id });
    const filhoResult = await client.query('SELECT id FROM filhos WHERE id = $1 AND pai_id = $2', [filho_id, pai_id]);
    if (filhoResult.rows.length === 0) {
      console.log('Criança não encontrada ou não pertence ao pai:', { filho_id, pai_id });
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável' });
    }

    // Verificar saldo do responsável
    console.log('Verificando saldo do responsável:', { pai_id });
    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
    if (contaPaiResult.rows.length === 0) {
      console.log('Conta do responsável não encontrada:', { pai_id });
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada' });
    }
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
    if (saldoPai < valor_recompensa) {
      console.log('Saldo insuficiente:', { saldoPai, valor_recompensa });
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para criar o conjunto de desafios' });
    }

    // Verificar conjunto pendente
    console.log('Verificando conjunto pendente para criança:', { filho_id });
    const conjuntoExistente = await client.query(
      'SELECT id FROM conjuntos_desafios WHERE filho_id = $1 AND status = $2',
      [filho_id, 'pendente']
    );
    if (conjuntoExistente.rows.length > 0) {
      console.log('Conjunto pendente encontrado:', { conjuntoId: conjuntoExistente.rows[0].id });
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Já existe um conjunto de desafios pendente para esta criança' });
    }

    // Verificar importação das perguntas
    console.log('Verificando perguntas disponíveis:', {
      educacaoFinanceiraCount: PERGUNTAS_EDUCACAO_FINANCEIRA.length,
      ortografiaCount: PERGUNTAS_ORTOGRAFIA.length
    });
    if (!PERGUNTAS_EDUCACAO_FINANCEIRA.length || !PERGUNTAS_ORTOGRAFIA.length) {
      console.log('Erro: perguntas não importadas corretamente');
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Erro interno: perguntas não disponíveis' });
    }

    // Gerar perguntas
    console.log('Gerando perguntas...');
    const perguntas = [];
    let idCounter = 1;

    for (let i = 0; i < tipo_desafios.educacao_financeira; i++) {
      const pergunta = PERGUNTAS_EDUCACAO_FINANCEIRA[i % PERGUNTAS_EDUCACAO_FINANCEIRA.length];
      perguntas.push({
        id: idCounter++,
        tipo: 'educacao_financeira',
        pergunta: pergunta.pergunta,
        opcoes: pergunta.opcoes,
        resposta_correta: pergunta.resposta_correta,
        explicacao: pergunta.explicacao
      });
    }

    for (let i = 0; i < tipo_desafios.ortografia; i++) {
      const pergunta = PERGUNTAS_ORTOGRAFIA[i % PERGUNTAS_ORTOGRAFIA.length];
      perguntas.push({
        id: idCounter++,
        tipo: 'ortografia',
        pergunta: pergunta.pergunta,
        opcoes: pergunta.opcoes,
        resposta_correta: pergunta.resposta_correta,
        explicacao: pergunta.explicacao
      });
    }

    // Inserir conjunto no banco
    console.log('Inserindo conjunto no banco:', { pai_id, filho_id, valor_recompensa, perguntasCount: perguntas.length });
    const result = await client.query(
      'INSERT INTO conjuntos_desafios (pai_id, filho_id, tipos, perguntas, valor_recompensa, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [pai_id, filho_id, JSON.stringify(tipo_desafios), JSON.stringify(perguntas), valor_recompensa, 'pendente']
    );

    await client.query('COMMIT');
    console.log('Conjunto criado com sucesso:', { conjuntoId: result.rows[0].id });
    res.json({ conjunto: result.rows[0], message: 'Conjunto criado com sucesso' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao criar conjunto:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({ error: 'Erro ao criar conjunto', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/crianca/:filho_id', async (req, res) => {
  console.log('Requisição recebida em /desafios/crianca/:filho_id');
  const { filho_id } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      'SELECT * FROM conjuntos_desafios WHERE filho_id = $1 AND status = $2 LIMIT 1',
      [filho_id, 'pendente']
    );
    res.json({ conjunto: result.rows[0] || null });
  } catch (error) {
    console.error('Erro ao listar conjunto:', error.stack);
    res.status(500).json({ error: 'Erro ao listar conjunto', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/conjunto/:conjunto_id/responder', async (req, res) => {
  console.log('Requisição recebida em /desafios/conjunto/:conjunto_id/responder');
  const { conjunto_id } = req.params;
  const { filho_id, pergunta_id, resposta } = req.body;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const conjuntoResult = await client.query(
      'SELECT perguntas, valor_recompensa, pai_id FROM conjuntos_desafios WHERE id = $1 AND filho_id = $2 AND status = $3',
      [conjunto_id, filho_id, 'pendente']
    );
    if (conjuntoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conjunto não encontrado ou já concluído' });
    }
    const conjunto = conjuntoResult.rows[0];
    const pergunta = conjunto.perguntas.find(p => p.id === parseInt(pergunta_id));
    if (!pergunta) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pergunta não encontrada' });
    }

    const correta = parseInt(resposta) === pergunta.resposta_correta;
    await client.query(
      'INSERT INTO respostas_desafios (conjunto_id, crianca_id, pergunta_id, resposta, correta) VALUES ($1, $2, $3, $4, $5)',
      [conjunto_id, filho_id, pergunta_id, resposta, correta]
    );

    const respostasResult = await client.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN correta THEN 1 ELSE 0 END) as acertos FROM respostas_desafios WHERE conjunto_id = $1',
      [conjunto_id]
    );
    if (parseInt(respostasResult.rows[0].total) === 10) {
      const todosCorretos = parseInt(respostasResult.rows[0].acertos) === 10;
      if (todosCorretos) {
        await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [conjunto.valor_recompensa, conjunto.pai_id]);
        await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [conjunto.valor_recompensa, filho_id]);
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ((SELECT id FROM contas WHERE pai_id = $1), $2, $3, $4)',
          [conjunto.pai_id, 'transferencia', conjunto.valor_recompensa, `Recompensa por conjunto de desafios ${conjunto_id}`]
        );
      }
      await client.query('UPDATE conjuntos_desafios SET status = $1 WHERE id = $2', [todosCorretos ? 'concluido' : 'falhou', conjunto_id]);
    }

    await client.query('COMMIT');
    res.json({ correta, explicacao: pergunta.explicacao });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao enviar resposta:', error.stack);
    res.status(500).json({ error: 'Erro ao enviar resposta', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/historico/pai/:pai_id', async (req, res) => {
  console.log('Requisição recebida em /desafios/historico/pai/:pai_id');
  const { pai_id } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      `SELECT cd.id, cd.tipos, cd.valor_recompensa, cd.criado_em, f.nome_completo as crianca_nome,
              (SELECT COUNT(*) FROM respostas_desafios rd WHERE rd.conjunto_id = cd.id AND rd.correta) as acertos
       FROM conjuntos_desafios cd
       JOIN filhos f ON cd.filho_id = f.id
       WHERE cd.pai_id = $1
       ORDER BY cd.criado_em DESC`,
      [pai_id]
    );
    res.json({
      historico: result.rows.map(row => ({
        id: row.id,
        tipos: Object.keys(row.tipos).filter(k => row.tipos[k] > 0),
        valor_recompensa: parseFloat(row.valor_recompensa),
        crianca_nome: row.crianca_nome,
        acertos: parseInt(row.acertos),
        data_criacao: row.criado_em,
      }))
    });
  } catch (error) {
    console.error('Erro ao listar histórico do pai:', error.stack);
    res.status(500).json({ error: 'Erro ao listar histórico', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/historico/crianca/:filho_id', async (req, res) => {
  console.log('Requisição recebida em /desafios/historico/crianca/:filho_id');
  const { filho_id } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      `SELECT cd.id, cd.tipos, cd.valor_recompensa, cd.criado_em, f.nome_completo as crianca_nome,
              (SELECT COUNT(*) FROM respostas_desafios rd WHERE rd.conjunto_id = cd.id AND rd.correta) as acertos
       FROM conjuntos_desafios cd
       JOIN filhos f ON cd.filho_id = f.id
       WHERE cd.filho_id = $1
       ORDER BY cd.criado_em DESC`,
      [filho_id]
    );
    res.json({
      historico: result.rows.map(row => ({
        id: row.id,
        tipos: Object.keys(row.tipos).filter(k => row.tipos[k] > 0),
        valor_recompensa: parseFloat(row.valor_recompensa),
        crianca_nome: row.crianca_nome,
        acertos: parseInt(row.acertos),
        data_criacao: row.criado_em,
      }))
    });
  } catch (error) {
    console.error('Erro ao listar histórico da criança:', error.stack);
    res.status(500).json({ error: 'Erro ao listar histórico', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/modelos', async (req, res) => {
  console.log('Requisição recebida em /desafios/modelos');
  try {
    const modelos = Object.keys(MODELOS_DESAFIOS).map(id => ({
      id,
      name: MODELOS_DESAFIOS[id].name,
      descricao: `Soma: ${MODELOS_DESAFIOS[id].soma}, Subtração: ${MODELOS_DESAFIOS[id].subtracao}, Multiplicação: ${MODELOS_DESAFIOS[id].multiplicacao}, Divisão: ${MODELOS_DESAFIOS[id].divisao}`
    }));
    res.status(200).json({ modelos });
  } catch (error) {
    console.error('Erro ao listar modelos:', error.stack);
    res.status(500).json({ error: 'Erro ao listar modelos', details: error.message });
  }
});

router.get('/tentativas/:filhoId/:data', async (req, res) => {
  console.log('Requisição recebida em /desafios/tentativas/:filhoId/:data:', req.params);
  const { filhoId, data } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      'SELECT COUNT(*) as tentativas FROM tentativas_desafios WHERE filho_id = $1 AND DATE(data_tentativa) = $2',
      [filhoId, data]
    );
    res.status(200).json({ tentativas: parseInt(result.rows[0].tentativas) });
  } catch (error) {
    console.error('Erro ao verificar tentativas:', error.stack);
    res.status(500).json({ error: 'Erro ao verificar tentativas', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/incrementar-tentativa/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/incrementar-tentativa/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    await client.query(
      'INSERT INTO tentativas_desafios (filho_id, data_tentativa) VALUES ($1, NOW())',
      [filhoId]
    );
    res.status(200).json({ message: 'Tentativa registrada com sucesso' });
  } catch (error) {
    console.error('Erro ao incrementar tentativa:', error.stack);
    res.status(500).json({ error: 'Erro ao registrar tentativa', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/gerar/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/gerar/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;
  const { modeloId, valorTotal, paiId } = req.body;

  let client;
  try {
    if (!modeloId || !valorTotal || !paiId) {
      return res.status(400).json({ error: 'Modelo, valor total e ID do responsável são obrigatórios' });
    }

    if (!MODELOS_DESAFIOS[modeloId]) {
      return res.status(400).json({ error: 'Modelo inválido' });
    }

    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    // Verificar saldo do responsável
    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [paiId]);
    if (contaPaiResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada' });
    }
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
    if (saldoPai < valorTotal) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para criar os desafios' });
    }

    // Verificar desafios pendentes para o dia atual
    const today = new Date().toISOString().split('T')[0];
    const desafiosExistentes = await client.query(
      `SELECT COUNT(*) FROM desafios_matematicos WHERE filho_id = $1 AND DATE(data_criacao) = $2 AND status = 'pendente'`,
      [filhoId, today]
    );
    if (parseInt(desafiosExistentes.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Já existem desafios pendentes para hoje' });
    }

    const modelo = MODELOS_DESAFIOS[modeloId];
    const desafios = [];

    // Gerar desafios de soma
    for (let i = 0; i < modelo.soma; i++) {
      const num1 = getRandomInt(1, 10);
      const num2 = getRandomInt(1, 10);
      desafios.push({
        tipo: 'soma',
        pergunta: `${num1} + ${num2}`,
        respostaCorreta: num1 + num2
      });
    }

    // Gerar desafios de subtração
    for (let i = 0; i < modelo.subtracao; i++) {
      const num1 = getRandomInt(1, 10);
      const num2 = getRandomInt(1, num1);
      desafios.push({
        tipo: 'subtracao',
        pergunta: `${num1} - ${num2}`,
        respostaCorreta: num1 - num2
      });
    }

    // Gerar desafios de multiplicação
    for (let i = 0; i < modelo.multiplicacao; i++) {
      const num1 = getRandomInt(1, 10);
      const num2 = getRandomInt(1, 10);
      desafios.push({
        tipo: 'multiplicacao',
        pergunta: `${num1} × ${num2}`,
        respostaCorreta: num1 * num2
      });
    }

    // Gerar desafios de divisão
    for (let i = 0; i < modelo.divisao; i++) {
      const num2 = getRandomInt(1, 10);
      const respostaCorreta = getRandomInt(1, 10);
      const num1 = num2 * respostaCorreta;
      desafios.push({
        tipo: 'divisao',
        pergunta: `${num1} ÷ ${num2}`,
        respostaCorreta
      });
    }

    // Inserir os desafios no banco
    for (const desafio of desafios) {
      await client.query(
        'INSERT INTO desafios_matematicos (filho_id, tipo, pergunta, resposta_correta, valor, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [filhoId, desafio.tipo, desafio.pergunta, desafio.respostaCorreta, valorTotal, 'pendente']
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Desafios gerados com sucesso!' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao gerar desafios:', error.stack);
    res.status(500).json({ error: 'Erro ao gerar desafios', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const today = new Date().toISOString().split('T')[0];
    const result = await client.query(
      `SELECT id, tipo, pergunta, valor FROM desafios_matematicos WHERE filho_id = $1 AND status = 'pendente' AND DATE(data_criacao) = $2 ORDER BY id`,
      [filhoId, today]
    );
    res.status(200).json({
      desafios: result.rows.map(desafio => ({
        id: desafio.id,
        tipo: desafio.tipo,
        pergunta: desafio.pergunta,
        valor: parseFloat(desafio.valor)
      }))
    });
  } catch (error) {
    console.error('Erro ao listar desafios:', error.stack);
    res.status(500).json({ error: 'Erro ao listar desafios', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/responder/:desafioId', async (req, res) => {
  console.log('Requisição recebida em /desafio/responder/:desafioId:', req.params.desafioId);
  const { desafioId } = req.params;
  const { resposta, filhoId, paiId } = req.body;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const desafioResult = await client.query(
      'SELECT resposta_correta, valor, status FROM desafios_matematicos WHERE id = $1 AND filho_id = $2',
      [desafioId, filhoId]
    );
    if (desafioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }
    const desafio = desafioResult.rows[0];
    if (desafio.status !== 'pendente') {
      return res.status(400).json({ error: 'Desafio já foi respondido' });
    }

    const respostaCorreta = parseFloat(desafio.resposta_correta);
    const valorTotal = parseFloat(desafio.valor);
    const acertou = Math.abs(resposta - respostaCorreta) < 0.01;

    // Marcar a resposta
    await client.query('UPDATE desafios_matematicos SET status = $1 WHERE id = $2', [acertou ? 'acertado' : 'errado', desafioId]);

    // Verificar se todos os desafios foram respondidos
    const today = new Date().toISOString().split('T')[0];
    const desafiosDia = await client.query(
      `SELECT status FROM desafios_matematicos WHERE filho_id = $1 AND DATE(data_criacao) = $2`,
      [filhoId, today]
    );

    const todosRespondidos = desafiosDia.rows.length === 15 && desafiosDia.rows.every(d => d.status !== 'pendente');
    if (todosRespondidos) {
      const todosAcertados = desafiosDia.rows.every(d => d.status === 'acertado');
      if (todosAcertados) {
        // Creditar o valor total
        const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [paiId]);
        if (contaPaiResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Conta do responsável não encontrada' });
        }
        const contaId = contaPaiResult.rows[0].id;
        const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

        if (saldoPai < valorTotal) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Saldo insuficiente para recompensar o desafio' });
        }

        await client.query('BEGIN');
        await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valorTotal, paiId]);
        await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorTotal, filhoId]);
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4)',
          [contaId, 'transferencia', valorTotal, `Recompensa por completar todos os desafios matemáticos do dia`]
        );
        await client.query('COMMIT');
        res.status(200).json({ message: `Parabéns! Você acertou todos os desafios e ganhou R$ ${valorTotal.toFixed(2)}!`, acertou, todosAcertados: true });
      } else {
        res.status(200).json({ message: acertou ? 'Resposta correta! Continue respondendo.' : 'Resposta incorreta! Você não acertou todos os desafios. Tente novamente amanhã ou use outra tentativa.', acertou, todosAcertados: false });
      }
    } else {
      res.status(200).json({ message: acertou ? 'Resposta correta! Continue respondendo.' : 'Resposta incorreta! Continue respondendo as próximas perguntas.', acertou, todosAcertados: false });
    }
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao responder desafio:', error.stack);
    res.status(500).json({ error: 'Erro ao responder desafio', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/historico/matematicos/pai/:paiId', async (req, res) => {
  console.log('Requisição recebida em /desafios/historico/matematicos/pai:', req.params.paiId);
  const { paiId } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(`
      SELECT dm.id, dm.filho_id, dm.pergunta, dm.resposta_correta, dm.valor, dm.status, dm.data_criacao, f.nome_completo
      FROM desafios_matematicos dm
      JOIN filhos f ON dm.filho_id = f.id
      WHERE f.pai_id = $1
      ORDER BY dm.data_criacao DESC
      LIMIT 50
    `, [paiId]);
    const historico = result.rows.map(d => ({
      id: d.id,
      filhoId: d.filho_id,
      nomeFilho: d.nome_completo,
      pergunta: d.pergunta,
      respostaCorreta: parseFloat(d.resposta_correta),
      valor: parseFloat(d.valor),
      status: d.status,
      data: d.data_criacao
    }));
    res.status(200).json({ historico });
  } catch (error) {
    console.error('Erro ao buscar histórico de desafios:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar histórico', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = router;