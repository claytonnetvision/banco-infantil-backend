// backend_escola_routes.js
// Arquivo de rotas específico para funcionalidades da Escola
// Este arquivo deve ser integrado ao seu backend existente

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Middleware de autenticação para escolas
const authenticateEscola = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.tipo !== 'escola') {
      return res.status(403).json({ error: 'Acesso negado. Apenas escolas podem acessar esta funcionalidade.' });
    }
    req.escola = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// ==================== AUTENTICAÇÃO ====================

// Cadastro de Escola
router.post('/auth/escola/cadastro', async (req, res) => {
  try {
    const {
      nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep,
      diretor, telefone_diretor, email_diretor, numero_alunos, series_oferecidas
    } = req.body;

    // Verificar se a escola já existe
    const escolaExistente = await db.query(
      'SELECT id FROM escolas WHERE email = ? OR cnpj = ?',
      [email, cnpj]
    );

    if (escolaExistente.length > 0) {
      return res.status(400).json({ error: 'Escola já cadastrada com este email ou CNPJ' });
    }

    // Criptografar senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Inserir escola
    const result = await db.query(`
      INSERT INTO escolas (
        nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep,
        diretor, telefone_diretor, email_diretor, numero_alunos, status, data_cadastro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', NOW())
    `, [
      nome, email, senhaHash, telefone, cnpj, endereco, cidade, estado, cep,
      diretor, telefone_diretor, email_diretor, numero_alunos
    ]);

    const escolaId = result.insertId;

    // Inserir séries oferecidas
    if (series_oferecidas && series_oferecidas.length > 0) {
      const seriesValues = series_oferecidas.map(serie => [escolaId, serie]);
      await db.query(
        'INSERT INTO escola_series (escola_id, nome) VALUES ?',
        [seriesValues]
      );
    }

    // Gerar token
    const token = jwt.sign(
      { id: escolaId, email, tipo: 'escola', nome },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Escola cadastrada com sucesso',
      user: { id: escolaId, email, nome, tipo: 'escola' },
      token
    });

  } catch (error) {
    console.error('Erro ao cadastrar escola:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Login de Escola
router.post('/auth/escola/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    // Buscar escola
    const escola = await db.query(
      'SELECT id, nome, email, senha, status FROM escolas WHERE email = ?',
      [email]
    );

    if (escola.length === 0) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const escolaData = escola[0];

    if (escolaData.status !== 'ativo') {
      return res.status(401).json({ error: 'Conta da escola inativa. Entre em contato com o suporte.' });
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, escolaData.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Gerar token
    const token = jwt.sign(
      { id: escolaData.id, email: escolaData.email, tipo: 'escola', nome: escolaData.nome },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login realizado com sucesso',
      user: { 
        id: escolaData.id, 
        email: escolaData.email, 
        nome: escolaData.nome, 
        tipo: 'escola' 
      },
      token
    });

  } catch (error) {
    console.error('Erro ao fazer login da escola:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== DASHBOARD ====================

// Estatísticas do Dashboard
router.get('/escola/dashboard/estatisticas', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;

    const [alunos, quizzes, tarefas, mensagens] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM usuarios WHERE escola_id = ? AND tipo = "filho"', [escolaId]),
      db.query('SELECT COUNT(*) as total FROM escola_quizzes WHERE escola_id = ?', [escolaId]),
      db.query('SELECT COUNT(*) as total FROM escola_tarefas WHERE escola_id = ?', [escolaId]),
      db.query('SELECT COUNT(*) as total FROM escola_mensagens WHERE escola_id = ?', [escolaId])
    ]);

    const [quizzesPendentes, tarefasPendentes] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as total FROM escola_quiz_respostas er
        JOIN escola_quizzes eq ON er.quiz_id = eq.id
        WHERE eq.escola_id = ? AND er.status = 'pendente'
      `, [escolaId]),
      db.query(`
        SELECT COUNT(*) as total FROM escola_tarefa_entregas ete
        JOIN escola_tarefas et ON ete.tarefa_id = et.id
        WHERE et.escola_id = ? AND ete.status = 'pendente'
      `, [escolaId])
    ]);

    res.json({
      total_alunos: alunos[0].total,
      total_quizzes: quizzes[0].total,
      total_tarefas: tarefas[0].total,
      total_mensagens: mensagens[0].total,
      quizzes_pendentes: quizzesPendentes[0].total,
      tarefas_pendentes: tarefasPendentes[0].total
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atividades Recentes
router.get('/escola/dashboard/atividades-recentes', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;

    const atividades = await db.query(`
      (SELECT 'quiz' as tipo, titulo, materia, data_criacao as data, 
              (SELECT COUNT(*) FROM escola_quiz_respostas WHERE quiz_id = eq.id) as participantes
       FROM escola_quizzes eq WHERE escola_id = ?)
      UNION ALL
      (SELECT 'tarefa' as tipo, titulo, materia, data_criacao as data,
              (SELECT COUNT(*) FROM escola_tarefa_entregas WHERE tarefa_id = et.id) as participantes
       FROM escola_tarefas et WHERE escola_id = ?)
      UNION ALL
      (SELECT 'mensagem' as tipo, assunto as titulo, categoria as materia, data_envio as data,
              total_destinatarios as participantes
       FROM escola_mensagens em WHERE escola_id = ?)
      ORDER BY data DESC LIMIT 10
    `, [escolaId, escolaId, escolaId]);

    res.json({ atividades });

  } catch (error) {
    console.error('Erro ao buscar atividades recentes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== SÉRIES E ALUNOS ====================

// Listar Séries da Escola
router.get('/escola/series', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;

    const series = await db.query(`
      SELECT es.id, es.nome, COUNT(u.id) as total_alunos
      FROM escola_series es
      LEFT JOIN usuarios u ON u.serie_id = es.id AND u.tipo = 'filho'
      WHERE es.escola_id = ?
      GROUP BY es.id, es.nome
      ORDER BY es.nome
    `, [escolaId]);

    res.json({ series });

  } catch (error) {
    console.error('Erro ao buscar séries:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar Alunos
router.get('/escola/alunos', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;

    const alunos = await db.query(`
      SELECT u.id, u.nome, u.email, es.nome as serie
      FROM usuarios u
      JOIN escola_series es ON u.serie_id = es.id
      WHERE u.escola_id = ? AND u.tipo = 'filho'
      ORDER BY es.nome, u.nome
    `, [escolaId]);

    res.json({ alunos });

  } catch (error) {
    console.error('Erro ao buscar alunos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Detalhes dos Alunos (para gerenciamento)
router.get('/escola/alunos/detalhado', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;

    const alunos = await db.query(`
      SELECT 
        u.id, u.nome, u.email, u.status, u.data_cadastro,
        es.nome as serie_nome, es.id as serie_id,
        COALESCE(SUM(t.pontos), 0) as pontuacao_total,
        COUNT(DISTINCT tc.id) as tarefas_concluidas,
        COUNT(DISTINCT qr.id) as quizzes_concluidos,
        p.nome as responsavel_nome, p.email as responsavel_email, p.telefone as responsavel_telefone
      FROM usuarios u
      JOIN escola_series es ON u.serie_id = es.id
      LEFT JOIN usuarios p ON u.pai_id = p.id
      LEFT JOIN tarefas t ON t.filho_id = u.id AND t.status = 'concluida'
      LEFT JOIN tarefas tc ON tc.filho_id = u.id AND tc.status = 'concluida'
      LEFT JOIN escola_quiz_respostas qr ON qr.aluno_id = u.id AND qr.status = 'concluida'
      WHERE u.escola_id = ? AND u.tipo = 'filho'
      GROUP BY u.id, u.nome, u.email, u.status, u.data_cadastro, es.nome, es.id, p.nome, p.email, p.telefone
      ORDER BY es.nome, u.nome
    `, [escolaId]);

    const alunosFormatados = alunos.map(aluno => ({
      ...aluno,
      responsavel: {
        nome: aluno.responsavel_nome,
        email: aluno.responsavel_email,
        telefone: aluno.responsavel_telefone
      }
    }));

    res.json({ alunos: alunosFormatados });

  } catch (error) {
    console.error('Erro ao buscar detalhes dos alunos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== QUIZZES ====================

// Criar Quiz
router.post('/escola/quiz/criar', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;
    const {
      titulo, descricao, serie_id, materia, dificuldade, tempo_limite,
      pontos_por_questao, permite_tentativas, max_tentativas, data_inicio,
      data_fim, tipo_destinatario, alunos_selecionados, questoes
    } = req.body;

    // Inserir quiz
    const quizResult = await db.query(`
      INSERT INTO escola_quizzes (
        escola_id, titulo, descricao, serie_id, materia, dificuldade,
        tempo_limite, pontos_por_questao, permite_tentativas, max_tentativas,
        data_inicio, data_fim, tipo_destinatario, status, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', NOW())
    `, [
      escolaId, titulo, descricao, serie_id, materia, dificuldade,
      tempo_limite, pontos_por_questao, permite_tentativas, max_tentativas,
      data_inicio, data_fim, tipo_destinatario
    ]);

    const quizId = quizResult.insertId;

    // Inserir questões
    for (const questao of questoes) {
      const questaoResult = await db.query(`
        INSERT INTO escola_quiz_questoes (
          quiz_id, pergunta, tipo, opcoes, resposta_correta, explicacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        quizId, questao.pergunta, questao.tipo,
        JSON.stringify(questao.opcoes), questao.resposta_correta, questao.explicacao
      ]);
    }

    // Atribuir aos alunos
    if (tipo_destinatario === 'individual' && alunos_selecionados.length > 0) {
      const atribuicoes = alunos_selecionados.map(alunoId => [quizId, alunoId, 'pendente']);
      await db.query(
        'INSERT INTO escola_quiz_atribuicoes (quiz_id, aluno_id, status) VALUES ?',
        [atribuicoes]
      );
    } else if (tipo_destinatario === 'serie' && serie_id) {
      // Buscar todos os alunos da série
      const alunosSerie = await db.query(
        'SELECT id FROM usuarios WHERE serie_id = ? AND tipo = "filho"',
        [serie_id]
      );
      
      if (alunosSerie.length > 0) {
        const atribuicoes = alunosSerie.map(aluno => [quizId, aluno.id, 'pendente']);
        await db.query(
          'INSERT INTO escola_quiz_atribuicoes (quiz_id, aluno_id, status) VALUES ?',
          [atribuicoes]
        );
      }
    }

    res.status(201).json({ message: 'Quiz criado com sucesso', quiz_id: quizId });

  } catch (error) {
    console.error('Erro ao criar quiz:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== TAREFAS ====================

// Atribuir Tarefa
router.post('/escola/tarefa/atribuir', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;
    const {
      titulo, descricao, tipo, materia, serie_id, dificuldade,
      pontos_recompensa, data_limite, tipo_destinatario, alunos_selecionados,
      criterios_avaliacao, permite_reenvio, max_tentativas
    } = req.body;

    // Inserir tarefa
    const tarefaResult = await db.query(`
      INSERT INTO escola_tarefas (
        escola_id, titulo, descricao, tipo, materia, serie_id, dificuldade,
        pontos_recompensa, data_limite, tipo_destinatario, criterios_avaliacao,
        permite_reenvio, max_tentativas, status, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativa', NOW())
    `, [
      escolaId, titulo, descricao, tipo, materia, serie_id, dificuldade,
      pontos_recompensa, data_limite, tipo_destinatario, criterios_avaliacao,
      permite_reenvio, max_tentativas
    ]);

    const tarefaId = tarefaResult.insertId;

    // Atribuir aos alunos
    if (tipo_destinatario === 'individual' && alunos_selecionados.length > 0) {
      const atribuicoes = alunos_selecionados.map(alunoId => [tarefaId, alunoId, 'pendente']);
      await db.query(
        'INSERT INTO escola_tarefa_atribuicoes (tarefa_id, aluno_id, status) VALUES ?',
        [atribuicoes]
      );
    } else if (tipo_destinatario === 'serie' && serie_id) {
      // Buscar todos os alunos da série
      const alunosSerie = await db.query(
        'SELECT id FROM usuarios WHERE serie_id = ? AND tipo = "filho"',
        [serie_id]
      );
      
      if (alunosSerie.length > 0) {
        const atribuicoes = alunosSerie.map(aluno => [tarefaId, aluno.id, 'pendente']);
        await db.query(
          'INSERT INTO escola_tarefa_atribuicoes (tarefa_id, aluno_id, status) VALUES ?',
          [atribuicoes]
        );
      }
    }

    res.status(201).json({ message: 'Tarefa atribuída com sucesso', tarefa_id: tarefaId });

  } catch (error) {
    console.error('Erro ao atribuir tarefa:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== MENSAGENS ====================

// Enviar Mensagem
router.post('/escola/mensagem/enviar', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;
    const {
      assunto, mensagem, tipo_destinatario, serie_id, alunos_selecionados,
      incluir_responsaveis, prioridade, categoria, agendamento, data_envio
    } = req.body;

    let destinatarios = [];

    // Determinar destinatários
    if (tipo_destinatario === 'todos') {
      const todosAlunos = await db.query(
        'SELECT id FROM usuarios WHERE escola_id = ? AND tipo = "filho"',
        [escolaId]
      );
      destinatarios = todosAlunos.map(aluno => aluno.id);
    } else if (tipo_destinatario === 'serie' && serie_id) {
      const alunosSerie = await db.query(
        'SELECT id FROM usuarios WHERE serie_id = ? AND tipo = "filho"',
        [serie_id]
      );
      destinatarios = alunosSerie.map(aluno => aluno.id);
    } else if (tipo_destinatario === 'individual') {
      destinatarios = alunos_selecionados;
    }

    // Inserir mensagem
    const mensagemResult = await db.query(`
      INSERT INTO escola_mensagens (
        escola_id, assunto, mensagem, tipo_destinatario, serie_id,
        incluir_responsaveis, prioridade, categoria, total_destinatarios,
        agendamento, data_envio, status, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      escolaId, assunto, mensagem, tipo_destinatario, serie_id,
      incluir_responsaveis, prioridade, categoria, destinatarios.length,
      agendamento, data_envio || null, agendamento ? 'agendada' : 'enviada'
    ]);

    const mensagemId = mensagemResult.insertId;

    // Inserir destinatários
    if (destinatarios.length > 0) {
      const destinatariosData = destinatarios.map(alunoId => [
        mensagemId, alunoId, 'aluno', 'nao_lida'
      ]);

      if (incluir_responsaveis) {
        // Buscar responsáveis dos alunos
        const responsaveis = await db.query(`
          SELECT DISTINCT pai_id FROM usuarios WHERE id IN (${destinatarios.map(() => '?').join(',')})
        `, destinatarios);

        responsaveis.forEach(resp => {
          destinatariosData.push([mensagemId, resp.pai_id, 'responsavel', 'nao_lida']);
        });
      }

      await db.query(
        'INSERT INTO escola_mensagem_destinatarios (mensagem_id, usuario_id, tipo_usuario, status) VALUES ?',
        [destinatariosData]
      );
    }

    res.status(201).json({ 
      message: agendamento ? 'Mensagem agendada com sucesso' : 'Mensagem enviada com sucesso',
      mensagem_id: mensagemId 
    });

  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== RELATÓRIOS ====================

// Relatórios
router.get('/escola/relatorios', authenticateEscola, async (req, res) => {
  try {
    const escolaId = req.escola.id;
    const { periodo = '30', serie_id, materia, tipo_relatorio = 'geral' } = req.query;

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - parseInt(periodo));

    // Estatísticas gerais
    const [alunos, tarefas, quizzes, mediaDesempenho] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM usuarios WHERE escola_id = ? AND tipo = "filho"', [escolaId]),
      db.query('SELECT COUNT(*) as total FROM escola_tarefas WHERE escola_id = ? AND data_criacao >= ?', [escolaId, dataLimite]),
      db.query('SELECT COUNT(*) as total FROM escola_quizzes WHERE escola_id = ? AND data_criacao >= ?', [escolaId, dataLimite]),
      db.query(`
        SELECT AVG(pontuacao) as media FROM (
          SELECT AVG(pontos) as pontuacao FROM tarefas 
          WHERE filho_id IN (SELECT id FROM usuarios WHERE escola_id = ?) 
          AND data_conclusao >= ? AND status = 'concluida'
          GROUP BY filho_id
        ) as medias
      `, [escolaId, dataLimite])
    ]);

    // Desempenho por série
    const porSerie = await db.query(`
      SELECT 
        es.nome, 
        COUNT(DISTINCT u.id) as total_alunos,
        COUNT(DISTINCT t.id) as tarefas_concluidas,
        COUNT(DISTINCT qr.id) as quizzes_concluidos,
        AVG(t.pontos) as media_pontuacao
      FROM escola_series es
      LEFT JOIN usuarios u ON u.serie_id = es.id AND u.tipo = 'filho'
      LEFT JOIN tarefas t ON t.filho_id = u.id AND t.status = 'concluida' AND t.data_conclusao >= ?
      LEFT JOIN escola_quiz_respostas qr ON qr.aluno_id = u.id AND qr.status = 'concluida' AND qr.data_resposta >= ?
      WHERE es.escola_id = ?
      GROUP BY es.id, es.nome
      ORDER BY es.nome
    `, [dataLimite, dataLimite, escolaId]);

    // Desempenho por matéria
    const porMateria = await db.query(`
      SELECT 
        materia as nome,
        COUNT(*) as total_atividades,
        AVG(pontos) as media_pontuacao
      FROM (
        SELECT materia, pontos FROM escola_tarefas et
        JOIN escola_tarefa_entregas ete ON ete.tarefa_id = et.id
        WHERE et.escola_id = ? AND ete.data_entrega >= ?
        UNION ALL
        SELECT materia, pontuacao as pontos FROM escola_quizzes eq
        JOIN escola_quiz_respostas eqr ON eqr.quiz_id = eq.id
        WHERE eq.escola_id = ? AND eqr.data_resposta >= ?
      ) as atividades
      GROUP BY materia
      ORDER BY media_pontuacao DESC
    `, [escolaId, dataLimite, escolaId, dataLimite]);

    res.json({
      geral: {
        total_alunos: alunos[0].total,
        total_tarefas: tarefas[0].total,
        total_quizzes: quizzes[0].total,
        media_pontuacao: Math.round(mediaDesempenho[0].media || 0)
      },
      por_serie: porSerie.map(s => ({
        ...s,
        media_pontuacao: Math.round(s.media_pontuacao || 0)
      })),
      por_materia: porMateria.map(m => ({
        ...m,
        media_pontuacao: Math.round(m.media_pontuacao || 0)
      }))
    });

  } catch (error) {
    console.error('Erro ao gerar relatórios:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==================== UTILITÁRIOS ====================

// Listar escolas (para o cadastro de crianças)
router.get('/escola/listar', async (req, res) => {
  try {
    const escolas = await db.query(
      'SELECT id, nome FROM escolas WHERE status = "ativo" ORDER BY nome'
    );

    res.json({ escolas });

  } catch (error) {
    console.error('Erro ao listar escolas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar séries de uma escola específica
router.get('/escola/:escolaId/series', async (req, res) => {
  try {
    const { escolaId } = req.params;

    const series = await db.query(
      'SELECT id, nome FROM escola_series WHERE escola_id = ? ORDER BY nome',
      [escolaId]
    );

    res.json({ series });

  } catch (error) {
    console.error('Erro ao listar séries da escola:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;

