SET search_path TO banco_infantil;

-- Limpar tarefas
DELETE FROM tarefas WHERE filho_id = 5;

-- Limpar missões diárias
DELETE FROM missoes_diarias WHERE filho_id = 5;

-- Limpar desafios de IA
DELETE FROM perguntas_gerados_ia;

-- Limpar tarefas automáticas
DELETE FROM tarefas_automaticas WHERE filho_id = 5;

-- Limpar conjuntos de desafios
DELETE FROM conjuntos_desafios WHERE filho_id = 5;

-- Limpar respostas de desafios
DELETE FROM respostas_desafios WHERE crianca_id = 5;

-- Limpar tentativas de desafios
DELETE FROM tentativas_desafios WHERE filho_id = 5;

-- Limpar notificações
DELETE FROM notificacoes WHERE filho_id = 5;

-- Opcional: Limpar transações relacionadas
DELETE FROM transacoes WHERE descricao LIKE '%5%';

-- Opcional: Limpar mesadas
DELETE FROM mesadas WHERE filho_id = 5;





SET search_path TO banco_infantil;

-- Limpar tarefas
DELETE FROM tarefas;

-- Limpar tarefas automáticas
DELETE FROM tarefas_automaticas;

-- Limpar missões diárias
DELETE FROM missoes_diarias;

-- Limpar desafios de IA
DELETE FROM perguntas_gerados_ia;

-- Limpar respostas de desafios
DELETE FROM respostas_desafios;

-- Limpar conjuntos de desafios
DELETE FROM conjuntos_desafios;

-- Limpar desafios matemáticos
DELETE FROM desafios_matematicos;

-- Limpar tentativas de desafios
DELETE FROM tentativas_desafios;

-- Limpar notificações
DELETE FROM notificacoes;

-- Limpar mesadas
DELETE FROM mesadas;

-- Limpar missões personalizadas
DELETE FROM missoes_personalizadas;

-- Limpar contas dos filhos (opcional, mantém saldo zerado)
UPDATE contas_filhos SET saldo = 0.00;

-- Limpar transações (opcional, apenas transações relacionadas a filhos)
DELETE FROM transacoes WHERE origem IN ('tarefa', 'missao_diaria', 'desafio', 'conquista', 'mesada');

-- Limpar conquistas (opcional)
DELETE FROM conquistas;

-- Limpar troféus diários (opcional)
DELETE FROM trofeus_diarios;

-- Limpar objetivos (opcional)
DELETE FROM objetivos;