const { buscarDesafios } = require('./routes/desafios');

async function processarTarefasAutomaticas(client) {
  console.log('Processando tarefas automáticas...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][hoje.getDay()];
    console.log('Dia da semana atual:', diaSemana, 'Data:', hoje.toISOString());

    const tarefasResult = await client.query(
      `SELECT id, filho_id, descricao, valor, dias_semana, data_inicio, data_fim
       FROM tarefas_automaticas
       WHERE ativo = true AND $1 = ANY(dias_semana) AND data_inicio <= $2 AND data_fim >= $2`,
      [diaSemana, hoje]
    );

    console.log('Tarefas automáticas encontradas:', tarefasResult.rows.length, 'Detalhes:', tarefasResult.rows);

    for (const tarefa of tarefasResult.rows) {
      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas WHERE filho_id = $1 AND descricao = $2 AND DATE(data_criacao) = CURRENT_DATE',
        [tarefa.filho_id, tarefa.descricao]
      );

      if (tarefaExistente.rows.length === 0) {
        await client.query(
          'INSERT INTO tarefas (filho_id, descricao, valor, status, data_criacao) VALUES ($1, $2, $3, $4, $5)',
          [tarefa.filho_id, tarefa.descricao, tarefa.valor, 'pendente', hoje]
        );

        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [tarefa.filho_id, `Nova tarefa automática: ${tarefa.descricao} (R$ ${parseFloat(tarefa.valor).toFixed(2)})`, new Date()]
        );

        console.log(`Tarefa criada para filho ${tarefa.filho_id}: ${tarefa.descricao}`);
      } else {
        console.log(`Tarefa já existe para filho ${tarefa.filho_id}: ${tarefa.descricao}`);
      }
    }
  } catch (error) {
    console.error('Erro ao processar tarefas automáticas:', error.stack);
  }
}

async function processarMesadas(client) {
  console.log('Processando mesadas...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][hoje.getDay()];
    console.log('Dia da semana atual para mesadas:', diaSemana);

    const mesadasResult = await client.query(
      `SELECT id, pai_id, filho_id, valor
       FROM mesadas
       WHERE ativo = true AND dia_semana = $1`,
      [diaSemana]
    );

    console.log('Mesadas encontradas:', mesadasResult.rows.length);

    for (const mesada of mesadasResult.rows) {
      const contaPaiResult = await client.query(
        'SELECT id, saldo FROM contas WHERE pai_id = $1',
        [mesada.pai_id]
      );

      if (contaPaiResult.rows.length === 0 || contaPaiResult.rows[0].saldo < mesada.valor) {
        console.log(`Saldo insuficiente para mesada do filho ${mesada.filho_id}`);
        continue;
      }

      const contaId = contaPaiResult.rows[0].id;

      await client.query(
        'UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2',
        [mesada.valor, mesada.pai_id]
      );

      await client.query(
        'UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2',
        [mesada.valor, mesada.filho_id]
      );

      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
        [contaId, 'transferencia', mesada.valor, `Mesada para filho ${mesada.filho_id}`, 'mesada']
      );

      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [mesada.filho_id, `Você recebeu sua mesada de R$ ${parseFloat(mesada.valor).toFixed(2)}!`, new Date()]
      );

      console.log(`Mesada processada para filho ${mesada.filho_id}`);
    }
  } catch (error) {
    console.error('Erro ao processar mesadas:', error.stack);
  }
}

async function processarDesafiosAutomaticos(client) {
  console.log('Processando desafios automáticos...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const filhosResult = await client.query('SELECT id FROM filhos');
    const tipoDesafios = { educacao_financeira: 2, ortografia: 2, ciencias: 2 };
    const valorRecompensa = 1.00;

    for (const filho of filhosResult.rows) {
      const conjuntoExistente = await client.query(
        'SELECT id FROM conjuntos_desafios WHERE filho_id = $1 AND DATE(criado_em) = CURRENT_DATE AND automatico = true',
        [filho.id]
      );

      if (conjuntoExistente.rows.length === 0) {
        const perguntas = await buscarDesafios(tipoDesafios);
        await client.query(
          `INSERT INTO conjuntos_desafios (pai_id, filho_id, tipos, perguntas, valor_recompensa, status, automatico)
           VALUES ((SELECT pai_id FROM filhos WHERE id = $1), $1, $2, $3, $4, $5, $6)`,
          [filho.id, JSON.stringify(tipoDesafios), JSON.stringify(perguntas), valorRecompensa, 'pendente', true]
        );

        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [filho.id, 'Novo conjunto de desafios automáticos disponível!', new Date()]
        );

        console.log(`Conjunto automático criado para filho ${filho.id}`);
      }
    }
  } catch (error) {
    console.error('Erro ao processar desafios automáticos:', error.stack);
  }
}

async function executarTarefasDiarias(pool) {
  console.log('Iniciando agendador de tarefas diárias...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await processarTarefasAutomaticas(client);
    await processarMesadas(client);
    await processarDesafiosAutomaticos(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao executar tarefas diárias:', error.stack);
  } finally {
    client.release();
  }

  setTimeout(() => executarTarefasDiarias(pool), 24 * 60 * 60 * 1000); // Executar a cada 24 horas
}

module.exports = { executarTarefasDiarias };