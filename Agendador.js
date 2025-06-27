const cron = require('node-cron');
const { pool } = require('./db');
const { gerarPerguntas } = require('./GeminiService');

let isRunning = false;

// Processar tarefas automáticas
async function processarTarefasAutomaticas(client) {
  if (isRunning) {
    console.warn('Processamento de tarefas automáticas já em andamento, pulando execução...');
    return;
  }
  isRunning = true;
  console.log('Processando tarefas automáticas - Início');
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
      console.log(`Verificando tarefa: ${tarefa.descricao} para filho ${tarefa.filho_id}`);
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
  } finally {
    console.log('Processando tarefas automáticas - Fim');
    isRunning = false;
  }
}

// Processar mesadas
async function processarMesadas(client) {
  if (isRunning) {
    console.warn('Processamento de mesadas já em andamento, pulando execução...');
    return;
  }
  isRunning = true;
  console.log('Processando mesadas - Início');
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
      console.log(`Processando mesada para filho ${mesada.filho_id}`);
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
         SET valor_atual = GREATEST(0, LEAST(valor_atual + $1, valor_total)) 
         WHERE filho_id = $2 AND status = 'pendente'`,
        [mesada.valor, mesada.filho_id]
      );
      console.log(`Mesada processada para filho ${mesada.filho_id}: R$ ${mesada.valor}`);
    }
  } catch (error) {
    console.error('Erro ao processar mesadas:', error.stack);
  } finally {
    console.log('Processando mesadas - Fim');
    isRunning = false;
  }
}

// Processar desafios automáticos
async function processarDesafiosAutomaticos(client) {
  if (isRunning) {
    console.warn('Processamento de desafios automáticos já em andamento, pulando execução...');
    return;
  }
  isRunning = true;
  console.log('Processando desafios automáticos - Início');
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
  } finally {
    console.log('Processando desafios automáticos - Fim');
    isRunning = false;
  }
}

// Processar desafios gerados por IA (desativado temporariamente)
// async function processarDesafiosIA(client) {
//   if (isRunning) {
//     console.warn('Processamento de desafios IA já em andamento, pulando execução...');
//     return;
//   }
//   isRunning = true;
//   console.log('Processando desafios gerados por IA - Início');
//   try {
//     await client.query('SET search_path TO banco_infantil');
//     const hoje = new Date();
//     hoje.setHours(0, 0, 0, 0);
//     console.log('Data atual para desafios IA:', hoje.toISOString());

//     const tableExists = await client.query(`
//       SELECT EXISTS (
//         SELECT FROM information_schema.tables 
//         WHERE table_schema = 'banco_infantil' 
//         AND table_name = 'perguntas_gerados_ia'
//       )
//     `);
    
//     if (!tableExists.rows[0].exists) {
//       console.warn('Tabela perguntas_gerados_ia não encontrada. Pulando processamento de desafios IA.');
//       return;
//     }

//     const desafiosResult = await client.query(
//       `SELECT id, filho_id, tipo_desafio, idade, quantidade_perguntas, remunerado, valor_recompensa, pai_id
//        FROM desafios_gerados_ia
//        WHERE gerar_diariamente = true AND ativo = true`
//     );
//     console.log('Desafios IA automáticos encontrados:', desafiosResult.rows.length);

//     for (const desafio of desafiosResult.rows) {
//       console.log(`Verificando desafio ${desafio.id} para filho ${desafio.filho_id}`);
//       const perguntasExistentes = await client.query(
//         `SELECT id FROM perguntas_gerados_ia 
//          WHERE desafio_id = $1 AND filho_id = $2 AND DATE(data_criacao) = CURRENT_DATE`,
//         [desafio.id, desafio.filho_id]
//       );

//       if (perguntasExistentes.rows.length > 0) {
//         console.log(`Perguntas já existem para desafio ${desafio.id} do filho ${desafio.filho_id}`);
//         continue;
//       }

//       if (desafio.remunerado) {
//         const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [desafio.pai_id]);
//         if (contaPaiResult.rows.length === 0) {
//           console.log(`Conta do responsável ${desafio.pai_id} não encontrada`);
//           continue;
//         }
//         const saldoPai = parseFloat(contaPaiResult.rows[0].saldo);
//         if (saldoPai < desafio.valor_recompensa) {
//           console.log(`Saldo insuficiente para desafio IA do filho ${desafio.filho_id}`);
//           continue;
//         }
//       }

//       const perguntas = await gerarPerguntas({
//         tipoDesafio: desafio.tipo_desafio,
//         idade: desafio.idade,
//         quantidade: desafio.quantidade_perguntas,
//       });
//       console.log(`Perguntas geradas para desafio ${desafio.id}:`, perguntas.length);

//       for (const pergunta of perguntas) {
//         await client.query(
//           `INSERT INTO perguntas_gerados_ia (desafio_id, filho_id, pergunta, opcoes, resposta_correta, explicacao)
//            VALUES ($1, $2, $3, $4, $5, $6)`,
//           [
//             desafio.id,
//             desafio.filho_id,
//             pergunta.pergunta,
//             JSON.stringify(pergunta.opcoes),
//             pergunta.resposta_correta,
//             pergunta.explicacao
//           ]
//         );
//       }

//       await client.query(
//         'INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES ($1, $2, $3)',
//         [desafio.filho_id, `Novo desafio de ${desafio.tipo_desafio} disponível!`, new Date()]
//       );
//       console.log(`Desafio IA gerado para filho ${desafio.filho_id}: ${desafio.tipo_desafio}`);
//     }
//   } catch (error) {
//     console.error('Erro ao processar desafios IA:', error.stack);
//   } finally {
//     console.log('Processando desafios gerados por IA - Fim');
//     isRunning = false;
//   }
// }

// Processar missões diárias
async function processarMissoesDiarias(client) {
  if (isRunning) {
    console.warn('Processamento de missões diárias já em andamento, pulando execução...');
    return;
  }
  isRunning = true;
  console.log('Processando missões diárias - Início');
  try {
    await client.query('SET search_path TO banco_infantil');
    const filhosResult = await client.query('SELECT id, pai_id FROM filhos');
    console.log('Filhos encontrados para missões diárias:', filhosResult.rows.length);

    for (const filho of filhosResult.rows) {
      console.log(`Processando missões para filho ${filho.id}`);
      const contaPaiResult = await client.query('SELECT id, saldo FROM contas WHERE pai_id = $1', [filho.pai_id]);
      if (contaPaiResult.rows.length === 0 || contaPaiResult.rows[0].saldo < 0.80) {
        console.log(`Saldo insuficiente para missões diárias do filho ${filho.id}`);
        continue;
      }

      const missaoDesafios = await client.query(
        `SELECT id FROM missoes_diarias 
         WHERE filho_id = $1 AND tipo = 'desafios' AND DATE(data_criacao) = CURRENT_DATE`,
        [filho.id]
      );

      if (missaoDesafios.rows.length === 0) {
        await client.query(
          `INSERT INTO missoes_diarias (filho_id, tipo, meta, progresso, recompensa, status, data_criacao)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [filho.id, 'desafios', 3, 0, 0.30, 'pendente']
        );
        console.log(`Missão diária de desafios criada para filho ${filho.id}`);
      }

      const missaoTarefas = await client.query(
        `SELECT id FROM missoes_diarias 
         WHERE filho_id = $1 AND tipo = 'tarefas' AND DATE(data_criacao) = CURRENT_DATE`,
        [filho.id]
      );

      if (missaoTarefas.rows.length === 0) {
        await client.query(
          `INSERT INTO missoes_diarias (filho_id, tipo, meta, progresso, recompensa, status, data_criacao)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [filho.id, 'tarefas', 5, 0, 0.50, 'pendente']
        );
        console.log(`Missão diária de tarefas criada para filho ${filho.id}`);
      }

      console.log(`Missões diárias criadas para filho ${filho.id}`);
    }
  } catch (error) {
    console.error('Erro ao processar missões diárias:', error.stack);
  } finally {
    console.log('Processando missões diárias - Fim');
    isRunning = false;
  }
}

// Processar troféus diários
async function processarTrofeusDiarios(client) {
  if (isRunning) {
    console.warn('Processamento de troféus diários já em andamento, pulando execução...');
    return;
  }
  isRunning = true;
  console.log('Processando troféus diários - Início');
  try {
    await client.query('SET search_path TO banco_infantil');
    const filhosResult = await client.query('SELECT id FROM filhos');
    console.log('Filhos encontrados para troféus:', filhosResult.rows.length);

    for (const filho of filhosResult.rows) {
      console.log(`Verificando troféus para filho ${filho.id}`);
      const tarefasResult = await client.query(
        `SELECT id, status FROM tarefas 
         WHERE filho_id = $1 AND DATE(data_criacao) = CURRENT_DATE`,
        [filho.id]
      );

      const todasConcluidas = tarefasResult.rows.length > 0 && tarefasResult.rows.every(tarefa => tarefa.status === 'aprovada');
      console.log(`Tarefas concluídas para filho ${filho.id}: ${todasConcluidas}`);

      if (todasConcluidas) {
        const trofeuExistente = await client.query(
          `SELECT id FROM trofeus_diarios 
           WHERE filho_id = $1 AND DATE(data) = CURRENT_DATE`,
          [filho.id]
        );
        console.log(`Troféu existente para filho ${filho.id}: ${trofeuExistente.rows.length > 0}`);

        if (trofeuExistente.rows.length === 0) {
          const trofeus = [
            { icone: 'trofeu1.png', nome: 'Estrela do Dia' },
            { icone: 'trofeu2.png', nome: 'Campeão Diário' },
            { icone: 'trofeu3.png', nome: 'Herói das Tarefas' }
          ];
          const trofeu = trofeus[Math.floor(Math.random() * trofeus.length)];
          console.log(`Concedendo troféu ${trofeu.nome} para filho ${filho.id}`);

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
  } finally {
    console.log('Processando troféus diários - Fim');
    isRunning = false;
  }
}

// Buscar desafios
async function buscarDesafios(tipoDesafios) {
  if (isRunning) {
    console.warn('Busca de desafios já em andamento, retornando lista vazia...');
    return [];
  }
  isRunning = true;
  console.log('Buscando desafios - Início');
  try {
    const perguntas = [];
    for (const [tipo, quantidade] of Object.entries(tipoDesafios)) {
      if (quantidade > 0) {
        const client = await pool.connect();
        try {
          await client.query('SET search_path TO banco_infantil');
          console.log(`Consultando ${quantidade} perguntas de tipo ${tipo}`);
          const result = await client.query(
            `SELECT id, pergunta, opcoes, resposta_correta, explicacao 
             FROM perguntas_gerados_ia 
             WHERE tipo_desafio = $1 AND status = 'pendente'
             ORDER BY RANDOM() LIMIT $2`,
            [tipo, quantidade]
          );
          console.log(`Resultados encontrados para ${tipo}: ${result.rows.length}`);
          perguntas.push(...result.rows.map(row => ({
            id: String(row.id),
            tipo,
            pergunta: row.pergunta,
            opcoes: JSON.parse(row.opcoes),
            resposta_correta: row.resposta_correta,
            explicacao: row.explicacao
          })));
        } finally {
          client.release();
        }
      }
    }
    console.log(`Total de perguntas geradas: ${perguntas.length}`);
    return perguntas;
  } catch (error) {
    console.error('Erro ao buscar desafios:', error.stack);
    return [];
  } finally {
    console.log('Buscando desafios - Fim');
    isRunning = false;
  }
}

// Função principal para executar tarefas diárias
async function executarTarefasDiarias() {
  if (!pool) {
    console.error('Pool de conexão do banco de dados não está inicializado');
    return;
  }

  let client;
  const executionId = Date.now();
  console.log(`Iniciando execução diária #${executionId} às ${new Date().toISOString()}`);
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    console.log(`[${executionId}] Iniciando processarTarefasAutomaticas`);
    await processarTarefasAutomaticas(client);
    console.log(`[${executionId}] Finalizando processarTarefasAutomaticas`);
    console.log(`[${executionId}] Iniciando processarMesadas`);
    await processarMesadas(client);
    console.log(`[${executionId}] Finalizando processarMesadas`);
    console.log(`[${executionId}] Iniciando processarDesafiosAutomaticos`);
    await processarDesafiosAutomaticos(client);
    console.log(`[${executionId}] Finalizando processarDesafiosAutomaticos`);
    console.log(`[${executionId}] Iniciando processarMissoesDiarias`);
    await processarMissoesDiarias(client);
    console.log(`[${executionId}] Finalizando processarMissoesDiarias`);
    console.log(`[${executionId}] Iniciando processarTrofeusDiarios`);
    await processarTrofeusDiarios(client);
    console.log(`[${executionId}] Finalizando processarTrofeusDiarios`);
    await client.query('COMMIT');
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
      console.error(`Erro na execução diária #${executionId}: rollback realizado`, error.stack);
    } else {
      console.error(`Erro na execução diária #${executionId}: sem cliente para rollback`, error.stack);
    }
  } finally {
    if (client) {
      client.release();
      console.log(`Execução diária #${executionId} finalizada às ${new Date().toISOString()}`);
    }
  }
}

// Agendar execução diária às 00:00
cron.schedule('0 0 * * *', () => {
  console.log('Iniciando agendamento diário de tarefas');
  executarTarefasDiarias().catch(err => {
    console.error('Erro no agendamento diário:', err);
  });
});

module.exports = { executarTarefasDiarias };