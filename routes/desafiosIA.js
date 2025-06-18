const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { gerarPerguntas } = require('../GeminiService');

router.post('/configurar/:filhoId', async (req, res) => {
  console.log('Requisição recebida em /desafios/ia/configurar/:filhoId:', req.params.filhoId, req.body);
  let client;
  try {
    const { tipo_desafio, idade, quantidade_perguntas, remunerado, valor_recompensa, gerar_diariamente, dificuldade } = req.body;
    const { filhoId } = req.params;

    if (!['matematica', 'historia', 'portugues', 'geografia', 'educacao_financeira', 'mundo', 'conhecimentos_gerais', 'fisica_criancas'].includes(tipo_desafio)) {
      return res.status(400).json({ error: 'Tipo de desafio inválido' });
    }

    if (idade < 5 || idade > 18) {
      return res.status(400).json({ error: 'Idade deve estar entre 5 e 18 anos' });
    }

    if (quantidade_perguntas < 1 || quantidade_perguntas > 50) {
      return res.status(400).json({ error: 'Quantidade de perguntas deve estar entre 1 e 50' });
    }

    if (remunerado && (!valor_recompensa || valor_recompensa <= 0)) {
      return res.status(400).json({ error: 'Valor da recompensa deve ser maior que 0 para desafios remunerados' });
    }

    if (!['facil', 'moderado', 'dificil'].includes(dificuldade)) {
      return res.status(400).json({ error: 'Dificuldade inválida. Use: facil, moderado ou dificil' });
    }

    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const filhoResult = await client.query('SELECT pai_id FROM filhos WHERE id = $1', [filhoId]);
    if (filhoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Filho não encontrado' });
    }

    const paiId = filhoResult.rows[0].pai_id;

    if (remunerado) {
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [paiId]);
      if (contaPaiResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conta do responsável não encontrada' });
      }
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
      if (saldoPai < valor_recompensa) {
        return res.status(400).json({ error: 'Saldo insuficiente para a recompensa' });
      }
    }

    const perguntas = await gerarPerguntas({
      tipoDesafio: tipo_desafio,
      idade: parseInt(idade),
      quantidade: parseInt(quantidade_perguntas),
      dificuldade
    });

    await client.query('BEGIN');

    const desafioResult = await client.query(
      `INSERT INTO desafios_gerados_ia (pai_id, filho_id, tipo_desafio, idade, quantidade_perguntas, remunerado, valor_recompensa, gerar_diariamente, dificuldade)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [paiId, filhoId, tipo_desafio, idade, quantidade_perguntas, remunerado, valor_recompensa, gerar_diariamente, dificuldade]
    );

    const desafioId = desafioResult.rows[0].id;
    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + 1);
    dataExpiracao.setHours(0, 0, 0, 0);

    for (const pergunta of perguntas) {
      await client.query(
        `INSERT INTO perguntas_gerados_ia (desafio_id, filho_id, pergunta, opcoes, resposta_correta, explicacao, data_expiracao)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          desafioId,
          filhoId,
          pergunta.pergunta,
          JSON.stringify(pergunta.opcoes),
          pergunta.resposta_correta,
          pergunta.explicacao,
          dataExpiracao
        ]
      );
    }

    await client.query(
      'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
      [filhoId, `Novo desafio de ${tipo_desafio} (${dificuldade}) disponível!`, new Date()]
    );

    await client.query('COMMIT');

    res.status(201).json({ message: 'Desafio IA configurado com sucesso' });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao configurar desafio IA:', error);
    res.status(500).json({ error: error.message || 'Erro ao configurar desafio IA' });
  } finally {
    if (client) client.release();
  }
});

router.get('/perguntas/:filhoId', async (req, res) => {
  let client;
  try {
    const { filhoId } = req.params;
    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const perguntasResult = await client.query(
      `SELECT p.id, p.pergunta, p.opcoes, p.status, d.remunerado, d.valor_recompensa, d.dificuldade
       FROM perguntas_gerados_ia p
       JOIN desafios_gerados_ia d ON p.desafio_id = d.id
       WHERE p.filho_id = $1 AND p.status = 'pendente' AND p.data_expiracao > CURRENT_TIMESTAMP`,
      [filhoId]
    );

    res.status(200).json({ perguntas: perguntasResult.rows });
  } catch (error) {
    console.error('Erro ao listar perguntas:', error);
    res.status(500).json({ error: 'Erro ao listar perguntas' });
  } finally {
    if (client) client.release();
  }
});

router.post('/pergunta/:perguntaId/responder', async (req, res) => {
  console.log('Requisição recebida em /desafios/ia/pergunta/:perguntaId/responder:', req.params.perguntaId, req.body);
  let client;
  try {
    const { perguntaId } = req.params;
    const { filho_id, resposta } = req.body;

    if (!Number.isInteger(resposta) || resposta < 0 || resposta > 3) {
      console.log('Resposta inválida:', { resposta });
      return res.status(400).json({ error: 'Resposta inválida' });
    }

    client = await pool.connect();
    await client.query('SET search_path TO banco_infantil');

    const perguntaResult = await client.query(
      `SELECT p.resposta_correta, p.explicacao, p.opcoes, p.desafio_id, p.status, d.remunerado, d.valor_recompensa, d.pai_id, d.quantidade_perguntas
       FROM perguntas_gerados_ia p
       JOIN desafios_gerados_ia d ON p.desafio_id = d.id
       WHERE p.id = $1 AND p.filho_id = $2`,
      [perguntaId, filho_id]
    );

    if (perguntaResult.rows.length === 0) {
      console.log('Pergunta não encontrada:', { perguntaId, filho_id });
      return res.status(404).json({ error: 'Pergunta não encontrada ou não pertence ao filho' });
    }

    const pergunta = perguntaResult.rows[0];

    if (pergunta.status !== 'pendente') {
      console.log('Pergunta já respondida ou expirada:', { status: pergunta.status });
      return res.status(400).json({ error: 'Pergunta já respondida ou expirada' });
    }

    const correta = resposta === pergunta.resposta_correta;

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO respostas_perguntas_ia (pergunta_id, filho_id, resposta, correta)
       VALUES ($1, $2, $3, $4)`,
      [perguntaId, filho_id, resposta, correta]
    );

    await client.query(
      `UPDATE perguntas_gerados_ia SET status = 'respondida' WHERE id = $1`,
      [perguntaId]
    );

    let recompensa = 0;
    let desafioCompleto = false;
    let todasCorretas = true;

    // Verificar progresso do desafio
    const respostasDesafio = await client.query(
      `SELECT COUNT(*) AS total_respondidas, SUM(CASE WHEN correta THEN 1 ELSE 0 END) AS acertos
       FROM respostas_perguntas_ia r
       JOIN perguntas_gerados_ia p ON r.pergunta_id = p.id
       WHERE p.desafio_id = $1 AND p.filho_id = $2`,
      [pergunta.desafio_id, filho_id]
    );

    const totalRespondidas = parseInt(respostasDesafio.rows[0].total_respondidas);
    const acertos = parseInt(respostasDesafio.rows[0].acertos);
    const totalPerguntas = parseInt(pergunta.quantidade_perguntas);

    console.log('Progresso do desafio:', { totalRespondidas, acertos, totalPerguntas, remunerado: pergunta.remunerado, valor_recompensa: pergunta.valor_recompensa });

    if (totalRespondidas >= totalPerguntas) {
      desafioCompleto = true;
      todasCorretas = acertos === totalPerguntas;

      if (todasCorretas && pergunta.remunerado) {
        const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [pergunta.pai_id]);
        if (contaPaiResult.rows.length === 0) {
          await client.query('ROLLBACK');
          console.log('Conta do pai não encontrada:', { pai_id: pergunta.pai_id });
          return res.status(404).json({ error: 'Conta do responsável não encontrada' });
        }

        const contaPaiId = contaPaiResult.rows[0].id;
        const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
        const valorRecompensa = parseFloat(pergunta.valor_recompensa || 0);

        console.log('Verificando recompensa:', { saldoPai, valorRecompensa });

        if (valorRecompensa <= 0) {
          await client.query('ROLLBACK');
          console.log('Valor da recompensa inválido:', { valorRecompensa });
          return res.status(400).json({ error: 'Valor da recompensa inválido' });
        }

        if (saldoPai < valorRecompensa) {
          await client.query('ROLLBACK');
          console.log('Saldo insuficiente:', { saldoPai, valorRecompensa });
          return res.status(400).json({ error: 'Saldo insuficiente do responsável' });
        }

        const contaFilhoResult = await client.query('SELECT id FROM contas_filhos WHERE filho_id = $1', [filho_id]);
        if (contaFilhoResult.rows.length === 0) {
          await client.query('ROLLBACK');
          console.log('Conta da criança não encontrada:', { filho_id });
          return res.status(404).json({ error: 'Conta da criança não encontrada' });
        }

        const contaFilhoId = contaFilhoResult.rows[0].id;

        await client.query('UPDATE contas SET saldo = saldo - $1 WHERE id = $2', [valorRecompensa, contaPaiId]);
        await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valorRecompensa, filho_id]);
        await client.query(
          'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
          [contaFilhoId, 'recebimento', valorRecompensa, `Recompensa por desafio IA`, 'desafio_ia']
        );

        await client.query(
          `UPDATE objetivos 
           SET valor_atual = valor_atual + $1 
           WHERE filho_id = $2 AND status = 'pendente'`,
          [valorRecompensa, filho_id]
        );

        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [filho_id, `Você completou o desafio IA e ganhou R$ ${valorRecompensa.toFixed(2)}!`, new Date()]
        );

        recompensa = valorRecompensa;
      }
    }

    await client.query('COMMIT');

    res.status(200).json({
      message: correta ? 'Resposta correta!' : 'Resposta incorreta.',
      correta,
      resposta_correta: pergunta.resposta_correta,
      resposta_correta_texto: pergunta.opcoes[pergunta.resposta_correta].texto,
      explicacao: pergunta.explicacao,
      recompensa,
      desafio_completo: desafioCompleto,
      todas_corretas: todasCorretas,
      total_perguntas: totalPerguntas,
      acertos: acertos
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Erro ao responder pergunta:', error);
    res.status(500).json({ error: 'Erro ao responder pergunta', details: error.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;