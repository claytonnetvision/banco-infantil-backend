// backend/Agendador.js
const cron = require('node-cron');
const axios = require('axios');

async function criarDesafiosAutomaticos(pool, retries = 3) {
  console.log('Iniciando criação de desafios automáticos...');
  let client;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = await pool.connect();
      await client.query('SET search_path TO banco_infantil');

      // Buscar todas as crianças
      const filhosResult = await client.query('SELECT id FROM filhos');
      const filhos = filhosResult.rows;

      for (const filho of filhos) {
        const filhoId = filho.id;
        try {
          // Verificar se já existe conjunto automático hoje
          const conjuntoExistente = await client.query(
            'SELECT id FROM conjuntos_desafios WHERE filho_id = $1 AND status = $2 AND automatico = true AND DATE(criado_em) = CURRENT_DATE',
            [filhoId, 'pendente']
          );
          if (conjuntoExistente.rows.length > 0) {
            console.log(`Conjunto automático já existe para filho ${filhoId} hoje.`);
            continue;
          }

          // Chamar endpoint para criar conjunto automático
          await axios.post(`http://localhost:5000/desafios/automatico/${filhoId}`);
          console.log(`Conjunto automático criado para filho ${filhoId}`);
        } catch (error) {
          console.error(`Erro ao criar conjunto automático para filho ${filhoId}:`, error.message);
        }
      }
      return;
    } catch (error) {
      console.error(`Tentativa ${attempt} falhou ao executar desafios automáticos:`, error);
      if (attempt === retries) {
        console.error('Erro final ao executar desafios automáticos:', error);
      }
      if (client) client.release();
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function processarMesadas(pool, retries = 3) {
  console.log('Iniciando processamento de mesadas...');
  let client;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = await pool.connect();
      await client.query('SET search_path TO banco_infantil');

      const hoje = new Date().toLocaleString('pt-BR', { weekday: 'long' }).toLowerCase();
      const mesadasResult = await client.query(
        'SELECT m.id, m.pai_id, m.filho_id, m.valor, c.saldo, c.id as conta_id FROM mesadas m JOIN contas c ON m.pai_id = c.pai_id WHERE m.dia_semana = $1 AND m.ativo = true',
        [hoje]
      );

      for (const mesada of mesadasResult.rows) {
        const { id, pai_id, filho_id, valor, saldo, conta_id } = mesada;
        try {
          // Verificar saldo do responsável
          if (saldo < valor) {
            console.log(`Saldo insuficiente para mesada de filho ${filho_id}`);
            continue;
          }

          // Verificar última transferência
          const ultimaTransferencia = await client.query(
            'SELECT ultima_transferencia FROM mesadas WHERE id = $1',
            [id]
          );
          const ultimaData = ultimaTransferencia.rows[0].ultima_transferencia;
          const hojeData = new Date().toISOString().split('T')[0];
          if (ultimaData && ultimaData === hojeData) {
            console.log(`Mesada já transferida hoje para filho ${filho_id}`);
            continue;
          }

          // Realizar transferência
          await client.query('UPDATE contas SET saldo = saldo - $1 WHERE pai_id = $2', [valor, pai_id]);
          await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [valor, filho_id]);
          await client.query(
            'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
            [conta_id, 'transferencia', valor, `Mesada para criança ${filho_id}`, 'mesada']
          );
          await client.query(
            'UPDATE mesadas SET ultima_transferencia = CURRENT_DATE WHERE id = $1',
            [id]
          );

          // Adicionar notificação
          await client.query(
            'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
            [filho_id, `Você recebeu sua mesada de R$ ${valor.toFixed(2)}!`, new Date()]
          );

          console.log(`Mesada de R$ ${valor} transferida para filho ${filho_id}`);
        } catch (error) {
          console.error(`Erro ao processar mesada para filho ${filho_id}:`, error.message);
        }
      }
      return;
    } catch (error) {
      console.error(`Tentativa ${attempt} falhou ao processar mesadas:`, error);
      if (attempt === retries) {
        console.error('Erro final ao processar mesadas:', error);
      }
      if (client) client.release();
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function processarTarefasAutomaticas(pool, retries = 3) {
  console.log('Iniciando processamento de tarefas automáticas...');
  let client;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = await pool.connect();
      await client.query('SET search_path TO banco_infantil');

      const hoje = new Date().toLocaleString('pt-BR', { weekday: 'long' }).toLowerCase();
      const tarefasAutomaticasResult = await client.query(
        `SELECT ta.id, ta.pai_id, ta.filho_id, ta.descricao, ta.valor, c.saldo, c.id as conta_id
         FROM tarefas_automaticas ta
         JOIN contas c ON ta.pai_id = c.pai_id
         WHERE ta.ativo = true
         AND $1 = ANY(ta.dias_semana)
         AND CURRENT_DATE BETWEEN ta.data_inicio AND ta.data_fim`,
        [hoje]
      );

      for (const tarefa of tarefasAutomaticasResult.rows) {
        const { id, pai_id, filho_id, descricao, valor, saldo, conta_id } = tarefa;
        try {
          // Verificar saldo do responsável
          if (saldo < valor) {
            console.log(`Saldo insuficiente para tarefa automática ${id} do filho ${filho_id}`);
            continue;
          }

          // Verificar se a tarefa já foi criada hoje
          const tarefaExistente = await client.query(
            'SELECT id FROM tarefas WHERE filho_id = $1 AND descricao = $2 AND DATE(data_criacao) = CURRENT_DATE',
            [filho_id, descricao]
          );
          if (tarefaExistente.rows.length > 0) {
            console.log(`Tarefa automática ${id} já criada hoje para filho ${filho_id}`);
            continue;
          }

          // Criar tarefa
          await client.query(
            'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4)',
            [filho_id, descricao, valor, 'pendente']
          );

          // Adicionar notificação
          await client.query(
            'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
            [filho_id, `Nova tarefa automática: ${descricao} por R$ ${valor.toFixed(2)}!`, new Date()]
          );

          console.log(`Tarefa automática ${id} criada para filho ${filho_id}`);
        } catch (error) {
          console.error(`Erro ao processar tarefa automática ${id} para filho ${filho_id}:`, error.message);
        }
      }
      return;
    } catch (error) {
      console.error(`Tentativa ${attempt} falhou ao processar tarefas automáticas:`, error);
      if (attempt === retries) {
        console.error('Erro final ao processar tarefas automáticas:', error);
      }
      if (client) client.release();
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function executarTarefasDiarias(pool) {
  cron.schedule('1 0 * * *', async () => {
    console.log('Executando tarefas diárias...');
    await criarDesafiosAutomaticos(pool);
    await processarMesadas(pool);
    await processarTarefasAutomaticas(pool);
  }, {
    timezone: 'America/Sao_Paulo'
  });
}

module.exports = { executarTarefasDiarias };