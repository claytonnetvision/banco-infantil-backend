-- Script SQL para configurar as tabelas da escola no banco de dados
-- Execute este script no seu banco PostgreSQL

-- Criar tabela de escolas (se não existir)
CREATE TABLE IF NOT EXISTS escolas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    endereco TEXT,
    cnpj VARCHAR(18),
    status VARCHAR(20) DEFAULT 'ativo',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir escola de teste se não existir
INSERT INTO escolas (nome, email, senha, status) 
SELECT 'Escola Teste 01', 'escola01@gmail.com', 'Aregano0', 'ativo'
WHERE NOT EXISTS (
    SELECT 1 FROM escolas WHERE email = 'escola01@gmail.com'
);

-- Criar tabela de séries
CREATE TABLE IF NOT EXISTS series (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    ano_letivo INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    status VARCHAR(20) DEFAULT 'ativo',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir séries padrão para a escola de teste
DO $$
DECLARE
    escola_id_var INTEGER;
BEGIN
    SELECT id INTO escola_id_var FROM escolas WHERE email = 'escola01@gmail.com';
    
    IF escola_id_var IS NOT NULL THEN
        INSERT INTO series (escola_id, nome, descricao) 
        SELECT escola_id_var, '1º Ano', 'Primeiro ano do ensino fundamental'
        WHERE NOT EXISTS (
            SELECT 1 FROM series WHERE escola_id = escola_id_var AND nome = '1º Ano'
        );
        
        INSERT INTO series (escola_id, nome, descricao) 
        SELECT escola_id_var, '2º Ano', 'Segundo ano do ensino fundamental'
        WHERE NOT EXISTS (
            SELECT 1 FROM series WHERE escola_id = escola_id_var AND nome = '2º Ano'
        );
        
        INSERT INTO series (escola_id, nome, descricao) 
        SELECT escola_id_var, '3º Ano', 'Terceiro ano do ensino fundamental'
        WHERE NOT EXISTS (
            SELECT 1 FROM series WHERE escola_id = escola_id_var AND nome = '3º Ano'
        );
        
        INSERT INTO series (escola_id, nome, descricao) 
        SELECT escola_id_var, '4º Ano', 'Quarto ano do ensino fundamental'
        WHERE NOT EXISTS (
            SELECT 1 FROM series WHERE escola_id = escola_id_var AND nome = '4º Ano'
        );
        
        INSERT INTO series (escola_id, nome, descricao) 
        SELECT escola_id_var, '5º Ano', 'Quinto ano do ensino fundamental'
        WHERE NOT EXISTS (
            SELECT 1 FROM series WHERE escola_id = escola_id_var AND nome = '5º Ano'
        );
    END IF;
END $$;

-- Criar tabela de alunos da escola
CREATE TABLE IF NOT EXISTS alunos_escola (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    serie_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
    nome_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    sala VARCHAR(10),
    data_nascimento DATE,
    responsavel_nome VARCHAR(255),
    responsavel_email VARCHAR(255),
    responsavel_telefone VARCHAR(20),
    observacoes TEXT,
    pontuacao_total INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ativo',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    serie_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    materia VARCHAR(100),
    dificuldade VARCHAR(20) DEFAULT 'medio',
    tempo_limite INTEGER DEFAULT 30,
    pontos_por_questao INTEGER DEFAULT 10,
    permite_tentativas BOOLEAN DEFAULT true,
    max_tentativas INTEGER DEFAULT 3,
    data_inicio TIMESTAMP,
    data_fim TIMESTAMP,
    tipo_destinatario VARCHAR(20) DEFAULT 'serie',
    status VARCHAR(20) DEFAULT 'ativo',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de questões dos quizzes
CREATE TABLE IF NOT EXISTS quiz_questoes (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'multipla_escolha',
    opcoes JSONB,
    resposta_correta INTEGER,
    explicacao TEXT,
    ordem INTEGER DEFAULT 1
);

-- Criar tabela de destinatários específicos dos quizzes
CREATE TABLE IF NOT EXISTS quiz_destinatarios (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
    aluno_id INTEGER REFERENCES alunos_escola(id) ON DELETE CASCADE,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de respostas dos quizzes
CREATE TABLE IF NOT EXISTS quiz_respostas (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
    aluno_id INTEGER REFERENCES alunos_escola(id) ON DELETE CASCADE,
    questao_id INTEGER REFERENCES quiz_questoes(id) ON DELETE CASCADE,
    resposta_selecionada INTEGER,
    correta BOOLEAN,
    pontos_obtidos INTEGER DEFAULT 0,
    data_resposta TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de tarefas da escola
CREATE TABLE IF NOT EXISTS tarefas_escola (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    serie_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo VARCHAR(50),
    materia VARCHAR(100),
    dificuldade VARCHAR(20) DEFAULT 'medio',
    pontos_recompensa INTEGER DEFAULT 10,
    data_limite TIMESTAMP,
    tipo_destinatario VARCHAR(20) DEFAULT 'serie',
    criterios_avaliacao TEXT,
    permite_reenvio BOOLEAN DEFAULT true,
    max_tentativas INTEGER DEFAULT 3,
    status VARCHAR(20) DEFAULT 'ativa',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de destinatários das tarefas
CREATE TABLE IF NOT EXISTS tarefa_destinatarios (
    id SERIAL PRIMARY KEY,
    tarefa_id INTEGER REFERENCES tarefas_escola(id) ON DELETE CASCADE,
    aluno_id INTEGER REFERENCES alunos_escola(id) ON DELETE CASCADE,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de submissões das tarefas
CREATE TABLE IF NOT EXISTS tarefa_submissoes (
    id SERIAL PRIMARY KEY,
    tarefa_id INTEGER REFERENCES tarefas_escola(id) ON DELETE CASCADE,
    aluno_id INTEGER REFERENCES alunos_escola(id) ON DELETE CASCADE,
    conteudo TEXT,
    arquivo_url VARCHAR(500),
    pontos_obtidos INTEGER DEFAULT 0,
    feedback TEXT,
    status VARCHAR(20) DEFAULT 'enviada',
    data_submissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_avaliacao TIMESTAMP
);

-- Criar tabela de mensagens da escola
CREATE TABLE IF NOT EXISTS mensagens_escola (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    serie_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
    assunto VARCHAR(255) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo_destinatario VARCHAR(20) DEFAULT 'serie',
    incluir_responsaveis BOOLEAN DEFAULT false,
    prioridade VARCHAR(20) DEFAULT 'normal',
    categoria VARCHAR(50),
    agendamento BOOLEAN DEFAULT false,
    data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'enviada'
);

-- Criar tabela de destinatários das mensagens
CREATE TABLE IF NOT EXISTS mensagem_destinatarios (
    id SERIAL PRIMARY KEY,
    mensagem_id INTEGER REFERENCES mensagens_escola(id) ON DELETE CASCADE,
    aluno_id INTEGER REFERENCES alunos_escola(id) ON DELETE CASCADE,
    lida BOOLEAN DEFAULT false,
    data_leitura TIMESTAMP
);

-- Criar tabela de chat
CREATE TABLE IF NOT EXISTS chat_mensagens (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    destinatario_id INTEGER REFERENCES alunos_escola(id) ON DELETE CASCADE,
    tipo_destinatario VARCHAR(20) DEFAULT 'aluno',
    remetente_tipo VARCHAR(20) NOT NULL,
    mensagem TEXT NOT NULL,
    lida BOOLEAN DEFAULT false,
    data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de estatísticas da escola
CREATE TABLE IF NOT EXISTS escola_estatisticas (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
    data_referencia DATE DEFAULT CURRENT_DATE,
    total_alunos INTEGER DEFAULT 0,
    total_quizzes INTEGER DEFAULT 0,
    total_tarefas INTEGER DEFAULT 0,
    total_mensagens INTEGER DEFAULT 0,
    quizzes_pendentes INTEGER DEFAULT 0,
    tarefas_pendentes INTEGER DEFAULT 0,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(escola_id, data_referencia)
);

-- Criar função para calcular pontuação do aluno
CREATE OR REPLACE FUNCTION calcular_pontuacao_aluno(aluno_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
    pontos_quiz INTEGER := 0;
    pontos_tarefa INTEGER := 0;
    total_pontos INTEGER := 0;
BEGIN
    -- Pontos dos quizzes
    SELECT COALESCE(SUM(pontos_obtidos), 0) INTO pontos_quiz
    FROM quiz_respostas
    WHERE aluno_id = aluno_id_param;
    
    -- Pontos das tarefas
    SELECT COALESCE(SUM(pontos_obtidos), 0) INTO pontos_tarefa
    FROM tarefa_submissoes
    WHERE aluno_id = aluno_id_param AND status = 'avaliada';
    
    total_pontos := pontos_quiz + pontos_tarefa;
    
    -- Atualizar pontuação do aluno
    UPDATE alunos_escola 
    SET pontuacao_total = total_pontos,
        data_atualizacao = CURRENT_TIMESTAMP
    WHERE id = aluno_id_param;
    
    RETURN total_pontos;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar estatísticas automaticamente
CREATE OR REPLACE FUNCTION atualizar_estatisticas_escola()
RETURNS TRIGGER AS $$
DECLARE
    escola_id_var INTEGER;
BEGIN
    -- Determinar escola_id baseado na tabela que disparou o trigger
    IF TG_TABLE_NAME = 'alunos_escola' THEN
        escola_id_var := COALESCE(NEW.escola_id, OLD.escola_id);
    ELSIF TG_TABLE_NAME = 'quizzes' THEN
        escola_id_var := COALESCE(NEW.escola_id, OLD.escola_id);
    ELSIF TG_TABLE_NAME = 'tarefas_escola' THEN
        escola_id_var := COALESCE(NEW.escola_id, OLD.escola_id);
    ELSIF TG_TABLE_NAME = 'mensagens_escola' THEN
        escola_id_var := COALESCE(NEW.escola_id, OLD.escola_id);
    END IF;
    
    -- Atualizar ou inserir estatísticas
    INSERT INTO escola_estatisticas (
        escola_id,
        total_alunos,
        total_quizzes,
        total_tarefas,
        total_mensagens,
        quizzes_pendentes,
        tarefas_pendentes
    )
    SELECT 
        escola_id_var,
        (SELECT COUNT(*) FROM alunos_escola WHERE escola_id = escola_id_var AND status = 'ativo'),
        (SELECT COUNT(*) FROM quizzes WHERE escola_id = escola_id_var),
        (SELECT COUNT(*) FROM tarefas_escola WHERE escola_id = escola_id_var),
        (SELECT COUNT(*) FROM mensagens_escola WHERE escola_id = escola_id_var),
        (SELECT COUNT(*) FROM quizzes WHERE escola_id = escola_id_var AND status = 'ativo' AND (data_fim IS NULL OR data_fim > NOW())),
        (SELECT COUNT(*) FROM tarefas_escola WHERE escola_id = escola_id_var AND status = 'ativa' AND data_limite > NOW())
    ON CONFLICT (escola_id, data_referencia)
    DO UPDATE SET
        total_alunos = EXCLUDED.total_alunos,
        total_quizzes = EXCLUDED.total_quizzes,
        total_tarefas = EXCLUDED.total_tarefas,
        total_mensagens = EXCLUDED.total_mensagens,
        quizzes_pendentes = EXCLUDED.quizzes_pendentes,
        tarefas_pendentes = EXCLUDED.tarefas_pendentes,
        data_atualizacao = CURRENT_TIMESTAMP;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para atualização automática de estatísticas
DROP TRIGGER IF EXISTS trigger_estatisticas_alunos ON alunos_escola;
CREATE TRIGGER trigger_estatisticas_alunos
    AFTER INSERT OR UPDATE OR DELETE ON alunos_escola
    FOR EACH ROW EXECUTE FUNCTION atualizar_estatisticas_escola();

DROP TRIGGER IF EXISTS trigger_estatisticas_quizzes ON quizzes;
CREATE TRIGGER trigger_estatisticas_quizzes
    AFTER INSERT OR UPDATE OR DELETE ON quizzes
    FOR EACH ROW EXECUTE FUNCTION atualizar_estatisticas_escola();

DROP TRIGGER IF EXISTS trigger_estatisticas_tarefas ON tarefas_escola;
CREATE TRIGGER trigger_estatisticas_tarefas
    AFTER INSERT OR UPDATE OR DELETE ON tarefas_escola
    FOR EACH ROW EXECUTE FUNCTION atualizar_estatisticas_escola();

DROP TRIGGER IF EXISTS trigger_estatisticas_mensagens ON mensagens_escola;
CREATE TRIGGER trigger_estatisticas_mensagens
    AFTER INSERT OR UPDATE OR DELETE ON mensagens_escola
    FOR EACH ROW EXECUTE FUNCTION atualizar_estatisticas_escola();

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_alunos_escola_escola_id ON alunos_escola(escola_id);
CREATE INDEX IF NOT EXISTS idx_alunos_escola_serie_id ON alunos_escola(serie_id);
CREATE INDEX IF NOT EXISTS idx_alunos_escola_email ON alunos_escola(email);
CREATE INDEX IF NOT EXISTS idx_series_escola_id ON series(escola_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_escola_id ON quizzes(escola_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_serie_id ON quizzes(serie_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questoes_quiz_id ON quiz_questoes(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_respostas_quiz_id ON quiz_respostas(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_respostas_aluno_id ON quiz_respostas(aluno_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_escola_escola_id ON tarefas_escola(escola_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_escola_serie_id ON tarefas_escola(serie_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_submissoes_tarefa_id ON tarefa_submissoes(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_submissoes_aluno_id ON tarefa_submissoes(aluno_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_escola_escola_id ON mensagens_escola(escola_id);
CREATE INDEX IF NOT EXISTS idx_chat_mensagens_escola_id ON chat_mensagens(escola_id);
CREATE INDEX IF NOT EXISTS idx_chat_mensagens_destinatario_id ON chat_mensagens(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_escola_estatisticas_escola_id ON escola_estatisticas(escola_id);

-- Atualizar estatísticas iniciais para todas as escolas
INSERT INTO escola_estatisticas (
    escola_id,
    total_alunos,
    total_quizzes,
    total_tarefas,
    total_mensagens,
    quizzes_pendentes,
    tarefas_pendentes
)
SELECT 
    e.id,
    COALESCE(alunos.total, 0),
    COALESCE(quizzes.total, 0),
    COALESCE(tarefas.total, 0),
    COALESCE(mensagens.total, 0),
    COALESCE(quizzes_pendentes.total, 0),
    COALESCE(tarefas_pendentes.total, 0)
FROM escolas e
LEFT JOIN (
    SELECT escola_id, COUNT(*) as total 
    FROM alunos_escola 
    WHERE status = 'ativo' 
    GROUP BY escola_id
) alunos ON e.id = alunos.escola_id
LEFT JOIN (
    SELECT escola_id, COUNT(*) as total 
    FROM quizzes 
    GROUP BY escola_id
) quizzes ON e.id = quizzes.escola_id
LEFT JOIN (
    SELECT escola_id, COUNT(*) as total 
    FROM tarefas_escola 
    GROUP BY escola_id
) tarefas ON e.id = tarefas.escola_id
LEFT JOIN (
    SELECT escola_id, COUNT(*) as total 
    FROM mensagens_escola 
    GROUP BY escola_id
) mensagens ON e.id = mensagens.escola_id
LEFT JOIN (
    SELECT escola_id, COUNT(*) as total 
    FROM quizzes 
    WHERE status = 'ativo' AND (data_fim IS NULL OR data_fim > NOW())
    GROUP BY escola_id
) quizzes_pendentes ON e.id = quizzes_pendentes.escola_id
LEFT JOIN (
    SELECT escola_id, COUNT(*) as total 
    FROM tarefas_escola 
    WHERE status = 'ativa' AND data_limite > NOW()
    GROUP BY escola_id
) tarefas_pendentes ON e.id = tarefas_pendentes.escola_id
ON CONFLICT (escola_id, data_referencia) DO NOTHING;

-- Mensagem de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Banco de dados da escola configurado com sucesso!';
    RAISE NOTICE 'Tabelas criadas: escolas, series, alunos_escola, quizzes, quiz_questoes, quiz_destinatarios, quiz_respostas, tarefas_escola, tarefa_destinatarios, tarefa_submissoes, mensagens_escola, mensagem_destinatarios, chat_mensagens, escola_estatisticas';
    RAISE NOTICE 'Escola de teste criada: escola01@gmail.com / Aregano0';
    RAISE NOTICE 'Séries padrão criadas: 1º Ano, 2º Ano, 3º Ano, 4º Ano, 5º Ano';
    RAISE NOTICE 'Triggers e índices criados para otimização';
END $$;

