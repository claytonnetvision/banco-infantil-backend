const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { PERGUNTAS_EDUCACAO_FINANCEIRA } = require('../DesafiosEducacaoFinanceira');
const { PERGUNTAS_ORTOGRAFIA } = require('../DesafiosOrtografia');
const { PERGUNTAS_CIENCIAS } = require('../DesafiosCiencias');
const { getRandomInt, generateMathChallenge, MODELOS_DESAFIOS } = require('../DesafiosMatematicos');

// Função para embaralhar array (Fisher-Yates)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Função para selecionar perguntas aleatórias
async function getRandomPerguntas(filho_id, tipo, quantidade, perguntasEstaticas) {
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    let disponiveis = [...perguntasEstaticas];
    console.log(`Perguntas disponíveis (${tipo}) para filho ${filho_id || 'automático'}:`, disponiveis.length);

    if (disponiveis.length < quantidade) {
      throw new Error(`Não há perguntas suficientes disponíveis para ${tipo}. Disponíveis: ${disponiveis.length}, Requeridas: ${quantidade}`);
    }

    const selecionadas = shuffleArray(disponiveis).slice(0, quantidade);
    console.log(`Perguntas selecionadas (${tipo}):`, selecionadas.map(p => p.id));

    return selecionadas;
  } catch (error) {
    console.error(`Erro ao selecionar perguntas ${tipo}:`, error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Função para buscar desafios (usada pelo Agendador.js)
async function buscarDesafios(tipoDesafios) {
  console.log('Buscando desafios automáticos:', tipoDesafios);
  const perguntas = [];

  try {
    if (tipoDesafios.educacao_financeira > 0) {
      const perguntasFinanceira = await getRandomPerguntas(
        null,
        'educacao_financeira',
        tipoDesafios.educacao_financeira,
        PERGUNTAS_EDUCACAO_FINANCEIRA
      );
      perguntasFinanceira.forEach(pergunta => {
        perguntas.push({
          id: String(pergunta.id),
          tipo: 'educacao_financeira',
          pergunta: pergunta.pergunta,
          opcoes: pergunta.opcoes,
          resposta_correta: pergunta.resposta_correta,
          explicacao: pergunta.explicacao
        });
      });
    }

    if (tipoDesafios.ortografia > 0) {
      const perguntasOrtografia = await getRandomPerguntas(
        null,
        'ortografia',
        tipoDesafios.ortografia,
        PERGUNTAS_ORTOGRAFIA
      );
      perguntasOrtografia.forEach(pergunta => {
        perguntas.push({
          id: String(pergunta.id),
          tipo: 'ortografia',
          pergunta: pergunta.pergunta,
          opcoes: pergunta.opcoes,
          resposta_correta: pergunta.resposta_correta,
          explicacao: pergunta.explicacao
        });
      });
    }

    if (tipoDesafios.ciencias > 0) {
      const perguntasCiencias = await getRandomPerguntas(
        null,
        'ciencias',
        tipoDesafios.ciencias,
        PERGUNTAS_CIENCIAS
      );
      perguntasCiencias.forEach(pergunta => {
        perguntas.push({
          id: String(pergunta.id),
          tipo: 'ciencias',
          pergunta: pergunta.pergunta,
          opcoes: pergunta.opcoes,
          resposta_correta: pergunta.resposta_correta,
          explicacao: pergunta.explicacao
        });
      });
    }

    return perguntas;
  } catch (error) {
    console.error('Erro ao buscar desafios:', error.stack);
    throw error;
  }
}

// Endpoint para gerar perguntas por tipo e quantidade
router.get('/gerar/:tipo/:quantidade', async (req, res) => {
  const { tipo, quantidade } = req.params;
  const qtd = parseInt(quantidade);

  console.log(`Requisição recebida em /desafios/gerar/${tipo}/${quantidade}`);

  if (isNaN(qtd) || qtd <= 0 || qtd > 10) {
    return res.status(400).json({ error: 'Quantidade inválida (máximo 10)' });
  }

  let perguntasEstaticas;
  switch (tipo) {
    case 'educacao_financeira':
      perguntasEstaticas = PERGUNTAS_EDUCACAO_FINANCEIRA;
      break;
    case 'ortografia':
      perguntasEstaticas = PERGUNTAS_ORTOGRAFIA;
      break;
    case 'ciencias':
      perguntasEstaticas = PERGUNTAS_CIENCIAS;
      break;
    default:
      return res.status(400).json({ error: 'Tipo de desafio inválido' });
  }

  try {
    const perguntasSelecionadas = await getRandomPerguntas(null, tipo, qtd, perguntasEstaticas);
    const formattedPerguntas = perguntasSelecionadas.map(pergunta => ({
      id: String(pergunta.id),
      tipo,
      pergunta: pergunta.pergunta,
      opcoes: pergunta.opcoes,
      resposta_correta: pergunta.resposta_correta,
      explicacao: pergunta.explicacao
    }));

    res.status(200).json({ perguntas: formattedPerguntas });
  } catch (error) {
    console.error(`Erro ao gerar perguntas para ${tipo}:`, error.stack);
    res.status(500).json({ error: 'Erro ao gerar perguntas', details: error.message });
  }
});

router.post('/conjunto', async (req, res) => {
  console.log('Requisição recebida em /desafios/conjunto:', JSON.stringify(req.body, null, 2));
  const { pai_id, filho_id, tipo_desafios, valor_recompensa } = req.body;

  let client;
  try {
    console.log('Validando parâmetros...');
    if (!pai_id || !filho_id || !tipo_desafios || !valor_recompensa || valor_recompensa <= 0) {
      console.log('Parâmetros inválidos:', { pai_id, filho_id, tipo_desafios, valor_recompensa });
      return res.status(400).json({ error: 'Parâmetros inválidos: pai_id, filho_id, tipo_desafios e valor_recompensa são obrigatórios.' });
    }

    const totalPerguntas = (tipo_desafios.educacao_financeira || 0) + 
                          (tipo_desafios.ortografia || 0) + 
                          (tipo_desafios.ciencias || 0);
    if (totalPerguntas < 1) {
      console.log('Total de perguntas inválido:', { totalPerguntas });
      return res.status(400).json({ error: 'O total de perguntas deve ser pelo menos 1.' });
    }

    console.log('Conectando ao banco de dados...');
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    console.log('Verificando pai_id:', { pai_id });
    const paiResult = await client.query('SELECT id FROM pais WHERE id = $1', [pai_id]);
    if (paiResult.rows.length === 0) {
      console.log('Pai não encontrado:', { pai_id });
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsável não encontrado' });
    }

    console.log('Verificando filho_id:', { filho_id });
    const filhoResult = await client.query('SELECT id FROM filhos WHERE id = $1 AND pai_id = $2', [filho_id, pai_id]);
    if (filhoResult.rows.length === 0) {
      console.log('Criança não encontrada ou não pertence ao pai:', { filho_id, pai_id });
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Criança não encontrada ou não pertence ao responsável.' });
    }

    console.log('Verificando saldo do responsável:', { pai_id });
    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
    if (contaPaiResult.rows.length === 0) {
      console.log('Conta do responsável não encontrada:', { pai_id });
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada.' });
    }
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
    if (saldoPai < valor_recompensa) {
      console.log('Saldo insuficiente:', { saldoPai, valor_recompensa });
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para criar o conjunto de desafios.' });
    }

    console.log('Gerando perguntas...');
    const perguntas = [];

    if (tipo_desafios.educacao_financeira > 0) {
      const perguntasFinanceira = await getRandomPerguntas(
        filho_id,
        'educacao_financeira',
        tipo_desafios.educacao_financeira,
        PERGUNTAS_EDUCACAO_FINANCEIRA
      );
      perguntasFinanceira.forEach(pergunta => {
        perguntas.push({
          id: String(pergunta.id),
          tipo: 'educacao_financeira',
          pergunta: pergunta.pergunta,
          opcoes: pergunta.opcoes,
          resposta_correta: pergunta.resposta_correta,
          explicacao: pergunta.explicacao
        });
      });
    }

    if (tipo_desafios.ortografia > 0) {
      const perguntasOrtografia = await getRandomPerguntas(
        filho_id,
        'ortografia',
        tipo_desafios.ortografia,
        PERGUNTAS_ORTOGRAFIA
      );
      perguntasOrtografia.forEach(pergunta => {
        perguntas.push({
          id: String(pergunta.id),
          tipo: 'ortografia',
          pergunta: pergunta.pergunta,
          opcoes: pergunta.opcoes,
          resposta_correta: pergunta.resposta_correta,
          explicacao: pergunta.explicacao
        });
      });
    }

    if (tipo_desafios.ciencias > 0) {
      const perguntasCiencias = await getRandomPerguntas(
        filho_id,
        'ciencias',
        tipo_desafios.ciencias,
        PERGUNTAS_CIENCIAS
      );
      perguntasCiencias.forEach(pergunta => {
        perguntas.push({
          id: String(pergunta.id),
          tipo: 'ciencias',
          pergunta: pergunta.pergunta,
          opcoes: pergunta.opcoes,
          resposta_correta: pergunta.resposta_correta,
          explicacao: pergunta.explicacao
        });
      });
    }

    console.log('Inserindo conjunto no banco:', { pai_id, filho_id, valor_recompensa, perguntasCount: perguntas.length });
    const result = await client.query(
      'INSERT INTO conjuntos_desafios (pai_id, filho_id, tipos, perguntas, valor_recompensa, status, automatico) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [pai_id, filho_id, JSON.stringify(tipo_desafios), JSON.stringify(perguntas), valor_recompensa, 'pendente', false]
    );

    // Enviar notificação para a criança
    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filho_id, `Novo conjunto de desafios criado pelo seu responsável!`, new Date()]
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

router.post('/automatico/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/automatico/:filhoId:', req.params.filhoId);
  const { filhoId } = req.params;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const filhoResult = await client.query('SELECT id, pai_id FROM filhos WHERE id = $1', [filhoId]);
    if (filhoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Criança não encontrada.' });
    }
    const pai_id = filhoResult.rows[0].pai_id;

    const conjuntoExistente = await client.query(
      'SELECT id FROM conjuntos_desafios WHERE filho_id = $1 AND status = $2 AND automatico = true AND DATE(criado_em) = CURRENT_DATE',
      [filhoId, 'pendente']
    );
    if (conjuntoExistente.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Já existe um conjunto automático pendente para hoje.' });
    }

    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pai_id]);
    if (contaPaiResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada.' });
    }
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
    const valorRecompensa = 2.00;
    if (saldoPai < valorRecompensa) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para criar o conjunto automático.' });
    }

    const tipo_desafios = {
      educacao_financeira: 5,
      ortografia: 5,
      ciencias: 5,
      matematica: 5
    };

    const perguntas = [];

    const perguntasFinanceira = await getRandomPerguntas(
      filhoId,
      'educacao_financeira',
      tipo_desafios.educacao_financeira,
      PERGUNTAS_EDUCACAO_FINANCEIRA
    );
    perguntasFinanceira.forEach(pergunta => {
      perguntas.push({
        id: String(pergunta.id),
        tipo: 'educacao_financeira',
        pergunta: pergunta.pergunta,
        opcoes: pergunta.opcoes,
        resposta_correta: pergunta.resposta_correta,
        explicacao: pergunta.explicacao
      });
    });

    const perguntasOrtografia = await getRandomPerguntas(
      filhoId,
      'ortografia',
      tipo_desafios.ortografia,
      PERGUNTAS_ORTOGRAFIA
    );
    perguntasOrtografia.forEach(pergunta => {
      perguntas.push({
        id: String(pergunta.id),
        tipo: 'ortografia',
        pergunta: pergunta.pergunta,
        opcoes: pergunta.opcoes,
        resposta_correta: pergunta.resposta_correta,
        explicacao: pergunta.explicacao
      });
    });

    const perguntasCiencias = await getRandomPerguntas(
      filhoId,
      'ciencias',
      tipo_desafios.ciencias,
      PERGUNTAS_CIENCIAS
    );
    perguntasCiencias.forEach(pergunta => {
      perguntas.push({
        id: String(pergunta.id),
        tipo: 'ciencias',
        pergunta: pergunta.pergunta,
        opcoes: pergunta.opcoes,
        resposta_correta: pergunta.resposta_correta,
        explicacao: pergunta.explicacao
      });
    });

    for (let i = 0; i < tipo_desafios.matematica; i++) {
      const desafio = generateMathChallenge();
      perguntas.push({
        id: `math_${i + 1}`,
        tipo: 'matematica',
        pergunta: desafio.pergunta,
        opcoes: null,
        resposta_correta: desafio.respostaCorreta,
        explicacao: `A resposta correta é ${desafio.respostaCorreta}.`
      });
    }

    const result = await client.query(
      'INSERT INTO conjuntos_desafios (pai_id, filho_id, tipos, perguntas, valor_recompensa, status, automatico) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [pai_id, filhoId, JSON.stringify(tipo_desafios), JSON.stringify(perguntas), valorRecompensa, 'pendente', true]
    );

    // Enviar notificação para a criança
    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filhoId, `Novo conjunto automático de desafios disponível!`, new Date()]
    );

    await client.query('COMMIT');
    res.status(201).json({ conjunto: result.rows[0], message: 'Conjunto automático criado com sucesso' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao criar conjunto automático:', error.stack);
    res.status(500).json({ error: 'Erro ao criar conjunto automático', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/crianca/:filho_id', async (req, res) => {
  console.log('Requisição recebida em /desafios/crianca/:filho_id:', req.params.filho_id);
  const { filho_id } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      'SELECT * FROM conjuntos_desafios WHERE filho_id = $1 AND status = $2 ORDER BY criado_em DESC',
      [filho_id, 'pendente']
    );
    console.log('Conjuntos encontrados:', result.rows);
    res.json({ conjuntos: result.rows });
  } catch (error) {
    console.error('Erro ao listar conjuntos:', error.stack);
    res.status(500).json({ error: 'Erro ao listar conjuntos', details: error.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/conjunto/:conjunto_id/responder', async (req, res) => {
  console.log('Requisição recebida em /desafios/conjunto/:conjunto_id/responder:', {
    conjunto_id: req.params.conjunto_id,
    body: req.body
  });
  const { conjunto_id } = req.params;
  const { filho_id, pergunta_id, resposta } = req.body;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const conjuntoResult = await client.query(
      'SELECT id, perguntas, valor_recompensa, pai_id, automatico FROM conjuntos_desafios WHERE id = $1 AND filho_id = $2 AND status = $3',
      [conjunto_id, filho_id, 'pendente']
    );
    if (conjuntoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log('Conjunto não encontrado ou já concluído:', { conjunto_id, filho_id });
      return res.status(404).json({ error: 'Conjunto não encontrado ou já concluído' });
    }
    const conjunto = conjuntoResult.rows[0];

    const pergunta = conjunto.perguntas.find(p => String(p.id) === String(pergunta_id));
    if (!pergunta) {
      await client.query('ROLLBACK');
      console.log('Pergunta não encontrada no conjunto:', { pergunta_id, conjunto_id });
      return res.status(404).json({ error: 'Pergunta não encontrada no conjunto' });
    }

    const correta = parseInt(resposta) === parseInt(pergunta.resposta_correta);
    await client.query(
      'INSERT INTO respostas_desafios (conjunto_id, crianca_id, pergunta_id, resposta, correta, tipo) VALUES ($1, $2, $3, $4, $5, $6)',
      [conjunto_id, filho_id, String(pergunta_id), resposta, correta, pergunta.tipo]
    );

    const respostasResult = await client.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN correta THEN 1 ELSE 0 END) as acertos FROM respostas_desafios WHERE conjunto_id = $1',
      [conjunto_id]
    );
    const totalRespostas = parseInt(respostasResult.rows[0].total);
    const acertos = parseInt(respostasResult.rows[0].acertos);
    const totalPerguntas = conjunto.perguntas.length;

    let recompensa = 0;
    let status = 'pendente';
    let message = correta ? 'Resposta correta!' : `Resposta incorreta. ${pergunta.explicacao}`;

    console.log('Processando resposta:', { acertos, totalRespostas, totalPerguntas, valor_recompensa: conjunto.valor_recompensa });

    if (totalRespostas >= totalPerguntas) {
      status = acertos === totalPerguntas ? 'concluido' : 'falhou';
      if (conjunto.automatico) {
        recompensa = Math.min(Math.floor(acertos / 10) * 1.00, 2.00);
        if (recompensa > 0) {
          await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [recompensa, conjunto.pai_id]);
          await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [recompensa, filho_id]);
          await client.query(
            'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ((SELECT id FROM contas WHERE pai_id = $1), $2, $3, $4, $5)',
            [conjunto.pai_id, 'transferencia', recompensa, `Recompensa por conjunto automático ${conjunto_id}`, 'desafio_automatico']
          );
        }
      } else if (acertos === totalPerguntas) {
        recompensa = parseFloat(conjunto.valor_recompensa) || 0;
        if (recompensa > 0) {
          await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [recompensa, conjunto.pai_id]);
          await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [recompensa, filho_id]);
          await client.query(
            'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ((SELECT id FROM contas WHERE pai_id = $1), $2, $3, $4, $5)',
            [conjunto.pai_id, 'transferencia', recompensa, `Recompensa por conjunto manual ${conjunto_id}`, 'desafio_manual']
          );
        }
      }
      await client.query('UPDATE conjuntos_desafios SET status = $1 WHERE id = $2', [status, conjunto_id]);

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [filho_id, `Você ${status === 'concluido' ? 'completou' : 'não completou'} o conjunto de desafios! ${recompensa > 0 ? `Ganhou R$ ${Number(recompensa).toFixed(2)}.` : ''}`, new Date()]
      );

      message = status === 'concluido'
        ? `Parabéns, você acertou todas as perguntas!${recompensa > 0 ? ` Você ganhou R$ ${Number(recompensa).toFixed(2)}!` : ''}`
        : `Você acertou ${acertos} de ${totalPerguntas} perguntas. Tente novamente!`;
    }

    console.log('Resultado:', { recompensa, status, message });

    await client.query('COMMIT');
    res.json({ correta, explicacao: pergunta.explicacao, recompensa, status, message });
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
  console.log('Requisição recebida em /desafios/historico/pai/:pai_id:', req.params.pai_id);
  const { pai_id } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      `SELECT cd.id, cd.tipos, cd.valor_recompensa, cd.criado_em, f.nome_completo as crianca_nome,
              (SELECT COUNT(*) FROM respostas_desafios rd WHERE rd.conjunto_id = cd.id AND rd.correta) as acertos,
              cd.automatico
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
        total_perguntas: Object.values(row.tipos).reduce((a, b) => a + b, 0),
        data_criacao: row.criado_em,
        automatico: row.automatico
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
  console.log('Requisição recebida em /desafios/historico/crianca/:filho_id:', req.params.filho_id);
  const { filho_id } = req.params;

  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');
    const result = await client.query(
      `SELECT cd.id, cd.tipos, cd.valor_recompensa, cd.criado_em, f.nome_completo as crianca_nome,
              (SELECT COUNT(*) FROM respostas_desafios rd WHERE rd.conjunto_id = cd.id AND rd.correta) as acertos,
              cd.automatico
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
        total_perguntas: Object.values(row.tipos).reduce((a, b) => a + b, 0),
        data_criacao: row.criado_em,
        automatico: row.automatico
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

router.get('/historico/completo/:id', async (req, res) => {
  console.log('Requisição recebida em /desafios/historico/completo/:id:', req.params.id);
  const { id } = req.params;
  const { tipo } = req.query;

  let client;
  try {
    if (!tipo || !['pai', 'filho'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo (pai ou filho) é obrigatório' });
    }

    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    let conjuntosQuery, matematicaQuery;

    if (tipo === 'pai') {
      conjuntosQuery = `
        SELECT cd.id, cd.tipos, cd.valor_recompensa, cd.criado_em, f.nome_completo as crianca_nome,
               (SELECT COUNT(*) FROM respostas_desafios rd WHERE rd.conjunto_id = cd.id AND rd.correta) as acertos,
               cd.automatico, 'conjunto' as tipo_desafio
        FROM conjuntos_desafios cd
        JOIN filhos f ON cd.filho_id = f.id
        WHERE cd.pai_id = $1
        ORDER BY cd.criado_em DESC
        LIMIT 3
      `;
      matematicaQuery = `
        SELECT dm.id, dm.filho_id, dm.pergunta, dm.resposta_correta, dm.valor, dm.status, dm.data_criacao, f.nome_completo as crianca_nome,
               'matematica' as tipo_desafio
        FROM desafios_matematicos dm
        JOIN filhos f ON dm.filho_id = f.id
        WHERE f.pai_id = $1
        ORDER BY dm.data_criacao DESC
        LIMIT 3
      `;
    } else {
      conjuntosQuery = `
        SELECT cd.id, cd.tipos, cd.valor_recompensa, cd.criado_em, f.nome_completo as crianca_nome,
               (SELECT COUNT(*) FROM respostas_desafios rd WHERE rd.conjunto_id = cd.id AND rd.correta) as acertos,
               cd.automatico, 'conjunto' as tipo_desafio
        FROM conjuntos_desafios cd
        JOIN filhos f ON cd.filho_id = f.id
        WHERE cd.filho_id = $1
        ORDER BY cd.criado_em DESC
        LIMIT 3
      `;
      matematicaQuery = `
        SELECT dm.id, dm.filho_id, dm.pergunta, dm.resposta_correta, dm.valor, dm.status, dm.data_criacao, f.nome_completo as crianca_nome,
               'matematica' as tipo_desafio
        FROM desafios_matematicos dm
        JOIN filhos f ON dm.filho_id = f.id
        WHERE dm.filho_id = $1
        ORDER BY dm.data_criacao DESC
        LIMIT 3
      `;
    }

    const [conjuntosResult, matematicaResult] = await Promise.all([
      client.query(conjuntosQuery, [id]),
      client.query(matematicaQuery, [id])
    ]);

    console.log('Conjuntos encontrados:', conjuntosResult.rows);
    console.log('Desafios matemáticos encontrados:', matematicaResult.rows);

    const conjuntos = conjuntosResult.rows.map(row => ({
      id: row.id,
      tipo_desafio: row.tipo_desafio,
      tipos: row.tipos ? Object.keys(row.tipos).filter(k => row.tipos[k] > 0) : [],
      valor_recompensa: parseFloat(row.valor_recompensa || 0),
      crianca_nome: row.crianca_nome,
      acertos: parseInt(row.acertos || 0),
      total_perguntas: row.tipos ? Object.values(row.tipos).reduce((a, b) => a + b, 0) : 0,
      data_criacao: row.criado_em,
      automatico: row.automatico || false
    }));

    const matematica = matematicaResult.rows.map(row => ({
      id: row.id,
      tipo_desafio: row.tipo_desafio,
      pergunta: row.pergunta,
      resposta_correta: parseFloat(row.resposta_correta),
      valor_recompensa: parseFloat(row.valor || 0),
      crianca_nome: row.crianca_nome,
      status: row.status,
      data_criacao: row.data_criacao
    }));

    const historico = [...conjuntos, ...matematica]
      .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao))
      .slice(0, 3);

    res.status(200).json({ historico });
  } catch (error) {
    console.error('Erro ao buscar histórico completo:', error.stack);
    res.status(500).json({ error: 'Erro ao buscar histórico completo', details: error.message });
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
      'SELECT tentativas FROM tentativas_desafios WHERE filho_id = $1 AND data = $2',
      [filhoId, data]
    );
    const tentativas = result.rows[0]?.tentativas ?? 0;
    console.log(`Tentativas encontradas para filho ${filhoId} em ${data}: ${tentativas}`);
    res.status(200).json({ tentativas });
  } catch (error) {
    console.error('Erro ao consultar tentativas:', error.stack);
    res.status(500).json({ error: 'Erro ao consultar tentativas', details: error.message });
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
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');
    await client.query(
      `INSERT INTO tentativas_desafios (filho_id, data, tentativas)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (filho_id, data)
       DO UPDATE SET tentativas = tentativas_desafios.tentativas + 1`,
      [filhoId]
    );
    await client.query('COMMIT');
    res.status(200).json({ message: 'Tentativa registrada com sucesso' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
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
      console.log('Parâmetros obrigatórios ausentes:', { modeloId, valorTotal, paiId });
      return res.status(400).json({ error: 'Modelo, valor total e ID do responsável são obrigatórios' });
    }

    if (!MODELOS_DESAFIOS[modeloId]) {
      console.log('Modelo inválido:', { modeloId });
      return res.status(400).json({ error: 'Modelo inválido' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    console.log('Verificando saldo do responsável:', { paiId });
    const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [paiId]);
    if (contaPaiResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta do responsável não encontrada' });
    }
    const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
    if (saldoPai < valorTotal) {
      console.log('Saldo insuficiente:', { saldoPai, valorTotal });
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para criar os desafios' });
    }

    const today = new Date().toISOString().split('T')[0];
    const desafiosExistentes = await client.query(
      `SELECT COUNT(*) FROM desafios_matematicos WHERE filho_id = $1 AND DATE(data_criacao) = $2 AND status = 'pendente'`,
      [filhoId, today]
    );
    if (parseInt(desafiosExistentes.rows[0].count) > 0) {
      console.log('Desafios pendentes encontrados para hoje:', { filhoId });
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Já existem desafios pendentes para hoje' });
    }

    const modelo = MODELOS_DESAFIOS[modeloId];
    const desafios = [];

    for (let i = 0; i < modelo.soma; i++) {
      const num1 = getRandomInt(1, 10);
      const num2 = getRandomInt(1, 10);
      desafios.push({
        tipo: 'soma',
        pergunta: `${num1} + ${num2}`,
        respostaCorreta: num1 + num2
      });
    }

    for (let i = 0; i < modelo.subtracao; i++) {
      const num1 = getRandomInt(1, 10);
      const num2 = getRandomInt(1, num1);
      desafios.push({
        tipo: 'subtracao',
        pergunta: `${num1} - ${num2}`,
        respostaCorreta: num1 - num2
      });
    }

    for (let i = 0; i < modelo.multiplicacao; i++) {
      const num1 = getRandomInt(1, 10);
      const num2 = getRandomInt(1, 10);
      desafios.push({
        tipo: 'multiplicacao',
        pergunta: `${num1} × ${num2}`,
        respostaCorreta: num1 * num2
      });
    }

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

    console.log('Inserindo desafios matemáticos:', { filhoId, desafiosCount: desafios.length });
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
    await client.query('BEGIN');
    await client.query('SET search_path TO banco_infantil');

    const desafioResult = await client.query(
      'SELECT resposta_correta, valor, status FROM desafios_matematicos WHERE id = $1 AND filho_id = $2',
      [desafioId, filhoId]
    );
    if (desafioResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }
    const desafio = desafioResult.rows[0];
    if (desafio.status !== 'pendente') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Desafio já foi respondido' });
    }

    const respostaCorreta = parseFloat(desafio.resposta_correta);
    const valorTotal = parseFloat(desafio.valor);
    const acertou = Math.abs(resposta - respostaCorreta) < 0.01;

    await client.query(
      'UPDATE desafios_matematicos SET status = $1 WHERE id = $2',
      [acertou ? 'acertado' : 'errado', desafioId]
    );

    const today = new Date().toISOString().split('T')[0];
    const desafiosDia = await client.query(
      `SELECT status FROM desafios_matematicos WHERE filho_id = $1 AND DATE(data_criacao) = $2`,
      [filhoId, today]
    );

    const todosRespondidos = desafiosDia.rows.length === 15 && desafiosDia.rows.every(d => d.status !== 'pendente');
    let message = acertou ? 'Resposta correta! Continue respondendo.' : 'Resposta incorreta! Continue respondendo as próximas perguntas.';

    if (todosRespondidos) {
      const todosAcertados = desafiosDia.rows.every(d => d.status === 'acertado');
      if (todosAcertados) {
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

        await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valorTotal, paiId]);
        await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorTotal, filhoId]);
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
          [contaId, 'transferencia', valorTotal, `Recompensa por completar todos os desafios matemáticos do dia`, 'desafio_matematica']
        );

        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [filhoId, `Você completou todos os desafios matemáticos do dia e ganhou R$ ${valorTotal.toFixed(2)}!`, new Date()]
        );

        message = `Parabéns! Você acertou todos os desafios e ganhou R$ ${valorTotal.toFixed(2)}!`;
      } else {
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [filhoId, 'Você não acertou todos os desafios matemáticos. Tente novamente amanhã!', new Date()]
        );

        message = 'Você não acertou todos os desafios. Tente novamente amanhã ou use outra tentativa.';
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ message, acertou, todosAcertados: todosRespondidos && desafiosDia.rows.every(d => d.status === 'acertado') });
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
module.exports.buscarDesafios = buscarDesafios;