-- =====================================================
-- SCRIPT DE CRIAÇÃO DAS TABELAS DA FUNCIONALIDADE ESCOLA
-- BANCO DE DADOS: PostgreSQL 16.9
-- PROJETO: TarefinhaPaga - Sistema de Tarefas Remuneradas
-- =====================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. TABELA PRINCIPAL DAS ESCOLAS
-- =====================================================

CREATE TABLE escolas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    endereco TEXT NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    estado VARCHAR(2) NOT NULL,
    cep VARCHAR(10) NOT NULL,
    diretor VARCHAR(255) NOT NULL,
    telefone_diretor VARCHAR(20) NOT NULL,
    email_diretor VARCHAR(255) NOT NULL,
    numero_alunos INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso')),
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para a tabela escolas
CREATE INDEX idx_escolas_email ON escolas(email);
CREATE INDEX idx_escolas_cnpj ON escolas(cnpj);
CREATE INDEX idx_escolas_status ON escolas(status);

-- Trigger para atualizar data_atualizacao automaticamente
CREATE OR REPLACE FUNCTION update_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_escolas_update_timestamp
    BEFORE UPDATE ON escolas
    FOR EACH ROW
    EXECUTE FUNCTION update_data_atualizacao();

-- =====================================================
-- 2. SÉRIES OFERECIDAS PELAS ESCOLAS
-- =====================================================

CREATE TABLE escola_series (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER NOT NULL,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    ano_letivo INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    ativa BOOLEAN DEFAULT TRUE,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_escola_series_escola FOREIGN KEY (escola_id) 
        REFERENCES escolas(id) ON DELETE CASCADE
);

-- Índices para a tabela escola_series
CREATE INDEX idx_escola_series_escola_id ON escola_series(escola_id);
CREATE INDEX idx_escola_series_ativa ON escola_series(ativa);

-- =====================================================
-- 3. QUIZZES CRIADOS PELAS ESCOLAS
-- =====================================================

CREATE TABLE escola_quizzes (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    serie_id INTEGER,
    materia VARCHAR(100) NOT NULL,
    dificuldade VARCHAR(20) DEFAULT 'facil' CHECK (dificuldade IN ('facil', 'medio', 'dificil')),
    tempo_limite INTEGER DEFAULT 30, -- em minutos
    pontos_por_questao INTEGER DEFAULT 10,
    permite_tentativas BOOLEAN DEFAULT TRUE,
    max_tentativas INTEGER DEFAULT 3,
    data_inicio TIMESTAMP,
    data_fim TIMESTAMP,
    tipo_destinatario VARCHAR(20) DEFAULT 'serie' CHECK (tipo_destinatario IN ('serie', 'individual', 'todos')),
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_escola_quizzes_escola FOREIGN KEY (escola_id) 
        REFERENCES escolas(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_quizzes_serie FOREIGN KEY (serie_id) 
        REFERENCES escola_series(id) ON DELETE SET NULL
);

-- Índices para a tabela escola_quizzes
CREATE INDEX idx_escola_quizzes_escola_id ON escola_quizzes(escola_id);
CREATE INDEX idx_escola_quizzes_serie_id ON escola_quizzes(serie_id);
CREATE INDEX idx_escola_quizzes_materia ON escola_quizzes(materia);
CREATE INDEX idx_escola_quizzes_status ON escola_quizzes(status);

-- Trigger para atualizar data_atualizacao
CREATE TRIGGER tr_escola_quizzes_update_timestamp
    BEFORE UPDATE ON escola_quizzes
    FOR EACH ROW
    EXECUTE FUNCTION update_data_atualizacao();

-- =====================================================
-- 4. QUESTÕES DOS QUIZZES
-- =====================================================

CREATE TABLE escola_quiz_questoes (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL,
    pergunta TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'multipla_escolha' CHECK (tipo IN ('multipla_escolha', 'verdadeiro_falso')),
    opcoes JSONB, -- Array com as opções de resposta
    resposta_correta INTEGER NOT NULL,
    explicacao TEXT,
    ordem INTEGER DEFAULT 1,
    pontos INTEGER DEFAULT 10,
    
    CONSTRAINT fk_escola_quiz_questoes_quiz FOREIGN KEY (quiz_id) 
        REFERENCES escola_quizzes(id) ON DELETE CASCADE
);

-- Índices para a tabela escola_quiz_questoes
CREATE INDEX idx_escola_quiz_questoes_quiz_id ON escola_quiz_questoes(quiz_id);
CREATE INDEX idx_escola_quiz_questoes_ordem ON escola_quiz_questoes(ordem);

-- =====================================================
-- 5. ATRIBUIÇÕES DE QUIZZES AOS ALUNOS
-- =====================================================

CREATE TABLE escola_quiz_atribuicoes (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL,
    aluno_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'expirada')),
    data_atribuicao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_inicio TIMESTAMP,
    data_conclusao TIMESTAMP,
    tentativas_realizadas INTEGER DEFAULT 0,
    melhor_pontuacao INTEGER DEFAULT 0,
    
    CONSTRAINT fk_escola_quiz_atribuicoes_quiz FOREIGN KEY (quiz_id) 
        REFERENCES escola_quizzes(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_quiz_atribuicoes_aluno FOREIGN KEY (aluno_id) 
        REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT unique_quiz_aluno UNIQUE (quiz_id, aluno_id)
);

-- Índices para a tabela escola_quiz_atribuicoes
CREATE INDEX idx_escola_quiz_atribuicoes_quiz_id ON escola_quiz_atribuicoes(quiz_id);
CREATE INDEX idx_escola_quiz_atribuicoes_aluno_id ON escola_quiz_atribuicoes(aluno_id);
CREATE INDEX idx_escola_quiz_atribuicoes_status ON escola_quiz_atribuicoes(status);

-- =====================================================
-- 6. RESPOSTAS DOS ALUNOS AOS QUIZZES
-- =====================================================

CREATE TABLE escola_quiz_respostas (
    id SERIAL PRIMARY KEY,
    atribuicao_id INTEGER NOT NULL,
    questao_id INTEGER NOT NULL,
    resposta_selecionada INTEGER,
    correta BOOLEAN DEFAULT FALSE,
    pontos_obtidos INTEGER DEFAULT 0,
    tempo_resposta INTEGER, -- em segundos
    data_resposta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_escola_quiz_respostas_atribuicao FOREIGN KEY (atribuicao_id) 
        REFERENCES escola_quiz_atribuicoes(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_quiz_respostas_questao FOREIGN KEY (questao_id) 
        REFERENCES escola_quiz_questoes(id) ON DELETE CASCADE,
    CONSTRAINT unique_atribuicao_questao UNIQUE (atribuicao_id, questao_id)
);

-- Índices para a tabela escola_quiz_respostas
CREATE INDEX idx_escola_quiz_respostas_atribuicao_id ON escola_quiz_respostas(atribuicao_id);
CREATE INDEX idx_escola_quiz_respostas_questao_id ON escola_quiz_respostas(questao_id);

-- =====================================================
-- 7. TAREFAS CRIADAS PELAS ESCOLAS
-- =====================================================

CREATE TABLE escola_tarefas (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'educativa' CHECK (tipo IN ('educativa', 'criativa', 'pesquisa', 'pratica', 'leitura', 'redacao', 'matematica', 'ciencias')),
    materia VARCHAR(100) NOT NULL,
    serie_id INTEGER,
    dificuldade VARCHAR(20) DEFAULT 'facil' CHECK (dificuldade IN ('facil', 'medio', 'dificil')),
    pontos_recompensa INTEGER DEFAULT 50,
    data_limite TIMESTAMP NOT NULL,
    tipo_destinatario VARCHAR(20) DEFAULT 'serie' CHECK (tipo_destinatario IN ('serie', 'individual', 'todos')),
    criterios_avaliacao TEXT,
    permite_reenvio BOOLEAN DEFAULT TRUE,
    max_tentativas INTEGER DEFAULT 3,
    anexos JSONB, -- Array com URLs de arquivos anexos
    status VARCHAR(20) DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa', 'arquivada')),
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_escola_tarefas_escola FOREIGN KEY (escola_id) 
        REFERENCES escolas(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_tarefas_serie FOREIGN KEY (serie_id) 
        REFERENCES escola_series(id) ON DELETE SET NULL
);

-- Índices para a tabela escola_tarefas
CREATE INDEX idx_escola_tarefas_escola_id ON escola_tarefas(escola_id);
CREATE INDEX idx_escola_tarefas_serie_id ON escola_tarefas(serie_id);
CREATE INDEX idx_escola_tarefas_materia ON escola_tarefas(materia);
CREATE INDEX idx_escola_tarefas_status ON escola_tarefas(status);
CREATE INDEX idx_escola_tarefas_data_limite ON escola_tarefas(data_limite);

-- Trigger para atualizar data_atualizacao
CREATE TRIGGER tr_escola_tarefas_update_timestamp
    BEFORE UPDATE ON escola_tarefas
    FOR EACH ROW
    EXECUTE FUNCTION update_data_atualizacao();

-- =====================================================
-- 8. ATRIBUIÇÕES DE TAREFAS AOS ALUNOS
-- =====================================================

CREATE TABLE escola_tarefa_atribuicoes (
    id SERIAL PRIMARY KEY,
    tarefa_id INTEGER NOT NULL,
    aluno_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'entregue', 'avaliada', 'expirada')),
    data_atribuicao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_inicio TIMESTAMP,
    data_entrega TIMESTAMP,
    data_avaliacao TIMESTAMP,
    tentativas_realizadas INTEGER DEFAULT 0,
    
    CONSTRAINT fk_escola_tarefa_atribuicoes_tarefa FOREIGN KEY (tarefa_id) 
        REFERENCES escola_tarefas(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_tarefa_atribuicoes_aluno FOREIGN KEY (aluno_id) 
        REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT unique_tarefa_aluno UNIQUE (tarefa_id, aluno_id)
);

-- Índices para a tabela escola_tarefa_atribuicoes
CREATE INDEX idx_escola_tarefa_atribuicoes_tarefa_id ON escola_tarefa_atribuicoes(tarefa_id);
CREATE INDEX idx_escola_tarefa_atribuicoes_aluno_id ON escola_tarefa_atribuicoes(aluno_id);
CREATE INDEX idx_escola_tarefa_atribuicoes_status ON escola_tarefa_atribuicoes(status);

-- =====================================================
-- 9. ENTREGAS DAS TAREFAS PELOS ALUNOS
-- =====================================================

CREATE TABLE escola_tarefa_entregas (
    id SERIAL PRIMARY KEY,
    atribuicao_id INTEGER NOT NULL,
    conteudo TEXT NOT NULL,
    anexos JSONB, -- Array com URLs de arquivos anexos
    observacoes TEXT,
    pontuacao INTEGER,
    feedback TEXT,
    avaliado_por INTEGER, -- ID do professor/escola que avaliou
    data_entrega TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_avaliacao TIMESTAMP,
    
    CONSTRAINT fk_escola_tarefa_entregas_atribuicao FOREIGN KEY (atribuicao_id) 
        REFERENCES escola_tarefa_atribuicoes(id) ON DELETE CASCADE
);

-- Índices para a tabela escola_tarefa_entregas
CREATE INDEX idx_escola_tarefa_entregas_atribuicao_id ON escola_tarefa_entregas(atribuicao_id);
CREATE INDEX idx_escola_tarefa_entregas_data_entrega ON escola_tarefa_entregas(data_entrega);

-- =====================================================
-- 10. MENSAGENS ENVIADAS PELAS ESCOLAS
-- =====================================================

CREATE TABLE escola_mensagens (
    id SERIAL PRIMARY KEY,
    escola_id INTEGER NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo_destinatario VARCHAR(20) DEFAULT 'serie' CHECK (tipo_destinatario IN ('serie', 'individual', 'todos')),
    serie_id INTEGER,
    incluir_responsaveis BOOLEAN DEFAULT TRUE,
    prioridade VARCHAR(20) DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
    categoria VARCHAR(20) DEFAULT 'geral' CHECK (categoria IN ('geral', 'academico', 'evento', 'aviso', 'parabenizacao', 'lembrete', 'convite')),
    total_destinatarios INTEGER DEFAULT 0,
    agendamento BOOLEAN DEFAULT FALSE,
    data_envio TIMESTAMP,
    status VARCHAR(20) DEFAULT 'enviada' CHECK (status IN ('rascunho', 'agendada', 'enviada', 'cancelada')),
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_escola_mensagens_escola FOREIGN KEY (escola_id) 
        REFERENCES escolas(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_mensagens_serie FOREIGN KEY (serie_id) 
        REFERENCES escola_series(id) ON DELETE SET NULL
);

-- Índices para a tabela escola_mensagens
CREATE INDEX idx_escola_mensagens_escola_id ON escola_mensagens(escola_id);
CREATE INDEX idx_escola_mensagens_serie_id ON escola_mensagens(serie_id);
CREATE INDEX idx_escola_mensagens_status ON escola_mensagens(status);
CREATE INDEX idx_escola_mensagens_data_envio ON escola_mensagens(data_envio);

-- =====================================================
-- 11. DESTINATÁRIOS DAS MENSAGENS
-- =====================================================

CREATE TABLE escola_mensagem_destinatarios (
    id SERIAL PRIMARY KEY,
    mensagem_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo_usuario VARCHAR(20) NOT NULL CHECK (tipo_usuario IN ('aluno', 'responsavel')),
    status VARCHAR(20) DEFAULT 'nao_lida' CHECK (status IN ('nao_lida', 'lida', 'arquivada')),
    data_leitura TIMESTAMP,
    
    CONSTRAINT fk_escola_mensagem_destinatarios_mensagem FOREIGN KEY (mensagem_id) 
        REFERENCES escola_mensagens(id) ON DELETE CASCADE,
    CONSTRAINT fk_escola_mensagem_destinatarios_usuario FOREIGN KEY (usuario_id) 
        REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT unique_mensagem_usuario UNIQUE (mensagem_id, usuario_id)
);

-- Índices para a tabela escola_mensagem_destinatarios
CREATE INDEX idx_escola_mensagem_destinatarios_mensagem_id ON escola_mensagem_destinatarios(mensagem_id);
CREATE INDEX idx_escola_mensagem_destinatarios_usuario_id ON escola_mensagem_destinatarios(usuario_id);
CREATE INDEX idx_escola_mensagem_destinatarios_status ON escola_mensagem_destinatarios(status);

-- =====================================================
-- 12. ALTERAÇÕES NA TABELA USUARIOS EXISTENTE
-- =====================================================

-- Adicionar colunas para vincular alunos às escolas
-- IMPORTANTE: Execute apenas se a tabela usuarios já existir
-- Se a tabela não existir, remova os comentários das linhas abaixo

/*
ALTER TABLE usuarios 
ADD COLUMN escola_id INTEGER,
ADD COLUMN serie_id INTEGER;

-- Adicionar foreign keys
ALTER TABLE usuarios 
ADD CONSTRAINT fk_usuarios_escola FOREIGN KEY (escola_id) 
    REFERENCES escolas(id) ON DELETE SET NULL;

ALTER TABLE usuarios 
ADD CONSTRAINT fk_usuarios_serie FOREIGN KEY (serie_id) 
    REFERENCES escola_series(id) ON DELETE SET NULL;

-- Adicionar índices
CREATE INDEX idx_usuarios_escola_id ON usuarios(escola_id);
CREATE INDEX idx_usuarios_serie_id ON usuarios(serie_id);
*/

-- =====================================================
-- 13. ÍNDICES COMPOSTOS PARA PERFORMANCE
-- =====================================================

-- Índices compostos para consultas frequentes
CREATE INDEX idx_escola_quiz_ativo ON escola_quizzes(escola_id, status);
CREATE INDEX idx_escola_tarefa_ativa ON escola_tarefas(escola_id, status);
CREATE INDEX idx_aluno_quiz_status ON escola_quiz_atribuicoes(aluno_id, status);
CREATE INDEX idx_aluno_tarefa_status ON escola_tarefa_atribuicoes(aluno_id, status);
CREATE INDEX idx_mensagem_usuario_status ON escola_mensagem_destinatarios(usuario_id, status);

-- Índices para relatórios
CREATE INDEX idx_quiz_data_materia ON escola_quizzes(data_criacao, materia);
CREATE INDEX idx_tarefa_data_materia ON escola_tarefas(data_criacao, materia);
CREATE INDEX idx_resposta_data ON escola_quiz_respostas(data_resposta);
CREATE INDEX idx_entrega_data ON escola_tarefa_entregas(data_entrega);

-- =====================================================
-- 14. VIEWS PARA CONSULTAS OTIMIZADAS
-- =====================================================

-- View para estatísticas de desempenho por aluno
CREATE OR REPLACE VIEW vw_aluno_desempenho AS
SELECT 
    u.id as aluno_id,
    u.nome as aluno_nome,
    es.nome as serie_nome,
    COUNT(DISTINCT qa.id) as total_quizzes,
    COUNT(DISTINCT ta.id) as total_tarefas,
    AVG(qa.melhor_pontuacao) as media_quiz,
    AVG(te.pontuacao) as media_tarefa
FROM usuarios u
JOIN escola_series es ON u.serie_id = es.id
LEFT JOIN escola_quiz_atribuicoes qa ON qa.aluno_id = u.id AND qa.status = 'concluida'
LEFT JOIN escola_tarefa_atribuicoes ta ON ta.aluno_id = u.id AND ta.status = 'avaliada'
LEFT JOIN escola_tarefa_entregas te ON te.atribuicao_id = ta.id
WHERE u.tipo = 'filho'
GROUP BY u.id, u.nome, es.nome;

-- View para estatísticas da escola
CREATE OR REPLACE VIEW vw_escola_estatisticas AS
SELECT 
    e.id as escola_id,
    e.nome as escola_nome,
    COUNT(DISTINCT u.id) as total_alunos,
    COUNT(DISTINCT eq.id) as total_quizzes,
    COUNT(DISTINCT et.id) as total_tarefas,
    COUNT(DISTINCT em.id) as total_mensagens,
    COUNT(DISTINCT es.id) as total_series
FROM escolas e
LEFT JOIN usuarios u ON u.escola_id = e.id AND u.tipo = 'filho'
LEFT JOIN escola_quizzes eq ON eq.escola_id = e.id
LEFT JOIN escola_tarefas et ON et.escola_id = e.id
LEFT JOIN escola_mensagens em ON em.escola_id = e.id
LEFT JOIN escola_series es ON es.escola_id = e.id
GROUP BY e.id, e.nome;

-- =====================================================
-- 15. TRIGGERS DE AUDITORIA E CONTROLE
-- =====================================================

-- Trigger para atualizar numero_alunos na tabela escolas
CREATE OR REPLACE FUNCTION atualizar_numero_alunos()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.tipo = 'filho' AND NEW.escola_id IS NOT NULL THEN
            UPDATE escolas 
            SET numero_alunos = (
                SELECT COUNT(*) 
                FROM usuarios 
                WHERE escola_id = NEW.escola_id AND tipo = 'filho'
            )
            WHERE id = NEW.escola_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Atualizar escola anterior se mudou
        IF OLD.escola_id IS NOT NULL AND OLD.escola_id != COALESCE(NEW.escola_id, 0) THEN
            UPDATE escolas 
            SET numero_alunos = (
                SELECT COUNT(*) 
                FROM usuarios 
                WHERE escola_id = OLD.escola_id AND tipo = 'filho'
            )
            WHERE id = OLD.escola_id;
        END IF;
        
        -- Atualizar nova escola
        IF NEW.tipo = 'filho' AND NEW.escola_id IS NOT NULL THEN
            UPDATE escolas 
            SET numero_alunos = (
                SELECT COUNT(*) 
                FROM usuarios 
                WHERE escola_id = NEW.escola_id AND tipo = 'filho'
            )
            WHERE id = NEW.escola_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.tipo = 'filho' AND OLD.escola_id IS NOT NULL THEN
            UPDATE escolas 
            SET numero_alunos = (
                SELECT COUNT(*) 
                FROM usuarios 
                WHERE escola_id = OLD.escola_id AND tipo = 'filho'
            )
            WHERE id = OLD.escola_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger apenas se a tabela usuarios existir
-- Descomente as linhas abaixo após confirmar que a tabela usuarios existe

/*
CREATE TRIGGER tr_atualizar_numero_alunos
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_numero_alunos();
*/

-- Tabela de log de auditoria
CREATE TABLE escola_audit_log (
    id SERIAL PRIMARY KEY,
    tabela VARCHAR(50) NOT NULL,
    operacao VARCHAR(10) NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
    registro_id INTEGER NOT NULL,
    dados_anteriores JSONB,
    dados_novos JSONB,
    usuario_id INTEGER,
    data_operacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para a tabela de auditoria
CREATE INDEX idx_escola_audit_log_tabela ON escola_audit_log(tabela);
CREATE INDEX idx_escola_audit_log_data ON escola_audit_log(data_operacao);

-- =====================================================
-- 16. PROCEDURES PARA MANUTENÇÃO
-- =====================================================

-- Procedure para limpeza de dados antigos
CREATE OR REPLACE FUNCTION sp_limpeza_dados_antigos()
RETURNS VOID AS $$
BEGIN
    -- Remover respostas de quizzes de mais de 2 anos
    DELETE FROM escola_quiz_respostas 
    WHERE data_resposta < CURRENT_DATE - INTERVAL '2 years';
    
    -- Arquivar mensagens antigas
    UPDATE escola_mensagens 
    SET status = 'arquivada' 
    WHERE data_criacao < CURRENT_DATE - INTERVAL '1 year' 
    AND status = 'enviada';
    
    -- Limpar logs de auditoria antigos
    DELETE FROM escola_audit_log 
    WHERE data_operacao < CURRENT_DATE - INTERVAL '6 months';
    
    RAISE NOTICE 'Limpeza de dados antigos concluída com sucesso.';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 17. DADOS INICIAIS PARA TESTES
-- =====================================================

-- Inserir séries padrão (execute após criar uma escola)
-- Substitua o valor 1 pelo ID da escola criada

/*
INSERT INTO escola_series (escola_id, nome) VALUES 
(1, 'Berçário'),
(1, 'Maternal I'),
(1, 'Maternal II'),
(1, 'Pré I'),
(1, 'Pré II'),
(1, '1º Ano'),
(1, '2º Ano'),
(1, '3º Ano'),
(1, '4º Ano'),
(1, '5º Ano'),
(1, '6º Ano'),
(1, '7º Ano'),
(1, '8º Ano'),
(1, '9º Ano'),
(1, '1º Ano EM'),
(1, '2º Ano EM'),
(1, '3º Ano EM');
*/

-- =====================================================
-- 18. SCRIPT DE MIGRAÇÃO PARA DADOS EXISTENTES
-- =====================================================

-- Execute apenas se já houver dados no sistema
/*
-- Criar escola padrão para alunos sem escola
INSERT INTO escolas (
    nome, email, senha, telefone, cnpj, endereco, cidade, estado, cep, 
    diretor, telefone_diretor, email_diretor
) VALUES (
    'Escola Padrão', 
    'padrao@escola.com', 
    crypt('senha123', gen_salt('bf')), 
    '(11) 0000-0000', 
    '00.000.000/0000-00', 
    'Endereço Padrão', 
    'Cidade', 
    'SP', 
    '00000-000', 
    'Diretor Padrão', 
    '(11) 0000-0000', 
    'diretor@escola.com'
);

-- Criar série padrão
INSERT INTO escola_series (escola_id, nome) 
VALUES (
    (SELECT id FROM escolas WHERE nome = 'Escola Padrão'), 
    'Série Padrão'
);

-- Atualizar alunos existentes
UPDATE usuarios 
SET 
    escola_id = (SELECT id FROM escolas WHERE nome = 'Escola Padrão'),
    serie_id = (SELECT id FROM escola_series WHERE nome = 'Série Padrão')
WHERE tipo = 'filho' AND escola_id IS NULL;
*/

-- =====================================================
-- 19. VERIFICAÇÕES DE INTEGRIDADE
-- =====================================================

-- Função para verificar integridade dos dados
CREATE OR REPLACE FUNCTION verificar_integridade_escola()
RETURNS TABLE(
    tabela VARCHAR(50),
    problema TEXT,
    quantidade BIGINT
) AS $$
BEGIN
    -- Verificar escolas sem séries
    RETURN QUERY
    SELECT 
        'escolas'::VARCHAR(50),
        'Escolas sem séries cadastradas'::TEXT,
        COUNT(*)::BIGINT
    FROM escolas e
    LEFT JOIN escola_series es ON es.escola_id = e.id
    WHERE es.id IS NULL;
    
    -- Verificar quizzes sem questões
    RETURN QUERY
    SELECT 
        'escola_quizzes'::VARCHAR(50),
        'Quizzes sem questões'::TEXT,
        COUNT(*)::BIGINT
    FROM escola_quizzes eq
    LEFT JOIN escola_quiz_questoes eqq ON eqq.quiz_id = eq.id
    WHERE eqq.id IS NULL;
    
    -- Verificar atribuições órfãs
    RETURN QUERY
    SELECT 
        'escola_quiz_atribuicoes'::VARCHAR(50),
        'Atribuições de quiz órfãs'::TEXT,
        COUNT(*)::BIGINT
    FROM escola_quiz_atribuicoes eqa
    LEFT JOIN usuarios u ON u.id = eqa.aluno_id
    WHERE u.id IS NULL;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================

-- Para executar a verificação de integridade:
-- SELECT * FROM verificar_integridade_escola();

-- Para executar a limpeza de dados antigos:
-- SELECT sp_limpeza_dados_antigos();

COMMIT;

