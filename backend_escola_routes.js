const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const escolaRoutes = (pool) => {
  // Middleware para verificar token JWT
  const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo');
      if (decoded.tipo !== 'escola') {
        return res.status(403).json({ error: 'Acesso restrito a escolas' });
      }
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      res.status(403).json({ error: 'Token inválido' });
    }
  };

  // Cadastro de escola
  router.post('/cadastro', async (req, res) => {
    const {
      nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep,
      diretor, telefone_diretor, email_diretor, numero_alunos, series_oferecidas
    } = req.body;

    // Validações
    if (!nome || !email || !senha || !telefone || !cnpj || !endereco || !cidade || !estado || !cep ||
        !diretor || !telefone_diretor || !email_diretor || !numero_alunos || !series_oferecidas || !series_oferecidas.length) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios e devem ser válidos' });
    }
    if (!email.match(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/)) {
      return res.status(400).json({ error: 'Email institucional inválido' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }
    if (!telefone.match(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)) {
      return res.status(400).json({ error: 'Telefone deve estar no formato (XX) XXXXX-XXXX' });
    }
    if (!cnpj.match(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)) {
      return res.status(400).json({ error: 'CNPJ deve estar no formato XX.XXX.XXX/XXXX-XX' });
    }
    if (!cep.match(/^\d{5}-\d{3}$/)) {
      return res.status(400).json({ error: 'CEP deve estar no formato XXXXX-XXX' });
    }
    if (!email_diretor.match(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/)) {
      return res.status(400).json({ error: 'Email do diretor inválido' });
    }
    if (!telefone_diretor.match(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)) {
      return res.status(400).json({ error: 'Telefone do diretor deve estar no formato (XX) XXXXX-XXXX' });
    }
    if (numero_alunos <= 0) {
      return res.status(400).json({ error: 'Número de alunos deve ser maior que 0' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Verificar duplicatas
        const checkQuery = 'SELECT id FROM escolas WHERE email = $1 OR cnpj = $2';
        const checkResult = await client.query(checkQuery, [email, cnpj]);
        if (checkResult.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Email ou CNPJ já cadastrado' });
        }

        // Criptografar senha
        const hashedPassword = await bcrypt.hash(senha, 10);

        // Inserir escola
        const insertEscolaQuery = `
          INSERT INTO escolas (nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep, 
                              diretor, telefone_diretor, email_diretor, numero_alunos, status, data_cadastro)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ativo', CURRENT_TIMESTAMP)
          RETURNING id, nome, email, status
        `;
        const escolaResult = await client.query(insertEscolaQuery, [
          nome, email, hashedPassword, telefone, cnpj, endereco, cidade, estado, cep,
          diretor, telefone_diretor, email_diretor, numero_alunos
        ]);

        const escola = escolaResult.rows[0];

        // Inserir séries oferecidas
        for (const serie of series_oferecidas) {
          const insertSerieQuery = `
            INSERT INTO escola_series (escola_id, nome, ano_letivo, ativa, data_criacao)
            VALUES ($1, $2, EXTRACT(YEAR FROM CURRENT_DATE), TRUE, CURRENT_TIMESTAMP)
          `;
          await client.query(insertSerieQuery, [escola.id, serie]);
        }

        // Gerar token JWT
        const token = jwt.sign(
          { id: escola.id, email: escola.email, tipo: 'escola' },
          process.env.JWT_SECRET || 'segredo',
          { expiresIn: '1d' }
        );

        await client.query('COMMIT');
        res.status(201).json({
          message: 'Escola cadastrada com sucesso',
          user: { id: escola.id, nome: escola.nome, email: escola.email, tipo: 'escola', status: escola.status },
          token
        });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao cadastrar escola:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Login de escola
  router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    try {
      const client = await pool.connect();
      try {
        const query = 'SELECT * FROM escolas WHERE email = $1';
        const result = await client.query(query, [email]);

        if (result.rows.length === 0) {
          return res.status(400).json({ error: 'Email ou senha incorretos' });
        }

        const escola = result.rows[0];
        const senhaCorreta = await bcrypt.compare(senha, escola.senha);

        if (!senhaCorreta) {
          return res.status(400).json({ error: 'Email ou senha incorretos' });
        }

        // Removida a condição que rejeitava contas ativas
        if (escola.status !== 'ativo') {
          return res.status(403).json({ error: `Conta está ${escola.status}. Entre em contato com o suporte.` });
        }

        const token = jwt.sign(
          { id: escola.id, email: escola.email, tipo: 'escola' },
          process.env.JWT_SECRET || 'segredo',
          { expiresIn: '1d' }
        );

        res.json({
          message: 'Login realizado com sucesso',
          user: { id: escola.id, nome: escola.nome, email: escola.email, tipo: 'escola', status: escola.status },
          token
        });
      } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Alterar senha
  router.post('/alterar-senha', authenticateToken, async (req, res) => {
    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    if (nova_senha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    try {
      const client = await pool.connect();
      try {
        const query = 'SELECT senha FROM escolas WHERE id = $1';
        const result = await client.query(query, [req.user.id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Escola não encontrada' });
        }

        const senhaCorreta = await bcrypt.compare(senha_atual, result.rows[0].senha);
        if (!senhaCorreta) {
          return res.status(400).json({ error: 'Senha atual incorreta' });
        }

        const hashedNewPassword = await bcrypt.hash(nova_senha, 10);
        const updateQuery = 'UPDATE escolas SET senha = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2';
        await client.query(updateQuery, [hashedNewPassword, req.user.id]);

        res.json({ message: 'Senha alterada com sucesso' });
      } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Listar séries
  router.get('/series', authenticateToken, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const query = 'SELECT id, nome, total_alunos FROM escola_series WHERE escola_id = $1 AND ativa = TRUE';
        const result = await client.query(query, [req.user.id]);
        res.json({ series: result.rows });
      } catch (error) {
        console.error('Erro ao buscar séries:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Listar alunos
  router.get('/alunos', authenticateToken, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const query = `
          SELECT u.id, u.nome_completo AS nome, u.email, es.nome AS serie
          FROM usuarios u
          JOIN escola_series es ON u.serie_id = es.id
          WHERE es.escola_id = $1 AND u.tipo = 'crianca' AND u.status = 'ativo'
        `;
        const result = await client.query(query, [req.user.id]);
        res.json({ alunos: result.rows });
      } catch (error) {
        console.error('Erro ao buscar alunos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Listar alunos detalhado
  router.get('/alunos/detalhado', authenticateToken, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const query = `
          SELECT 
            u.id, u.nome_completo AS nome, u.email, es.nome AS serie_nome, u.serie_id, u.status, 
            u.data_cadastro, 
            COALESCE(SUM(t.pontos_recompensa), 0) AS pontuacao_total,
            COALESCE(COUNT(DISTINCT t.id), 0) AS tarefas_concluidas,
            COALESCE(COUNT(DISTINCT q.id), 0) AS quizzes_concluidos,
            (SELECT json_build_object('nome', p.nome_completo, 'email', p.email, 'telefone', p.telefone)
             FROM usuarios p WHERE p.id = u.pai_id) AS responsavel
          FROM usuarios u
          LEFT JOIN escola_series es ON u.serie_id = es.id
          LEFT JOIN tarefas t ON u.id = t.crianca_id AND t.status = 'concluida'
          LEFT JOIN quizzes q ON u.id = q.crianca_id AND q.status = 'concluido'
          WHERE es.escola_id = $1 AND u.tipo = 'crianca'
          GROUP BY u.id, es.nome
        `;
        const result = await client.query(query, [req.user.id]);
        res.json({ alunos: result.rows });
      } catch (error) {
        console.error('Erro ao buscar alunos detalhado:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Criar quiz
  router.post('/quiz/criar', authenticateToken, async (req, res) => {
    const {
      titulo, descricao, serie_id, materia, dificuldade, tempo_limite, pontos_por_questao,
      permite_tentativas, max_tentativas, data_inicio, data_fim, tipo_destinatario, alunos_selecionados, questoes
    } = req.body;

    if (!titulo || !serie_id || !materia || !questoes || !questoes.length) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const insertQuizQuery = `
          INSERT INTO quizzes (escola_id, serie_id, titulo, descricao, materia, dificuldade, tempo_limite, 
                              pontos_por_questao, permite_tentativas, max_tentativas, data_inicio, data_fim, 
                              tipo_destinatario, status, data_criacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ativo', CURRENT_TIMESTAMP)
          RETURNING id
        `;
        const quizResult = await client.query(insertQuizQuery, [
          req.user.id, serie_id, titulo, descricao, materia, dificuldade, tempo_limite,
          pontos_por_questao, permite_tentativas, max_tentativas || 3, data_inicio, data_fim, tipo_destinatario
        ]);

        const quizId = quizResult.rows[0].id;

        for (const questao of questoes) {
          const insertQuestaoQuery = `
            INSERT INTO quiz_questoes (quiz_id, pergunta, tipo, opcoes, resposta_correta, explicacao)
            VALUES ($1, $2, $3, $4, $5, $6)
          `;
          await client.query(insertQuestaoQuery, [
            quizId, questao.pergunta, questao.tipo, questao.opcoes, questao.resposta_correta, questao.explicacao
          ]);
        }

        if (tipo_destinatario === 'individual' && alunos_selecionados.length > 0) {
          for (const alunoId of alunos_selecionados) {
            const insertDestinatarioQuery = `
              INSERT INTO quiz_destinatarios (quiz_id, crianca_id)
              VALUES ($1, $2)
            `;
            await client.query(insertDestinatarioQuery, [quizId, alunoId]);
          }
        }

        await client.query('COMMIT');
        res.json({ message: 'Quiz criado com sucesso' });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar quiz:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Atribuir tarefa
  router.post('/tarefa/atribuir', authenticateToken, async (req, res) => {
    const {
      titulo, descricao, tipo, materia, serie_id, dificuldade, pontos_recompensa, data_limite,
      tipo_destinatario, alunos_selecionados, criterios_avaliacao, permite_reenvio, max_tentativas
    } = req.body;

    if (!titulo || !serie_id || !materia || !data_limite) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const insertTarefaQuery = `
          INSERT INTO tarefas (escola_id, serie_id, titulo, descricao, tipo, materia, dificuldade, 
                              pontos_recompensa, data_limite, tipo_destinatario, criterios_avaliacao, 
                              permite_reenvio, max_tentativas, status, data_criacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ativa', CURRENT_TIMESTAMP)
          RETURNING id
        `;
        const tarefaResult = await client.query(insertTarefaQuery, [
          req.user.id, serie_id, titulo, descricao, tipo, materia, dificuldade,
          pontos_recompensa, data_limite, tipo_destinatario, criterios_avaliacao,
          permite_reenvio, max_tentativas || 3
        ]);

        const tarefaId = tarefaResult.rows[0].id;

        if (tipo_destinatario === 'individual' && alunos_selecionados.length > 0) {
          for (const alunoId of alunos_selecionados) {
            const insertDestinatarioQuery = `
              INSERT INTO tarefa_destinatarios (tarefa_id, crianca_id)
              VALUES ($1, $2)
            `;
            await client.query(insertDestinatarioQuery, [tarefaId, alunoId]);
          }
        }

        await client.query('COMMIT');
        res.json({ message: 'Tarefa atribuída com sucesso' });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao atribuir tarefa:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Enviar mensagem
  router.post('/mensagem/enviar', authenticateToken, async (req, res) => {
    const {
      assunto, mensagem, tipo_destinatario, serie_id, alunos_selecionados, incluir_responsaveis,
      prioridade, categoria, agendamento, data_envio
    } = req.body;

    if (!assunto || !mensagem || (tipo_destinatario === 'serie' && !serie_id) || (tipo_destinatario === 'individual' && !alunos_selecionados.length)) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const insertMensagemQuery = `
          INSERT INTO mensagens (escola_id, serie_id, assunto, mensagem, tipo_destinatario, 
                                incluir_responsaveis, prioridade, categoria, agendamento, data_envio, 
                                status, data_criacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
          RETURNING id
        `;
        const mensagemResult = await client.query(insertMensagemQuery, [
          req.user.id, tipo_destinatario === 'serie' ? serie_id : null, assunto, mensagem,
          tipo_destinatario, incluir_responsaveis, prioridade, categoria, agendamento,
          agendamento ? data_envio : null, agendamento ? 'agendada' : 'enviada'
        ]);

        const mensagemId = mensagemResult.rows[0].id;

        if (tipo_destinatario === 'individual' && alunos_selecionados.length > 0) {
          for (const alunoId of alunos_selecionados) {
            const insertDestinatarioQuery = `
              INSERT INTO mensagem_destinatarios (mensagem_id, crianca_id)
              VALUES ($1, $2)
            `;
            await client.query(insertDestinatarioQuery, [mensagemId, alunoId]);
          }
        }

        await client.query('COMMIT');
        res.json({ message: 'Mensagem enviada com sucesso' });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Dashboard - Estatísticas
  router.get('/dashboard/estatisticas', authenticateToken, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const query = `
          SELECT 
            (SELECT COUNT(*) FROM usuarios u WHERE u.tipo = 'crianca' AND u.serie_id IN 
              (SELECT id FROM escola_series WHERE escola_id = $1)) AS total_alunos,
            (SELECT COUNT(*) FROM quizzes WHERE escola_id = $1 AND status = 'ativo') AS total_quizzes,
            (SELECT COUNT(*) FROM tarefas WHERE escola_id = $1 AND status = 'ativa') AS total_tarefas,
            (SELECT COUNT(*) FROM mensagens WHERE escola_id = $1 AND status = 'enviada') AS total_mensagens,
            (SELECT COUNT(*) FROM quizzes WHERE escola_id = $1 AND status = 'pendente') AS quizzes_pendentes,
            (SELECT COUNT(*) FROM tarefas WHERE escola_id = $1 AND status = 'pendente') AS tarefas_pendentes
        `;
        const result = await client.query(query, [req.user.id]);
        res.json(result.rows[0]);
      } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Dashboard - Atividades recentes
  router.get('/dashboard/atividades-recentes', authenticateToken, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const query = `
          SELECT 
            'quiz' AS tipo, id, titulo, materia, data_criacao AS data, 'ativo' AS status
          FROM quizzes 
          WHERE escola_id = $1
          UNION
          SELECT 
            'tarefa' AS tipo, id, titulo, materia, data_criacao AS data, status
          FROM tarefas 
          WHERE escola_id = $1
          UNION
          SELECT 
            'mensagem' AS tipo, id, assunto AS titulo, categoria AS materia, data_criacao AS data, status
          FROM mensagens 
          WHERE escola_id = $1
          ORDER BY data DESC
          LIMIT 10
        `;
        const result = await client.query(query, [req.user.id]);
        res.json({ atividades: result.rows });
      } catch (error) {
        console.error('Erro ao buscar atividades recentes:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Relatórios
  router.get('/relatorios', authenticateToken, async (req, res) => {
    const { periodo = 30, serie_id, materia, tipo_relatorio = 'geral' } = req.query;

    try {
      const client = await pool.connect();
      try {
        const relatorios = {
          geral: {},
          por_serie: [],
          por_materia: [],
          desempenho_mensal: [],
          atividades_recentes: []
        };

        // Geral
        const geralQuery = `
          SELECT 
            COUNT(DISTINCT u.id) AS total_alunos,
            COUNT(DISTINCT t.id) AS total_tarefas,
            COUNT(DISTINCT q.id) AS total_quizzes,
            AVG(COALESCE(q.pontuacao, 0)) AS media_pontuacao
          FROM usuarios u
          LEFT JOIN tarefas t ON u.id = t.crianca_id AND t.data_criacao >= NOW() - INTERVAL '${periodo} days'
          LEFT JOIN quizzes q ON u.id = q.crianca_id AND q.data_criacao >= NOW() - INTERVAL '${periodo} days'
          WHERE u.tipo = 'crianca' AND u.serie_id IN 
            (SELECT id FROM escola_series WHERE escola_id = $1)
            ${serie_id ? 'AND u.serie_id = $2' : ''}
            ${materia ? 'AND (t.materia = $3 OR q.materia = $3)' : ''}
        `;
        const geralParams = [req.user.id];
        if (serie_id) geralParams.push(serie_id);
        if (materia) geralParams.push(materia);
        const geralResult = await client.query(geralQuery, geralParams);
        relatorios.geral = geralResult.rows[0];

        // Por série
        if (tipo_relatorio === 'geral' || tipo_relatorio === 'desempenho') {
          const serieQuery = `
            SELECT 
              es.id, es.nome, COUNT(DISTINCT u.id) AS total_alunos,
              COUNT(DISTINCT t.id) AS tarefas_concluidas,
              COUNT(DISTINCT q.id) AS quizzes_concluidos,
              AVG(COALESCE(q.pontuacao, 0)) AS media_pontuacao
            FROM escola_series es
            LEFT JOIN usuarios u ON u.serie_id = es.id
            LEFT JOIN tarefas t ON u.id = t.crianca_id AND t.data_criacao >= NOW() - INTERVAL '${periodo} days'
            LEFT JOIN quizzes q ON u.id = q.crianca_id AND q.data_criacao >= NOW() - INTERVAL '${periodo} days'
            WHERE es.escola_id = $1
            ${serie_id ? 'AND es.id = $2' : ''}
            GROUP BY es.id, es.nome
          `;
          const serieParams = [req.user.id];
          if (serie_id) serieParams.push(serie_id);
          const serieResult = await client.query(serieQuery, serieParams);
          relatorios.por_serie = serieResult.rows;
        }

        // Por matéria
        if (tipo_relatorio === 'geral' || tipo_relatorio === 'desempenho') {
          const materiaQuery = `
            SELECT 
              COALESCE(t.materia, q.materia) AS nome,
              COUNT(DISTINCT COALESCE(t.id, q.id)) AS total_atividades,
              AVG(COALESCE(q.pontuacao, 0)) AS media_pontuacao
            FROM tarefas t
            FULL OUTER JOIN quizzes q ON q.materia = t.materia
            WHERE (t.escola_id = $1 OR q.escola_id = $1)
            AND (t.data_criacao >= NOW() - INTERVAL '${periodo} days' OR q.data_criacao >= NOW() - INTERVAL '${periodo} days')
            ${materia ? 'AND (t.materia = $2 OR q.materia = $2)' : ''}
            GROUP BY COALESCE(t.materia, q.materia)
          `;
          const materiaParams = [req.user.id];
          if (materia) materiaParams.push(materia);
          const materiaResult = await client.query(materiaQuery, materiaParams);
          relatorios.por_materia = materiaResult.rows;
        }

        // Atividades recentes
        if (tipo_relatorio === 'geral' || tipo_relatorio === 'atividades') {
          const atividadesQuery = `
            SELECT 
              'quiz' AS tipo, id, titulo, materia, serie_id, es.nome AS serie, data_criacao AS data,
              COUNT(DISTINCT qd.crianca_id) AS participantes,
              AVG(COALESCE(q.pontuacao, 0)) AS taxa_conclusao
            FROM quizzes q
            LEFT JOIN escola_series es ON q.serie_id = es.id
            LEFT JOIN quiz_destinatarios qd ON q.id = qd.quiz_id
            WHERE q.escola_id = $1 AND q.data_criacao >= NOW() - INTERVAL '${periodo} days'
            ${serie_id ? 'AND q.serie_id = $2' : ''}
            ${materia ? 'AND q.materia = $3' : ''}
            GROUP BY q.id, q.titulo, q.materia, q.serie_id, es.nome
            UNION
            SELECT 
              'tarefa' AS tipo, id, titulo, materia, serie_id, es.nome AS serie, data_criacao AS data,
              COUNT(DISTINCT td.crianca_id) AS participantes,
              AVG(CASE WHEN t.status = 'concluida' THEN 100 ELSE 0 END) AS taxa_conclusao
            FROM tarefas t
            LEFT JOIN escola_series es ON t.serie_id = es.id
            LEFT JOIN tarefa_destinatarios td ON t.id = td.tarefa_id
            WHERE t.escola_id = $1 AND t.data_criacao >= NOW() - INTERVAL '${periodo} days'
            ${serie_id ? 'AND t.serie_id = $2' : ''}
            ${materia ? 'AND t.materia = $3' : ''}
            GROUP BY t.id, t.titulo, t.materia, t.serie_id, es.nome
            ORDER BY data DESC
            LIMIT 10
          `;
          const atividadesParams = [req.user.id];
          if (serie_id) atividadesParams.push(serie_id);
          if (materia) atividadesParams.push(materia);
          const atividadesResult = await client.query(atividadesQuery, atividadesParams);
          relatorios.atividades_recentes = atividadesResult.rows;
        }

        res.json(relatorios);
      } catch (error) {
        console.error('Erro ao buscar relatórios:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Exportar relatórios
  router.get('/relatorios/exportar', authenticateToken, async (req, res) => {
    const { periodo = 30, serie_id, materia, tipo_relatorio = 'geral', formato } = req.query;

    if (!['pdf', 'excel'].includes(formato)) {
      return res.status(400).json({ error: 'Formato inválido (use pdf ou excel)' });
    }

    try {
      const client = await pool.connect();
      try {
        const relatorios = {
          geral: {},
          por_serie: [],
          por_materia: [],
          atividades_recentes: []
        };

        const geralQuery = `
          SELECT 
            COUNT(DISTINCT u.id) AS total_alunos,
            COUNT(DISTINCT t.id) AS total_tarefas,
            COUNT(DISTINCT q.id) AS total_quizzes,
            AVG(COALESCE(q.pontuacao, 0)) AS media_pontuacao
          FROM usuarios u
          LEFT JOIN tarefas t ON u.id = t.crianca_id AND t.data_criacao >= NOW() - INTERVAL '${periodo} days'
          LEFT JOIN quizzes q ON u.id = q.crianca_id AND q.data_criacao >= NOW() - INTERVAL '${periodo} days'
          WHERE u.tipo = 'crianca' AND u.serie_id IN 
            (SELECT id FROM escola_series WHERE escola_id = $1)
            ${serie_id ? 'AND u.serie_id = $2' : ''}
            ${materia ? 'AND (t.materia = $3 OR q.materia = $3)' : ''}
        `;
        const geralParams = [req.user.id];
        if (serie_id) geralParams.push(serie_id);
        if (materia) geralParams.push(materia);
        const geralResult = await client.query(geralQuery, geralParams);
        relatorios.geral = geralResult.rows[0];

        const serieQuery = `
          SELECT 
            es.id, es.nome, COUNT(DISTINCT u.id) AS total_alunos,
            COUNT(DISTINCT t.id) AS tarefas_concluidas,
            COUNT(DISTINCT q.id) AS quizzes_concluidos,
            AVG(COALESCE(q.pontuacao, 0)) AS media_pontuacao
          FROM escola_series es
          LEFT JOIN usuarios u ON u.serie_id = es.id
          LEFT JOIN tarefas t ON u.id = t.crianca_id AND t.data_criacao >= NOW() - INTERVAL '${periodo} days'
          LEFT JOIN quizzes q ON u.id = q.crianca_id AND q.data_criacao >= NOW() - INTERVAL '${periodo} days'
          WHERE es.escola_id = $1
          ${serie_id ? 'AND es.id = $2' : ''}
          GROUP BY es.id, es.nome
        `;
        const serieParams = [req.user.id];
        if (serie_id) serieParams.push(serie_id);
        const serieResult = await client.query(serieQuery, serieParams);
        relatorios.por_serie = serieResult.rows;

        const materiaQuery = `
          SELECT 
            COALESCE(t.materia, q.materia) AS nome,
            COUNT(DISTINCT COALESCE(t.id, q.id)) AS total_atividades,
            AVG(COALESCE(q.pontuacao, 0)) AS media_pontuacao
          FROM tarefas t
          FULL OUTER JOIN quizzes q ON q.materia = t.materia
          WHERE (t.escola_id = $1 OR q.escola_id = $1)
          AND (t.data_criacao >= NOW() - INTERVAL '${periodo} days' OR q.data_criacao >= NOW() - INTERVAL '${periodo} days')
          ${materia ? 'AND (t.materia = $2 OR q.materia = $2)' : ''}
          GROUP BY COALESCE(t.materia, q.materia)
        `;
        const materiaParams = [req.user.id];
        if (materia) materiaParams.push(materia);
        const materiaResult = await client.query(materiaQuery, materiaParams);
        relatorios.por_materia = materiaResult.rows;

        // Aqui, você implementaria a lógica para gerar PDF ou Excel
        // Por simplicidade, retornamos um JSON como placeholder
        res.setHeader('Content-Disposition', `attachment; filename=relatorio.${formato}`);
        res.json(relatorios); // Substitua por geração de PDF/Excel conforme necessário
      } catch (error) {
        console.error('Erro ao exportar relatório:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Listar escolas (para uso no cadastro de criança)
  router.get('/listar', async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const query = 'SELECT id, nome FROM escolas WHERE status = \'ativo\'';
        const result = await client.query(query);
        res.json({ escolas: result.rows });
      } catch (error) {
        console.error('Erro ao listar escolas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao conectar ao banco:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  return router;
};

module.exports = escolaRoutes;