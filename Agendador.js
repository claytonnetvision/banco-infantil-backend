const cron = require('node-cron');
const { pool } = require('./db');
const axios = require('axios');
const { gerarPerguntas } = require('./GeminiService');
async function processarTarefasAutomaticas(client) {
  console.log('Processando tarefas automáticas...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][hoje.getDay()];
    console.log('Dia da semana atual:', diaSemana);

    const tarefasResult = await client.query(
      `SELECT id, filho_id, descricao, valor, dias_semana
       FROM tarefas_automaticas
       WHERE ativo = true AND $1 = ANY(dias_semana) AND data_inicio <= CURRENT_DATE AND data_fim >= CURRENT_DATE`,
      [diaSemana]
    );

    console.log('Tarefas automáticas encontradas:', tarefasResult.rows.length, 'Detalhes:', tarefasResult.rows);

    for (const tarefa of tarefasResult.rows) {
      const tarefaExistente = await client.query(
        'SELECT id FROM tarefas WHERE filho_id = $1 AND descricao = $2 AND DATE(data_criacao) = CURRENT_DATE',
        [tarefa.filho_id, tarefa.descricao]
      );

      if (tarefaExistente.rows.length === 0) {
        await client.query(
          'INSERT INTO tarefas (filho_id, descricao, valor, status) VALUES ($1, $2, $3, $4)',
          [tarefa.filho_id, tarefa.descricao, tarefa.valor, 'pendente']
        );
        await client.query(
          'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
          [tarefa.filho_id, `Nova tarefa automática: ${tarefa.descricao} (R$ ${parseFloat(tarefa.valor).toFixed(2)})`, new Date()]
        );
        console.log(`Tarefa automática criada para filho ${tarefa.filho_id}: ${tarefa.descricao}`);
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

    console.log('Mesadas encontradas:', mesadasResult.rows.length, 'Detalhes:', mesadasResult.rows);

    for (const mesada of mesadasResult.rows) {
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [mesada.pai_id]);
      if (contaPaiResult.rows.length === 0) {
        console.log(`Conta do responsável ${mesada.pai_id} não encontrada`);
        continue;
      }

      const contaId = contaPaiResult.rows[0].id;
      const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);

      if (saldoPai < mesada.valor) {
        console.log(`Saldo insuficiente para mesada de filho ${mesada.filho_id}`);
        continue;
      }

      await client.query('UPDATE contas SET saldo = saldo - $1 WHERE id = $2', [mesada.valor, contaId]);
      await client.query('UPDATE contas_filhos SET saldo = saldo + $1 WHERE filho_id = $2', [mesada.valor, mesada.filho_id]);
      await client.query(
        'INSERT INTO transacoes (conta_id, tipo, valor, descricao, origem) VALUES ($1, $2, $3, $4, $5)',
        [contaId, 'transferencia', mesada.valor, `Mesada para filho ${mesada.filho_id}`, 'mesada']
      );
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [mesada.filho_id, `Você recebeu sua mesada de R$ ${mesada.valor.toFixed(2)}!`, new Date()]
      );

      await client.query(
        `UPDATE objetivos 
         SET valor_atual = valor_atual + $1 
         WHERE filho_id = $2 AND status = 'pendente'`,
        [mesada.valor, mesada.filho_id]
      );

      console.log(`Mesada processada para filho ${mesada.filho_id}: R$ ${mesada.valor}`);
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
    console.log('Data atual:', hoje.toISOString());

    const filhosResult = await client.query('SELECT id FROM filhos');
    console.log('Filhos encontrados:', filhosResult.rows.length);

    const tipoDesafios = { educacao_financeira: 2, ortografia: 2, ciencias: 2 };
    const valorRecompensa = 1.00;

    for (const filho of filhosResult.rows) {
      console.log(`Processando desafios para filho ${filho.id}`);
      const conjuntoExistente = await client.query(
        'SELECT id FROM conjuntos_desafios WHERE filho_id = $1 AND DATE(criado_em) = CURRENT_DATE AND automatico = true',
        [filho.id]
      );

      if (conjuntoExistente.rows.length === 0) {
        const perguntas = await buscarDesafios(tipoDesafios);
        console.log(`Perguntas geradas para filho ${filho.id}:`, perguntas.length);
        
        if (perguntas.length === 0) {
          console.log(`Nenhuma pergunta gerada para filho ${filho.id}, pulando criação do conjunto`);
          continue;
        }

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
      } else {
        console.log(`Conjunto automático já existe para filho ${filho.id}`);
      }
    }
  } catch (error) {
    console.error('Erro ao processar desafios automáticos:', error.stack);
  }
}

async function processarDesafiosIA(client) {
  console.log('Processando desafios gerados por IA...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    console.log('Data atual para desafios IA:', hoje.toISOString());

    // Verificar se a tabela existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'banco_infantil' 
        AND table_name = 'perguntas_gerados_ia'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.warn('Tabela perguntas_gerados_ia não encontrada. Pulando processamento de desafios IA.');
      return;
    }

    // Marcar perguntas expiradas como 'expirada'
    await client.query(
      `UPDATE perguntas_gerados_ia SET status = 'expirada' 
       WHERE data_expiracao <= CURRENT_DATE AND status = 'pendente'`
    );

    // Buscar desafios configurados para gerar diariamente
    const desafiosResult = await client.query(
      `SELECT id, filho_id, tipo_desafio, idade, quantidade_perguntas, remunerado, valor_recompensa, pai_id
       FROM desafios_gerados_ia
       WHERE gerar_diariamente = true AND ativo = true`
    );

    console.log('Desafios IA automáticos encontrados:', desafiosResult.rows.length);

    for (const desafio of desafiosResult.rows) {
      // Verificar se já existem perguntas para hoje
      const perguntasExistentes = await client.query(
        `SELECT id FROM perguntas_gerados_ia 
         WHERE desafio_id = $1 AND filho_id = $2 AND DATE(data_criacao) = CURRENT_DATE`,
        [desafio.id, desafio.filho_id]
      );

      if (perguntasExistentes.rows.length > 0) {
        console.log(`Perguntas já existem para desafio ${desafio.id} do filho ${desafio.filho_id}`);
        continue;
      }

      // Verificar saldo do responsável se remunerado
      if (desafio.remunerado) {
        const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [desafio.pai_id]);
        if (contaPaiResult.rows.length === 0) {
          console.log(`Conta do responsável ${desafio.pai_id} não encontrada`);
          continue;
        }
        const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
        if (saldoPai < desafio.valor_recompensa) {
          console.log(`Saldo insuficiente para desafio IA do filho ${desafio.filho_id}`);
          continue;
        }
      }

      // Gerar novas perguntas
      const perguntas = await gerarPerguntas({
        tipoDesafio: desafio.tipo_desafio,
        idade: desafio.idade,
        quantidade: desafio.quantidade_perguntas,
      });

      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 1);
      dataExpiracao.setHours(0, 0, 0, 0);

      for (const pergunta of perguntas) {
        await client.query(
          `INSERT INTO perguntas_gerados_ia (desafio_id, filho_id, pergunta, opcoes, resposta_correta, explicacao, data_expiracao)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            desafio.id,
            desafio.filho_id,
            pergunta.pergunta,
            JSON.stringify(pergunta.opcoes),
            pergunta.resposta_correta,
            pergunta.explicacao,
            dataExpiracao,
          ]
        );
      }

      // Adicionar notificação
      await client.query(
        'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
        [desafio.filho_id, `Novo desafio de ${desafio.tipo_desafio} disponível!`, new Date()]
      );

      console.log(`Desafio IA gerado para filho ${desafio.filho_id}: ${desafio.tipo_desafio}`);
    }
  } catch (error) {
    console.error('Erro ao processar desafios IA:', error.stack);
  }
}

async function processarMissoesDiarias(client) {
  console.log('Processando missões diárias...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const filhosResult = await client.query('SELECT id, pai_id FROM filhos');
    console.log('Filhos encontrados para missões diárias:', filhosResult.rows.length);

    for (const filho of filhosResult.rows) {
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [filho.pai_id]);
      if (contaPaiResult.rows.length === 0 || contaPaiResult.rows[0].saldo < 0.80) {
        console.log(`Saldo insuficiente para missões diárias do filho ${filho.id}`);
        continue;
      }

      const missaoDesafios = await client.query(
        `SELECT id FROM missoes_diarias 
         WHERE filho_id = $1 AND tipo = 'desafios' AND data_criacao = CURRENT_DATE`,
        [filho.id]
      );

      if (missaoDesafios.rows.length === 0) {
        await client.query(
          `INSERT INTO missoes_diarias (filho_id, tipo, meta, progresso, recompensa, status, data_criacao)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
          [filho.id, 'desafios', 3, 0, 0.30, 'pendente']
        );
        console.log(`Missão diária de desafios criada para filho ${filho.id}`);
      }

      const missaoTarefas = await client.query(
        `SELECT id FROM missoes_diarias 
         WHERE filho_id = $1 AND tipo = 'tarefas' AND data_criacao = CURRENT_DATE`,
        [filho.id]
      );

      if (missaoTarefas.rows.length === 0) {
        await client.query(
          `INSERT INTO missoes_diarias (filho_id, tipo, meta, progresso, recompensa, status, data_criacao)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
          [filho.id, 'tarefas', 5, 0, 0.50, 'pendente']
        );
        console.log(`Missão diária de tarefas criada para filho ${filho.id}`);
      }

      console.log(`Missões diárias criadas para filho ${filho.id}`);
    }
  } catch (error) {
    console.error('Erro ao processar missões diárias:', error.stack);
  }
}

async function processarTrofeusDiarios(client) {
  console.log('Processando troféus diários...');
  try {
    await client.query('SET search_path TO banco_infantil');
    const filhosResult = await client.query('SELECT id FROM filhos');

    for (const filho of filhosResult.rows) {
      const tarefasResult = await client.query(
        `SELECT id, status FROM tarefas 
         WHERE filho_id = $1 AND DATE(data_criacao) = CURRENT_DATE`,
        [filho.id]
      );

      const todasConcluidas = tarefasResult.rows.length > 0 && tarefasResult.rows.every(tarefa => tarefa.status === 'aprovada');

      if (todasConcluidas) {
        const trofeuExistente = await client.query(
          `SELECT id FROM trofeus_diarios 
           WHERE filho_id = $1 AND DATE(data) = CURRENT_DATE`,
          [filho.id]
        );

        if (trofeuExistente.rows.length === 0) {
          const trofeus = [
            { icone: 'trofeu1.png', nome: 'Estrela do Dia' },
            { icone: 'trofeu2.png', nome: 'Campeão Diário' },
            { icone: 'trofeu3.png', nome: 'Herói das Tarefas' }
          ];
          const trofeu = trofeus[Math.floor(Math.random() * trofeus.length)];

          await client.query(
            `INSERT INTO trofeus_diarios (filho_id, data, icone, nome)
             VALUES ($1, CURRENT_DATE, $2, $3)`,
            [filho.id, trofeu.icone, trofeu.nome]
          );

          await client.query(
            'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
            [filho.id, `Você ganhou o troféu "${trofeu.nome}" por completar todas as tarefas de hoje!`, new Date()]
          );

          console.log(`Troféu diário concedido para filho ${filho.id}: ${trofeu.nome}`);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao processar troféus diários:', error.stack);
  }
}

async function buscarDesafios(tipoDesafios) {
  try {
    const perguntas = [];
    for (const [tipo, quantidade] of Object.entries(tipoDesafios)) {
      if (quantidade > 0) {
        const response = await axios.get(`http://localhost:5000/desafios/gerar/${tipo}/${quantidade}`);
        perguntas.push(...response.data.perguntas);
      }
    }
    return perguntas;
  } catch (error) {
    console.error('Erro ao buscar desafios:', error);
    return [];
  }
}

async function executarTarefasDiarias() {
  if (!pool) {
    console.error('Pool de conexão do banco de dados não está inicializado');
    return;
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await processarTarefasAutomaticas(client);
    await processarMesadas(client);
    await processarDesafiosAutomaticos(client);
    await processarDesafiosIA(client);
    await processarMissoesDiarias(client);
    await processarTrofeusDiarios(client);
    await client.query('COMMIT');
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
      console.error('Erro ao executar tarefas diárias, rollback realizado:', error.stack);
    } else {
      console.error('Erro ao executar tarefas diárias, sem cliente para rollback:', error.stack);
    }
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Agendar a execução diária às 00:01
cron.schedule('1 0 * * *', () => {
  console.log('Executando tarefas diárias...');
  executarTarefasDiarias();
});

module.exports = { executarTarefasDiarias };