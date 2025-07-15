const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = (pool) => {
  const router = express.Router();

  // Função auxiliar para tratar datas vazias
  const tratarData = (data) => {
    if (!data || data === '' || data === 'null' || data === 'undefined') {
      return null;
    }
    return data;
  };

  // Middleware de autenticação JWT
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'MySecretKey2025!@#xAI123', (err, user) => {
      if (err) {
        console.error('Erro na verificação do token:', err.message);
        return res.status(403).json({ error: 'Token inválido ou expirado' });
      }
      
      if (user.tipo !== 'escola') {
        return res.status(403).json({ error: 'Acesso negado: apenas escolas podem acessar esta rota' });
      }
      
      req.user = user;
      next();
    });
  };

  // Cadastrar escola
  router.post('/cadastro', async (req, res) => {
    const {
      nome,
      email,
      senha,
      telefone,
      cnpj,
      endereco,
      cidade,
      estado,
      cep,
      diretor,
      telefone_diretor,
      email_diretor,
      numero_alunos,
      series_oferecidas
    } = req.body;

    try {
      const client = await pool.connect();

      // Verificar se o email já existe
      const emailCheck = await client.query('SELECT id FROM escolas WHERE email = $1', [email]);
      if (emailCheck.rows.length > 0) {
        client.release();
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      // Inserir escola (senha em texto puro)
      const escolaResult = await client.query(`
        INSERT INTO escolas (
          nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep,
          diretor, telefone_diretor, email_diretor, numero_alunos, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, nome, email
      `, [
        nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep,
        diretor, telefone_diretor, email_diretor, numero_alunos, 'ativo'
      ]);

      const escolaId = escolaResult.rows[0].id;

      // Inserir séries oferecidas
      for (const serie of series_oferecidas || []) {
        await client.query(
          'INSERT INTO escola_series (escola_id, nome, ativa) VALUES ($1, $2, $3)',
          [escolaId, serie, true]
        );
      }

      // Gerar token JWT
      const token = jwt.sign(
        { id: escolaId, email, nome, tipo: 'escola' },
        process.env.JWT_SECRET || 'MySecretKey2025!@#xAI123',
        { expiresIn: '24h' }
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Escola cadastrada com sucesso',
        token,
        user: {
          id: escolaId,
          nome,
          email,
          tipo: 'escola'
        }
      });

    } catch (error) {
      console.error('Erro ao cadastrar escola:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Login da escola (sem bcrypt)
  router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    
    console.log(`Requisição recebida: POST /auth/escola/login - Origem: ${req.ip} - Data: ${new Date().toISOString()}`);
    console.log('Tentativa de login:', { email, senhaLength: senha?.length });

    try {
      const client = await pool.connect();
      console.log('Cliente adquirido do pool:', client.processID);

      // Buscar escola no banco
      const result = await client.query(
        'SELECT id, nome, email, senha, status FROM escolas WHERE email = $1',
        [email]
      );

      console.log('Resultado da query:', {
        found: result.rows.length,
        email: result.rows[0]?.email,
        status: result.rows[0]?.status
      });

      if (result.rows.length === 0) {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const escola = result.rows[0];

      // Verificar se a escola está ativa
      if (escola.status !== 'ativo') {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(401).json({ error: 'Conta inativa' });
      }

      // Comparar senha em texto puro
      if (senha !== escola.senha) {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Gerar token JWT
      const token = jwt.sign(
        { 
          id: escola.id, 
          email: escola.email, 
          nome: escola.nome,
          tipo: 'escola'
        },
        process.env.JWT_SECRET || 'MySecretKey2025!@#xAI123',
        { expiresIn: '24h' }
      );

      console.log('Token gerado com sucesso');

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        token,
        user: {
          id: escola.id,
          nome: escola.nome,
          email: escola.email,
          tipo: 'escola'
        }
      });

    } catch (error) {
      console.error('Erro no login:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Aplicar middleware de autenticação para todas as rotas abaixo
  router.use(authenticateToken);

  // Listar séries da escola
  router.get('/series', async (req, res) => {
    try {
      const client = await pool.connect();
      
      const result = await client.query(
        'SELECT id, nome, descricao, ano_letivo, ativa FROM escola_series WHERE escola_id = $1 AND ativa = $2 ORDER BY nome',
        [req.user.id, true]
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        series: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar séries:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Criar nova série
  router.post('/series/criar', async (req, res) => {
    const { nome, descricao, ano_letivo } = req.body;

    try {
      const client = await pool.connect();

      // Verificar se já existe uma série com o mesmo nome para esta escola
      const serieExistente = await client.query(
        'SELECT id FROM escola_series WHERE escola_id = $1 AND nome = $2 AND ativa = $3',
        [req.user.id, nome, true]
      );

      if (serieExistente.rows.length > 0) {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(400).json({ error: 'Já existe uma série com este nome' });
      }

      // Inserir nova série
      const result = await client.query(`
        INSERT INTO escola_series (escola_id, nome, descricao, ano_letivo, ativa)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, nome, descricao, ano_letivo, ativa
      `, [
        req.user.id, 
        nome, 
        descricao || null, 
        ano_letivo || new Date().getFullYear(), 
        true
      ]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Série criada com sucesso',
        serie: result.rows[0]
      });

    } catch (error) {
      console.error('Erro ao criar série:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Listar alunos da escola
  router.get('/alunos', async (req, res) => {
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT 
          ae.id,
          ae.nome_completo as nome,
          ae.email,
          ae.telefone,
          ae.sala,
          ae.data_nascimento,
          ae.responsavel_nome,
          ae.responsavel_email,
          ae.responsavel_telefone,
          ae.pontuacao_total,
          ae.serie_id,
          ae.status,
          s.nome as serie_nome
        FROM alunos_escola ae
        LEFT JOIN escola_series s ON ae.serie_id = s.id
        WHERE ae.escola_id = $1
        ORDER BY ae.nome_completo
      `, [req.user.id]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        alunos: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar alunos:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Listar alunos com estatísticas detalhadas
  router.get('/alunos/detalhado', async (req, res) => {
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT 
          ae.id,
          ae.nome_completo as nome,
          ae.email,
          ae.telefone,
          ae.sala,
          ae.data_nascimento,
          ae.responsavel_nome,
          ae.responsavel_email,
          ae.responsavel_telefone,
          ae.pontuacao_total,
          ae.serie_id,
          ae.status,
          s.nome as serie_nome,
          COALESCE(tarefas_stats.tarefas_concluidas, 0) as tarefas_concluidas,
          COALESCE(quiz_stats.quizzes_concluidos, 0) as quizzes_concluidos
        FROM alunos_escola ae
        LEFT JOIN escola_series s ON ae.serie_id = s.id
        LEFT JOIN (
          SELECT 
            aluno_id,
            COUNT(*) as tarefas_concluidas
          FROM escola_tarefa_entregas ts
          WHERE ts.pontuacao IS NOT NULL
          GROUP BY aluno_id
        ) tarefas_stats ON ae.id = tarefas_stats.aluno_id
        LEFT JOIN (
          SELECT 
            atribuicao.aluno_id,
            COUNT(DISTINCT atribuicao.quiz_id) as quizzes_concluidos
          FROM escola_quiz_atribuicoes atribuicao
          WHERE atribuicao.status = 'concluida'
          GROUP BY atribuicao.aluno_id
        ) quiz_stats ON ae.id = quiz_stats.aluno_id
        WHERE ae.escola_id = $1
        ORDER BY ae.nome_completo
      `, [req.user.id]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        alunos: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar alunos detalhados:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Cadastrar novo aluno
  router.post('/aluno/cadastrar', async (req, res) => {
    const {
      nome_completo,
      email,
      senha,
      telefone,
      serie_id,
      sala,
      data_nascimento,
      responsavel_nome,
      responsavel_email,
      responsavel_telefone,
      observacoes
    } = req.body;

    try {
      const client = await pool.connect();

      // Verificar se o email já existe
      const emailCheck = await client.query(
        'SELECT id FROM alunos_escola WHERE email = $1',
        [email]
      );

      if (emailCheck.rows.length > 0) {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      // Verificar se a série existe e pertence à escola
      if (serie_id) {
        const serieCheck = await client.query(
          'SELECT id FROM escola_series WHERE id = $1 AND escola_id = $2',
          [serie_id, req.user.id]
        );

        if (serieCheck.rows.length === 0) {
          client.release();
          console.log('Conexão liberada para pool:', client.processID);
          return res.status(400).json({ error: 'Série inválida' });
        }
      }

      // Inserir aluno (senha em texto puro)
      const result = await client.query(`
        INSERT INTO alunos_escola (
          escola_id, serie_id, nome_completo, email, senha, telefone, sala,
          data_nascimento, responsavel_nome, responsavel_email, responsavel_telefone, observacoes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, nome_completo, email
      `, [
        req.user.id, serie_id, nome_completo, email, senha, telefone, sala,
        data_nascimento, responsavel_nome, responsavel_email, responsavel_telefone, observacoes, 'ativo'
      ]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Aluno cadastrado com sucesso',
        aluno: result.rows[0]
      });

    } catch (error) {
      console.error('Erro ao cadastrar aluno:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Criar quiz (com tratamento de datas)
  router.post('/quiz/criar', async (req, res) => {
    const {
      titulo,
      descricao,
      serie_id,
      materia,
      dificuldade,
      tempo_limite,
      pontos_por_questao,
      permite_tentativas,
      max_tentativas,
      data_inicio,
      data_fim,
      tipo_destinatario,
      alunos_selecionados,
      questoes
    } = req.body;

    try {
      const client = await pool.connect();
      await client.query('BEGIN');

      // Tratar datas vazias
      const dataInicioTratada = tratarData(data_inicio);
      const dataFimTratada = tratarData(data_fim);

      // Inserir quiz
      const quizResult = await client.query(`
        INSERT INTO escola_quizzes (
          escola_id, serie_id, titulo, descricao, materia, dificuldade,
          tempo_limite, pontos_por_questao, permite_tentativas, max_tentativas,
          data_inicio, data_fim, tipo_destinatario
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        req.user.id, serie_id, titulo, descricao, materia, dificuldade,
        tempo_limite, pontos_por_questao, permite_tentativas, max_tentativas,
        dataInicioTratada, dataFimTratada, tipo_destinatario
      ]);

      const quizId = quizResult.rows[0].id;

      // Inserir questões
      for (let i = 0; i < (questoes || []).length; i++) {
        const questao = questoes[i];
        await client.query(`
          INSERT INTO escola_quiz_questoes (
            quiz_id, pergunta, tipo, opcoes, resposta_correta, explicacao, ordem
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          quizId, questao.pergunta, questao.tipo, JSON.stringify(questao.opcoes || []),
          questao.resposta_correta, questao.explicacao, i + 1
        ]);
      }

      // Criar atribuições para alunos
      let alunosParaAtribuir = [];
      
      if (tipo_destinatario === 'serie' && serie_id) {
        // Buscar todos os alunos da série
        const alunosResult = await client.query(
          'SELECT id FROM alunos_escola WHERE serie_id = $1 AND escola_id = $2 AND status = $3',
          [serie_id, req.user.id, 'ativo']
        );
        alunosParaAtribuir = alunosResult.rows.map(row => row.id);
      } else if (tipo_destinatario === 'individual' && (alunos_selecionados || []).length > 0) {
        alunosParaAtribuir = alunos_selecionados;
      }

      // Criar atribuições
      for (const alunoId of alunosParaAtribuir) {
        await client.query(`
          INSERT INTO escola_quiz_atribuicoes (quiz_id, aluno_id, status)
          VALUES ($1, $2, $3)
        `, [quizId, alunoId, 'pendente']);
      }

      await client.query('COMMIT');
      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Quiz criado com sucesso',
        quiz_id: quizId
      });

    } catch (error) {
      console.error('Erro ao criar quiz:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Atribuir tarefa (com tratamento de datas)
  router.post('/tarefa/atribuir', async (req, res) => {
    const {
      titulo,
      descricao,
      tipo,
      materia,
      serie_id,
      dificuldade,
      pontos_recompensa,
      data_limite,
      tipo_destinatario,
      alunos_selecionados,
      criterios_avaliacao,
      permite_reenvio,
      max_tentativas
    } = req.body;

    try {
      const client = await pool.connect();
      await client.query('BEGIN');

      // Tratar data limite
      const dataLimiteTratada = tratarData(data_limite);
      
      if (!dataLimiteTratada) {
        return res.status(400).json({ error: 'Data limite é obrigatória' });
      }

      // Inserir tarefa
      const tarefaResult = await client.query(`
        INSERT INTO escola_tarefas (
          escola_id, serie_id, titulo, descricao, tipo, materia, dificuldade,
          pontos_recompensa, data_limite, tipo_destinatario, criterios_avaliacao,
          permite_reenvio, max_tentativas
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        req.user.id, serie_id, titulo, descricao, tipo, materia, dificuldade,
        pontos_recompensa, dataLimiteTratada, tipo_destinatario, criterios_avaliacao,
        permite_reenvio, max_tentativas
      ]);

      const tarefaId = tarefaResult.rows[0].id;

      // Criar atribuições para alunos
      let alunosParaAtribuir = [];
      
      if (tipo_destinatario === 'serie' && serie_id) {
        // Buscar todos os alunos da série
        const alunosResult = await client.query(
          'SELECT id FROM alunos_escola WHERE serie_id = $1 AND escola_id = $2 AND status = $3',
          [serie_id, req.user.id, 'ativo']
        );
        alunosParaAtribuir = alunosResult.rows.map(row => row.id);
      } else if (tipo_destinatario === 'individual' && (alunos_selecionados || []).length > 0) {
        alunosParaAtribuir = alunos_selecionados;
      }

      // Criar atribuições
      for (const alunoId of alunosParaAtribuir) {
        await client.query(`
          INSERT INTO escola_tarefa_atribuicoes (tarefa_id, aluno_id, status)
          VALUES ($1, $2, $3)
        `, [tarefaId, alunoId, 'pendente']);
      }

      await client.query('COMMIT');
      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Tarefa atribuída com sucesso',
        tarefa_id: tarefaId
      });

    } catch (error) {
      console.error('Erro ao atribuir tarefa:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Enviar mensagem (com tratamento de datas)
  router.post('/mensagem/enviar', async (req, res) => {
    const {
      assunto,
      mensagem,
      tipo_destinatario,
      serie_id,
      alunos_selecionados,
      incluir_responsaveis,
      prioridade,
      categoria,
      agendamento,
      data_envio
    } = req.body;

    try {
      const client = await pool.connect();
      await client.query('BEGIN');

      // Tratar data de envio
      const dataEnvioTratada = tratarData(data_envio);

      // Inserir mensagem
      const mensagemResult = await client.query(`
        INSERT INTO escola_mensagens (
          escola_id, serie_id, assunto, mensagem, tipo_destinatario,
          incluir_responsaveis, prioridade, categoria, agendamento, data_envio
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        req.user.id, serie_id, assunto, mensagem, tipo_destinatario,
        incluir_responsaveis, prioridade, categoria, agendamento, dataEnvioTratada
      ]);

      const mensagemId = mensagemResult.rows[0].id;

      // Determinar destinatários
      let alunosDestinatarios = [];
      
      if (tipo_destinatario === 'serie' && serie_id) {
        // Buscar todos os alunos da série
        const alunosResult = await client.query(
          'SELECT id FROM alunos_escola WHERE serie_id = $1 AND escola_id = $2 AND status = $3',
          [serie_id, req.user.id, 'ativo']
        );
        alunosDestinatarios = alunosResult.rows.map(row => row.id);
      } else if (tipo_destinatario === 'individual' && (alunos_selecionados || []).length > 0) {
        alunosDestinatarios = alunos_selecionados;
      }

      // Inserir destinatários
      for (const alunoId of alunosDestinatarios) {
        await client.query(
          'INSERT INTO escola_mensagem_destinatarios (mensagem_id, usuario_id, tipo_usuario) VALUES ($1, $2, $3)',
          [mensagemId, alunoId, 'aluno']
        );
      }

      await client.query('COMMIT');
      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Mensagem enviada com sucesso',
        mensagem_id: mensagemId
      });

    } catch (error) {
      console.error('Erro ao enviar mensagem:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Listar conversas do chat
  router.get('/chat/conversas', async (req, res) => {
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT DISTINCT
          cm.destinatario_id,
          cm.tipo_destinatario,
          CASE 
            WHEN cm.tipo_destinatario = 'aluno' THEN ae.nome_completo
            ELSE ae.responsavel_nome
          END as nome_destinatario,
          (
            SELECT mensagem 
            FROM chat_mensagens cm2 
            WHERE cm2.escola_id = cm.escola_id 
              AND cm2.destinatario_id = cm.destinatario_id 
              AND cm2.tipo_destinatario = cm.tipo_destinatario
            ORDER BY cm2.data_envio DESC 
            LIMIT 1
          ) as ultima_mensagem,
          (
            SELECT data_envio 
            FROM chat_mensagens cm2 
            WHERE cm2.escola_id = cm.escola_id 
              AND cm2.destinatario_id = cm.destinatario_id 
              AND cm2.tipo_destinatario = cm.tipo_destinatario
            ORDER BY cm2.data_envio DESC 
            LIMIT 1
          ) as data_ultima_mensagem,
          (
            SELECT COUNT(*) 
            FROM chat_mensagens cm2 
            WHERE cm2.escola_id = cm.escola_id 
              AND cm2.destinatario_id = cm.destinatario_id 
              AND cm2.tipo_destinatario = cm.tipo_destinatario
              AND cm2.remetente_tipo != 'escola'
              AND cm2.lida = false
          ) as mensagens_nao_lidas
        FROM chat_mensagens cm
        LEFT JOIN alunos_escola ae ON cm.destinatario_id = ae.id
        WHERE cm.escola_id = $1
        ORDER BY data_ultima_mensagem DESC
      `, [req.user.id]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        conversas: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar conversas:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Buscar mensagens do chat
  router.get('/chat/mensagens/:destinatario_id', async (req, res) => {
    const { destinatario_id } = req.params;
    const { tipo_destinatario } = req.query;

    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT 
          id,
          remetente_tipo,
          mensagem,
          data_envio,
          lida
        FROM chat_mensagens
        WHERE escola_id = $1 
          AND destinatario_id = $2 
          AND tipo_destinatario = $3
        ORDER BY data_envio ASC
      `, [req.user.id, destinatario_id, tipo_destinatario || 'aluno']);

      // Marcar mensagens como lidas
      await client.query(`
        UPDATE chat_mensagens 
        SET lida = true 
        WHERE escola_id = $1 
          AND destinatario_id = $2 
          AND tipo_destinatario = $3
          AND remetente_tipo != 'escola'
      `, [req.user.id, destinatario_id, tipo_destinatario || 'aluno']);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        mensagens: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar mensagens:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Enviar mensagem no chat
  router.post('/chat/enviar', async (req, res) => {
    const { destinatario_id, mensagem, tipo_destinatario } = req.body;

    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        INSERT INTO chat_mensagens (
          escola_id, destinatario_id, tipo_destinatario, remetente_tipo, mensagem
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, data_envio
      `, [req.user.id, destinatario_id, tipo_destinatario || 'aluno', 'escola', mensagem]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Mensagem enviada',
        mensagem_id: result.rows[0].id,
        data_envio: result.rows[0].data_envio
      });

    } catch (error) {
      console.error('Erro ao enviar mensagem no chat:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Estatísticas do dashboard
  router.get('/dashboard/estatisticas', async (req, res) => {
    try {
      const client = await pool.connect();
      
      // Calcular estatísticas em tempo real
      let alunos, quizzes, tarefas, mensagens, quizzesPendentes, tarefasPendentes;
      
      try {
        alunos = await client.query(
          'SELECT COUNT(*) as total FROM alunos_escola WHERE escola_id = $1 AND status = $2',
          [req.user.id, 'ativo']
        );
      } catch (error) {
        if (error.code === '42P01') alunos = { rows: [{ total: 0 }] };
        else throw error;
      }

      try {
        quizzes = await client.query(
          'SELECT COUNT(*) as total FROM escola_quizzes WHERE escola_id = $1',
          [req.user.id]
        );
      } catch (error) {
        if (error.code === '42P01') quizzes = { rows: [{ total: 0 }] };
        else throw error;
      }

      try {
        tarefas = await client.query(
          'SELECT COUNT(*) as total FROM escola_tarefas WHERE escola_id = $1',
          [req.user.id]
        );
      } catch (error) {
        if (error.code === '42P01') tarefas = { rows: [{ total: 0 }] };
        else throw error;
      }

      try {
        mensagens = await client.query(
          'SELECT COUNT(*) as total FROM escola_mensagens WHERE escola_id = $1',
          [req.user.id]
        );
      } catch (error) {
        if (error.code === '42P01') mensagens = { rows: [{ total: 0 }] };
        else throw error;
      }

      try {
        quizzesPendentes = await client.query(
          'SELECT COUNT(*) as total FROM escola_quizzes WHERE escola_id = $1 AND (data_fim IS NULL OR data_fim > NOW())',
          [req.user.id]
        );
      } catch (error) {
        if (error.code === '42P01') quizzesPendentes = { rows: [{ total: 0 }] };
        else throw error;
      }

      try {
        tarefasPendentes = await client.query(
          'SELECT COUNT(*) as total FROM escola_tarefas WHERE escola_id = $1 AND data_limite > NOW()',
          [req.user.id]
        );
      } catch (error) {
        if (error.code === '42P01') tarefasPendentes = { rows: [{ total: 0 }] };
        else throw error;
      }

      const estatisticas = {
        success: true,
        total_alunos: parseInt(alunos.rows[0].total) || 0,
        total_quizzes: parseInt(quizzes.rows[0].total) || 0,
        total_tarefas: parseInt(tarefas.rows[0].total) || 0,
        total_mensagens: parseInt(mensagens.rows[0].total) || 0,
        quizzes_pendentes: parseInt(quizzesPendentes.rows[0].total) || 0,
        tarefas_pendentes: parseInt(tarefasPendentes.rows[0].total) || 0
      };

      client.release();
      console.log('Conexão liberada para pool:', client.processID);
      
      res.json(estatisticas);

    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Atividades recentes
  router.get('/dashboard/atividades-recentes', async (req, res) => {
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        (
          SELECT 
            'quiz' as tipo,
            titulo,
            materia,
            escola_quizzes.data_criacao as data,
            'ativo' as status,
            s.nome as serie,
            COALESCE((
              SELECT COUNT(DISTINCT qa.aluno_id)
              FROM escola_quiz_atribuicoes qa
              WHERE qa.quiz_id = escola_quizzes.id
            ), 0) as participantes,
            COALESCE((
              SELECT COUNT(DISTINCT qa.aluno_id)::float / NULLIF(COUNT(DISTINCT ae.id), 0) * 100
              FROM escola_quiz_atribuicoes qa
              JOIN alunos_escola ae ON ae.serie_id = escola_quizzes.serie_id
              WHERE qa.quiz_id = escola_quizzes.id
              AND ae.escola_id = $1
            ), 0) as taxa_conclusao
          FROM escola_quizzes 
          LEFT JOIN escola_series s ON escola_quizzes.serie_id = s.id
          WHERE escola_quizzes.escola_id = $1
          ORDER BY escola_quizzes.data_criacao DESC
          LIMIT 5
        )
        UNION ALL
        (
          SELECT 
            'tarefa' as tipo,
            titulo,
            materia,
            escola_tarefas.data_criacao as data,
            'ativa' as status,
            s.nome as serie,
            COALESCE((
              SELECT COUNT(DISTINCT ta.aluno_id)
              FROM escola_tarefa_atribuicoes ta
              WHERE ta.tarefa_id = escola_tarefas.id
            ), 0) as participantes,
            COALESCE((
              SELECT COUNT(DISTINCT ta.aluno_id)::float / NULLIF(COUNT(DISTINCT ae.id), 0) * 100
              FROM escola_tarefa_atribuicoes ta
              JOIN alunos_escola ae ON ae.serie_id = escola_tarefas.serie_id
              WHERE ta.tarefa_id = escola_tarefas.id
              AND ae.escola_id = $1
            ), 0) as taxa_conclusao
          FROM escola_tarefas 
          LEFT JOIN escola_series s ON escola_tarefas.serie_id = s.id
          WHERE escola_tarefas.escola_id = $1
          ORDER BY escola_tarefas.data_criacao DESC
          LIMIT 5
        )
        UNION ALL
        (
          SELECT 
            'mensagem' as tipo,
            assunto as titulo,
            categoria as materia,
            data_envio as data,
            'enviada' as status,
            s.nome as serie,
            COALESCE((
              SELECT COUNT(DISTINCT md.usuario_id)
              FROM escola_mensagem_destinatarios md
              WHERE md.mensagem_id = escola_mensagens.id
            ), 0) as participantes,
            100 as taxa_conclusao
          FROM escola_mensagens 
          LEFT JOIN escola_series s ON escola_mensagens.serie_id = s.id
          WHERE escola_mensagens.escola_id = $1
          ORDER BY data_envio DESC
          LIMIT 5
        )
        ORDER BY data DESC
        LIMIT 10
      `, [req.user.id]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        atividades: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar atividades recentes:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Relatórios
  router.get('/relatorios', async (req, res) => {
    const { periodo, tipo_relatorio, serie_id, materia } = req.query;

    try {
      const client = await pool.connect();
      
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - (parseInt(periodo) || 30));

      // Relatório geral
      let geral;
      try {
        geral = await client.query(`
          SELECT 
            (SELECT COUNT(*) FROM alunos_escola WHERE escola_id = $1 AND status = 'ativo') as total_alunos,
            (SELECT COUNT(*) FROM escola_quizzes WHERE escola_id = $1) as total_quizzes,
            (SELECT COUNT(*) FROM escola_tarefas WHERE escola_id = $1) as total_tarefas,
            (SELECT AVG(pontuacao_total) FROM alunos_escola WHERE escola_id = $1 AND status = 'ativo') as media_pontuacao
        `, [req.user.id]);
      } catch (error) {
        if (error.code === '42P01') {
          geral = { rows: [{ total_alunos: 0, total_quizzes: 0, total_tarefas: 0, media_pontuacao: 0 }] };
        } else {
          throw error;
        }
      }

      // Por série
      let porSerie;
      try {
        porSerie = await client.query(`
          SELECT 
            s.id,
            s.nome,
            COUNT(ae.id) as total_alunos,
            COALESCE(AVG(ae.pontuacao_total), 0) as media_pontuacao,
            COALESCE(tarefas.concluidas, 0) as tarefas_concluidas,
            COALESCE(quizzes.concluidos, 0) as quizzes_concluidos
          FROM escola_series s
          LEFT JOIN alunos_escola ae ON s.id = ae.serie_id AND ae.status = 'ativo'
          LEFT JOIN (
            SELECT 
              ae.serie_id,
              COUNT(te.id) as concluidas
            FROM escola_tarefa_entregas te
            JOIN escola_tarefa_atribuicoes ta ON te.atribuicao_id = ta.id
            JOIN alunos_escola ae ON ta.aluno_id = ae.id
            WHERE ae.escola_id = $1 AND te.pontuacao IS NOT NULL
            GROUP BY ae.serie_id
          ) tarefas ON s.id = tarefas.serie_id
          LEFT JOIN (
            SELECT 
              ae.serie_id,
              COUNT(DISTINCT qa.quiz_id) as concluidos
            FROM escola_quiz_atribuicoes qa
            JOIN alunos_escola ae ON qa.aluno_id = ae.id
            WHERE ae.escola_id = $1 AND qa.status = 'concluida'
            GROUP BY ae.serie_id
          ) quizzes ON s.id = quizzes.serie_id
          WHERE s.escola_id = $1
          GROUP BY s.id, s.nome, tarefas.concluidas, quizzes.concluidos
          ORDER BY s.nome
        `, [req.user.id]);
      } catch (error) {
        if (error.code === '42P01') {
          porSerie = { rows: [] };
        } else {
          throw error;
        }
      }

      // Por matéria
      let porMateria;
      try {
        porMateria = await client.query(`
          SELECT 
            materia as nome,
            COUNT(*) as total_atividades,
            AVG(pontos_por_questao) as media_pontuacao
          FROM escola_quizzes 
          WHERE escola_id = $1 
          GROUP BY materia
          UNION ALL
          SELECT 
            materia as nome,
            COUNT(*) as total_atividades,
            AVG(pontos_recompensa) as media_pontuacao
          FROM escola_tarefas 
          WHERE escola_id = $1 
          GROUP BY materia
          ORDER BY nome
        `, [req.user.id]);
      } catch (error) {
        if (error.code === '42P01') {
          porMateria = { rows: [] };
        } else {
          throw error;
        }
      }

      // Atividades recentes
      let atividadesRecentes;
      try {
        atividadesRecentes = await client.query(`
          (
            SELECT 
              'quiz' as tipo,
              titulo,
              materia,
              escola_quizzes.data_criacao as data,
              'ativo' as status,
              s.nome as serie,
              COALESCE((
                SELECT COUNT(DISTINCT qa.aluno_id)
                FROM escola_quiz_atribuicoes qa
                WHERE qa.quiz_id = escola_quizzes.id
              ), 0) as participantes,
              COALESCE((
                SELECT COUNT(DISTINCT qa.aluno_id)::float / NULLIF(COUNT(DISTINCT ae.id), 0) * 100
                FROM escola_quiz_atribuicoes qa
                JOIN alunos_escola ae ON ae.serie_id = escola_quizzes.serie_id
                WHERE qa.quiz_id = escola_quizzes.id
                AND ae.escola_id = $1
              ), 0) as taxa_conclusao
            FROM escola_quizzes 
            LEFT JOIN escola_series s ON escola_quizzes.serie_id = s.id
            WHERE escola_quizzes.escola_id = $1
            ORDER BY escola_quizzes.data_criacao DESC
            LIMIT 5
          )
          UNION ALL
          (
            SELECT 
              'tarefa' as tipo,
              titulo,
              materia,
              escola_tarefas.data_criacao as data,
              'ativa' as status,
              s.nome as serie,
              COALESCE((
                SELECT COUNT(DISTINCT ta.aluno_id)
                FROM escola_tarefa_atribuicoes ta
                WHERE ta.tarefa_id = escola_tarefas.id
              ), 0) as participantes,
              COALESCE((
                SELECT COUNT(DISTINCT ta.aluno_id)::float / NULLIF(COUNT(DISTINCT ae.id), 0) * 100
                FROM escola_tarefa_atribuicoes ta
                JOIN alunos_escola ae ON ae.serie_id = escola_tarefas.serie_id
                WHERE ta.tarefa_id = escola_tarefas.id
                AND ae.escola_id = $1
              ), 0) as taxa_conclusao
            FROM escola_tarefas 
            LEFT JOIN escola_series s ON escola_tarefas.serie_id = s.id
            WHERE escola_tarefas.escola_id = $1
            ORDER BY escola_tarefas.data_criacao DESC
            LIMIT 5
          )
          UNION ALL
          (
            SELECT 
              'mensagem' as tipo,
              assunto as titulo,
              categoria as materia,
              data_envio as data,
              'enviada' as status,
              s.nome as serie,
              COALESCE((
                SELECT COUNT(DISTINCT md.usuario_id)
                FROM escola_mensagem_destinatarios md
                WHERE md.mensagem_id = escola_mensagens.id
              ), 0) as participantes,
              100 as taxa_conclusao
            FROM escola_mensagens 
            LEFT JOIN escola_series s ON escola_mensagens.serie_id = s.id
            WHERE escola_mensagens.escola_id = $1
            ORDER BY data_envio DESC
            LIMIT 5
          )
          ORDER BY data DESC
          LIMIT 10
        `, [req.user.id]);
      } catch (error) {
        if (error.code === '42P01') {
          atividadesRecentes = { rows: [] };
        } else {
          throw error;
        }
      }

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        geral: geral.rows[0] || { total_alunos: 0, total_quizzes: 0, total_tarefas: 0, media_pontuacao: 0 },
        por_serie: porSerie.rows,
        por_materia: porMateria.rows,
        atividades_recentes: atividadesRecentes.rows,
        filtros: { periodo, tipo_relatorio, serie_id, materia }
      });

    } catch (error) {
      console.error('Erro ao gerar relatórios:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Exportar relatórios
  router.get('/relatorios/exportar', async (req, res) => {
    const { periodo, tipo_relatorio, serie_id, materia, formato } = req.query;

    try {
      // Reutilizar a lógica do endpoint de relatórios
      const client = await pool.connect();
      
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - (parseInt(periodo) || 30));

      // Relatório geral
      let geral;
      try {
        geral = await client.query(`
          SELECT 
            (SELECT COUNT(*) FROM alunos_escola WHERE escola_id = $1 AND status = 'ativo') as total_alunos,
            (SELECT COUNT(*) FROM escola_quizzes WHERE escola_id = $1) as total_quizzes,
            (SELECT COUNT(*) FROM escola_tarefas WHERE escola_id = $1) as total_tarefas,
            (SELECT AVG(pontuacao_total) FROM alunos_escola WHERE escola_id = $1 AND status = 'ativo') as media_pontuacao
        `, [req.user.id]);
      } catch (error) {
        if (error.code === '42P01') {
          geral = { rows: [{ total_alunos: 0, total_quizzes: 0, total_tarefas: 0, media_pontuacao: 0 }] };
        } else {
          throw error;
        }
      }

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      const relatorioData = {
        success: true,
        geral: geral.rows[0] || { total_alunos: 0, total_quizzes: 0, total_tarefas: 0, media_pontuacao: 0 },
        filtros: { periodo, tipo_relatorio, serie_id, materia },
        data_exportacao: new Date().toISOString()
      };

      if (formato === 'pdf') {
        res.status(501).json({ error: 'Exportação de PDF não implementada ainda' });
      } else if (formato === 'excel') {
        res.status(501).json({ error: 'Exportação de Excel não implementada ainda' });
      } else {
        res.json(relatorioData);
      }

    } catch (error) {
      console.error('Erro ao exportar relatórios:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Alterar senha
  router.post('/alterar-senha', async (req, res) => {
    const { senha_atual, nova_senha } = req.body;

    try {
      const client = await pool.connect();

      // Buscar senha atual
      const result = await client.query(
        'SELECT senha FROM escolas WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(404).json({ error: 'Escola não encontrada' });
      }

      const escola = result.rows[0];

      // Verificar senha atual (sem bcrypt)
      if (senha_atual !== escola.senha) {
        client.release();
        console.log('Conexão liberada para pool:', client.processID);
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      // Atualizar senha (em texto puro)
      await client.query(
        'UPDATE escolas SET senha = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2',
        [nova_senha, req.user.id]
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Senha alterada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao alterar senha:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // ========== ROTAS PARA AGENDA ==========

  // Listar eventos da agenda
  router.get('/agenda', async (req, res) => {
    const { data_inicio, data_fim, serie_id } = req.query;

    try {
      const client = await pool.connect();
      
      let query = `
        SELECT 
          ea.id,
          ea.titulo,
          ea.descricao,
          ea.tipo_evento,
          ea.data_inicio,
          ea.data_fim,
          ea.local,
          ea.cor,
          ea.visivel_alunos,
          ea.visivel_responsaveis,
          ea.serie_id,
          s.nome as serie_nome,
          COUNT(eap.aluno_id) as participantes_confirmados
        FROM escola_agenda ea
        LEFT JOIN escola_series s ON ea.serie_id = s.id
        LEFT JOIN escola_agenda_participantes eap ON ea.id = eap.evento_id AND eap.confirmado = true
        WHERE ea.escola_id = $1
      `;
      
      const params = [req.user.id];
      let paramIndex = 2;

      if (data_inicio) {
        query += ` AND ea.data_inicio >= $${paramIndex}`;
        params.push(data_inicio);
        paramIndex++;
      }

      if (data_fim) {
        query += ` AND ea.data_fim <= $${paramIndex}`;
        params.push(data_fim);
        paramIndex++;
      }

      if (serie_id) {
        query += ` AND (ea.serie_id = $${paramIndex} OR ea.serie_id IS NULL)`;
        params.push(serie_id);
        paramIndex++;
      }

      query += ` GROUP BY ea.id, s.nome ORDER BY ea.data_inicio ASC`;

      const result = await client.query(query, params);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        eventos: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar agenda:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Criar evento na agenda (com tratamento de datas)
  router.post('/agenda/criar', async (req, res) => {
    const {
      titulo,
      descricao,
      tipo_evento,
      data_inicio,
      data_fim,
      local,
      cor,
      serie_id,
      visivel_alunos,
      visivel_responsaveis,
      notificar,
      alunos_participantes
    } = req.body;

    try {
      const client = await pool.connect();
      await client.query('BEGIN');

      // Tratar datas
      const dataInicioTratada = tratarData(data_inicio);
      const dataFimTratada = tratarData(data_fim);

      if (!dataInicioTratada) {
        return res.status(400).json({ error: 'Data de início é obrigatória' });
      }

      // Inserir evento
      const eventoResult = await client.query(`
        INSERT INTO escola_agenda (
          escola_id, serie_id, titulo, descricao, tipo_evento, data_inicio, data_fim,
          local, cor, visivel_alunos, visivel_responsaveis, notificar, criado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        req.user.id, serie_id, titulo, descricao, tipo_evento, dataInicioTratada, dataFimTratada,
        local, cor || '#007bff', visivel_alunos, visivel_responsaveis, notificar, req.user.id
      ]);

      const eventoId = eventoResult.rows[0].id;

      // Adicionar participantes específicos se fornecidos
      if (alunos_participantes && alunos_participantes.length > 0) {
        for (const alunoId of alunos_participantes) {
          await client.query(
            'INSERT INTO escola_agenda_participantes (evento_id, aluno_id) VALUES ($1, $2)',
            [eventoId, alunoId]
          );
        }
      }

      await client.query('COMMIT');
      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Evento criado com sucesso',
        evento_id: eventoId
      });

    } catch (error) {
      console.error('Erro ao criar evento:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Atualizar evento da agenda (com tratamento de datas)
  router.put('/agenda/:eventoId', async (req, res) => {
    const { eventoId } = req.params;
    const {
      titulo,
      descricao,
      tipo_evento,
      data_inicio,
      data_fim,
      local,
      cor,
      serie_id,
      visivel_alunos,
      visivel_responsaveis,
      notificar
    } = req.body;

    try {
      const client = await pool.connect();

      // Tratar datas
      const dataInicioTratada = tratarData(data_inicio);
      const dataFimTratada = tratarData(data_fim);

      if (!dataInicioTratada) {
        return res.status(400).json({ error: 'Data de início é obrigatória' });
      }

      const result = await client.query(`
        UPDATE escola_agenda SET
          titulo = $1, descricao = $2, tipo_evento = $3, data_inicio = $4, data_fim = $5,
          local = $6, cor = $7, serie_id = $8, visivel_alunos = $9, visivel_responsaveis = $10,
          notificar = $11, data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $12 AND escola_id = $13
        RETURNING id
      `, [
        titulo, descricao, tipo_evento, dataInicioTratada, dataFimTratada, local, cor,
        serie_id, visivel_alunos, visivel_responsaveis, notificar, eventoId, req.user.id
      ]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado' });
      }

      res.json({
        success: true,
        message: 'Evento atualizado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao atualizar evento:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Excluir evento da agenda
  router.delete('/agenda/:eventoId', async (req, res) => {
    const { eventoId } = req.params;

    try {
      const client = await pool.connect();

      const result = await client.query(
        'DELETE FROM escola_agenda WHERE id = $1 AND escola_id = $2 RETURNING id',
        [eventoId, req.user.id]
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado' });
      }

      res.json({
        success: true,
        message: 'Evento excluído com sucesso'
      });

    } catch (error) {
      console.error('Erro ao excluir evento:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // ========== ROTAS PARA BIBLIOTECA DE DOCUMENTOS ==========

  // Listar documentos da biblioteca
  router.get('/biblioteca/documentos', async (req, res) => {
    const { categoria, materia, serie_id, busca } = req.query;

    try {
      const client = await pool.connect();
      
      let query = `
        SELECT 
          ebd.id,
          ebd.titulo,
          ebd.descricao,
          ebd.categoria,
          ebd.materia,
          ebd.arquivo_nome,
          ebd.arquivo_url,
          ebd.arquivo_tipo,
          ebd.tamanho_arquivo,
          ebd.visivel_alunos,
          ebd.visivel_responsaveis,
          ebd.downloads,
          ebd.tags,
          ebd.serie_id,
          ebd.data_criacao,
          s.nome as serie_nome
        FROM escola_biblioteca_documentos ebd
        LEFT JOIN escola_series s ON ebd.serie_id = s.id
        WHERE ebd.escola_id = $1
      `;
      
      const params = [req.user.id];
      let paramIndex = 2;

      if (categoria) {
        query += ` AND ebd.categoria = $${paramIndex}`;
        params.push(categoria);
        paramIndex++;
      }

      if (materia) {
        query += ` AND ebd.materia = $${paramIndex}`;
        params.push(materia);
        paramIndex++;
      }

      if (serie_id) {
        query += ` AND (ebd.serie_id = $${paramIndex} OR ebd.serie_id IS NULL)`;
        params.push(serie_id);
        paramIndex++;
      }

      if (busca) {
        query += ` AND (ebd.titulo ILIKE $${paramIndex} OR ebd.descricao ILIKE $${paramIndex} OR $${paramIndex} = ANY(ebd.tags))`;
        params.push(`%${busca}%`);
        paramIndex++;
      }

      query += ` ORDER BY ebd.data_criacao DESC`;

      const result = await client.query(query, params);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        documentos: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar documentos:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Upload de documento
  router.post('/biblioteca/documentos/upload', async (req, res) => {
    const {
      titulo,
      descricao,
      categoria,
      materia,
      serie_id,
      arquivo_nome,
      arquivo_url,
      arquivo_tipo,
      tamanho_arquivo,
      visivel_alunos,
      visivel_responsaveis,
      tags
    } = req.body;

    try {
      const client = await pool.connect();

      const result = await client.query(`
        INSERT INTO escola_biblioteca_documentos (
          escola_id, serie_id, titulo, descricao, categoria, materia,
          arquivo_nome, arquivo_url, arquivo_tipo, tamanho_arquivo,
          visivel_alunos, visivel_responsaveis, tags, criado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        req.user.id, serie_id, titulo, descricao, categoria, materia,
        arquivo_nome, arquivo_url, arquivo_tipo, tamanho_arquivo,
        visivel_alunos, visivel_responsaveis, tags, req.user.id
      ]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Documento enviado com sucesso',
        documento_id: result.rows[0].id
      });

    } catch (error) {
      console.error('Erro ao enviar documento:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Excluir documento
  router.delete('/biblioteca/documentos/:documentoId', async (req, res) => {
    const { documentoId } = req.params;

    try {
      const client = await pool.connect();

      const result = await client.query(
        'DELETE FROM escola_biblioteca_documentos WHERE id = $1 AND escola_id = $2 RETURNING id',
        [documentoId, req.user.id]
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }

      res.json({
        success: true,
        message: 'Documento excluído com sucesso'
      });

    } catch (error) {
      console.error('Erro ao excluir documento:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // ========== ROTAS PARA BIBLIOTECA DE VÍDEOS ==========

  // Listar vídeos da biblioteca
  router.get('/biblioteca/videos', async (req, res) => {
    const { categoria, materia, serie_id, busca } = req.query;

    try {
      const client = await pool.connect();
      
      let query = `
        SELECT 
          ebv.id,
          ebv.titulo,
          ebv.descricao,
          ebv.categoria,
          ebv.materia,
          ebv.arquivo_nome,
          ebv.arquivo_url,
          ebv.thumbnail_url,
          ebv.duracao,
          ebv.tamanho_arquivo,
          ebv.formato,
          ebv.qualidade,
          ebv.visivel_alunos,
          ebv.visivel_responsaveis,
          ebv.visualizacoes,
          ebv.tags,
          ebv.serie_id,
          ebv.data_criacao,
          s.nome as serie_nome
        FROM escola_biblioteca_videos ebv
        LEFT JOIN escola_series s ON ebv.serie_id = s.id
        WHERE ebv.escola_id = $1
      `;
      
      const params = [req.user.id];
      let paramIndex = 2;

      if (categoria) {
        query += ` AND ebv.categoria = $${paramIndex}`;
        params.push(categoria);
        paramIndex++;
      }

      if (materia) {
        query += ` AND ebv.materia = $${paramIndex}`;
        params.push(materia);
        paramIndex++;
      }

      if (serie_id) {
        query += ` AND (ebv.serie_id = $${paramIndex} OR ebv.serie_id IS NULL)`;
        params.push(serie_id);
        paramIndex++;
      }

      if (busca) {
        query += ` AND (ebv.titulo ILIKE $${paramIndex} OR ebv.descricao ILIKE $${paramIndex} OR $${paramIndex} = ANY(ebv.tags))`;
        params.push(`%${busca}%`);
        paramIndex++;
      }

      query += ` ORDER BY ebv.data_criacao DESC`;

      const result = await client.query(query, params);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        videos: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar vídeos:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Upload de vídeo
  router.post('/biblioteca/videos/upload', async (req, res) => {
    const {
      titulo,
      descricao,
      categoria,
      materia,
      serie_id,
      arquivo_nome,
      arquivo_url,
      thumbnail_url,
      duracao,
      tamanho_arquivo,
      formato,
      qualidade,
      visivel_alunos,
      visivel_responsaveis,
      tags
    } = req.body;

    try {
      const client = await pool.connect();

      const result = await client.query(`
        INSERT INTO escola_biblioteca_videos (
          escola_id, serie_id, titulo, descricao, categoria, materia,
          arquivo_nome, arquivo_url, thumbnail_url, duracao, tamanho_arquivo,
          formato, qualidade, visivel_alunos, visivel_responsaveis, tags, criado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
      `, [
        req.user.id, serie_id, titulo, descricao, categoria, materia,
        arquivo_nome, arquivo_url, thumbnail_url, duracao, tamanho_arquivo,
        formato, qualidade, visivel_alunos, visivel_responsaveis, tags, req.user.id
      ]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Vídeo enviado com sucesso',
        video_id: result.rows[0].id
      });

    } catch (error) {
      console.error('Erro ao enviar vídeo:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Listar links de vídeos
  router.get('/biblioteca/links', async (req, res) => {
    const { categoria, materia, serie_id, busca, plataforma } = req.query;

    try {
      const client = await pool.connect();
      
      let query = `
        SELECT 
          ebl.id,
          ebl.titulo,
          ebl.descricao,
          ebl.categoria,
          ebl.materia,
          ebl.url,
          ebl.plataforma,
          ebl.duracao_estimada,
          ebl.thumbnail_url,
          ebl.visivel_alunos,
          ebl.visivel_responsaveis,
          ebl.cliques,
          ebl.tags,
          ebl.serie_id,
          ebl.data_criacao,
          s.nome as serie_nome
        FROM escola_biblioteca_links ebl
        LEFT JOIN escola_series s ON ebl.serie_id = s.id
        WHERE ebl.escola_id = $1
      `;
      
      const params = [req.user.id];
      let paramIndex = 2;

      if (categoria) {
        query += ` AND ebl.categoria = $${paramIndex}`;
        params.push(categoria);
        paramIndex++;
      }

      if (materia) {
        query += ` AND ebl.materia = $${paramIndex}`;
        params.push(materia);
        paramIndex++;
      }

      if (serie_id) {
        query += ` AND (ebl.serie_id = $${paramIndex} OR ebl.serie_id IS NULL)`;
        params.push(serie_id);
        paramIndex++;
      }

      if (plataforma) {
        query += ` AND ebl.plataforma = $${paramIndex}`;
        params.push(plataforma);
        paramIndex++;
      }

      if (busca) {
        query += ` AND (ebl.titulo ILIKE $${paramIndex} OR ebl.descricao ILIKE $${paramIndex} OR $${paramIndex} = ANY(ebl.tags))`;
        params.push(`%${busca}%`);
        paramIndex++;
      }

      query += ` ORDER BY ebl.data_criacao DESC`;

      const result = await client.query(query, params);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        links: result.rows
      });

    } catch (error) {
      console.error('Erro ao buscar links:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Adicionar link de vídeo
  router.post('/biblioteca/links/adicionar', async (req, res) => {
    const {
      titulo,
      descricao,
      categoria,
      materia,
      serie_id,
      url,
      plataforma,
      duracao_estimada,
      thumbnail_url,
      visivel_alunos,
      visivel_responsaveis,
      tags
    } = req.body;

    try {
      const client = await pool.connect();

      const result = await client.query(`
        INSERT INTO escola_biblioteca_links (
          escola_id, serie_id, titulo, descricao, categoria, materia,
          url, plataforma, duracao_estimada, thumbnail_url,
          visivel_alunos, visivel_responsaveis, tags, criado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        req.user.id, serie_id, titulo, descricao, categoria, materia,
        url, plataforma, duracao_estimada, thumbnail_url,
        visivel_alunos, visivel_responsaveis, tags, req.user.id
      ]);

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Link adicionado com sucesso',
        link_id: result.rows[0].id
      });

    } catch (error) {
      console.error('Erro ao adicionar link:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Excluir link de vídeo
  router.delete('/biblioteca/links/:linkId', async (req, res) => {
    const { linkId } = req.params;

    try {
      const client = await pool.connect();

      const result = await client.query(
        'DELETE FROM escola_biblioteca_links WHERE id = $1 AND escola_id = $2 RETURNING id',
        [linkId, req.user.id]
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Link não encontrado' });
      }

      res.json({
        success: true,
        message: 'Link excluído com sucesso'
      });

    } catch (error) {
      console.error('Erro ao excluir link:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  // Registrar clique em link
  router.post('/biblioteca/links/:linkId/clique', async (req, res) => {
    const { linkId } = req.params;

    try {
      const client = await pool.connect();

      await client.query(
        'UPDATE escola_biblioteca_links SET cliques = cliques + 1 WHERE id = $1 AND escola_id = $2',
        [linkId, req.user.id]
      );

      client.release();
      console.log('Conexão liberada para pool:', client.processID);

      res.json({
        success: true,
        message: 'Clique registrado'
      });

    } catch (error) {
      console.error('Erro ao registrar clique:', error.message);
      res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  });

  return router;
};

