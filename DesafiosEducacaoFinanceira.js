const PERGUNTAS_EDUCACAO_FINANCEIRA = [
  {
    id: 1,
    pergunta: 'Se você economiza R$ 2 por dia, quanto terá em 5 dias?',
    opcoes: ['R$ 5', 'R$ 8', 'R$ 10', 'R$ 12'],
    resposta_correta: 2,
    explicacao: 'Você economiza R$ 2 por dia. Em 5 dias, isso é 2 × 5 = R$ 10.'
  },
  {
    id: 2,
    pergunta: 'O que é mais vantajoso: gastar todo o dinheiro ou guardar uma parte?',
    opcoes: ['Gastar tudo', 'Guardar uma parte', 'Emprestar', 'Doar'],
    resposta_correta: 1,
    explicacao: 'Guardar uma parte do dinheiro é mais vantajoso, pois permite que você tenha recursos para emergências ou objetivos futuros.'
  },
  {
    id: 3,
    pergunta: 'Se uma maçã custa R$ 2 e você tem R$ 5, quantas maçãs pode comprar?',
    opcoes: ['1', '2', '3', '4'],
    resposta_correta: 1,
    explicacao: 'Cada maçã custa R$ 2. Com R$ 5, você pode comprar 5 ÷ 2 = 2 maçãs (arredondado para baixo).'
  },
  {
    id: 4,
    pergunta: 'O que é um orçamento?',
    opcoes: ['Um tipo de banco', 'Um plano para gastar e economizar', 'Um jogo de dinheiro', 'Um presente'],
    resposta_correta: 1,
    explicacao: 'Um orçamento é um plano que ajuda a decidir como usar o dinheiro, equilibrando gastos e economia.'
  },
  {
    id: 5,
    pergunta: 'Se você recebe R$ 10 e gasta R$ 7, quanto sobra?',
    opcoes: ['R$ 2', 'R$ 3', 'R$ 4', 'R$ 5'],
    resposta_correta: 1,
    explicacao: 'Você recebe R$ 10 e gasta R$ 7. Então, 10 - 7 = R$ 3 sobram.'
  },
  {
    id: 6,
    pergunta: 'O que significa poupar dinheiro?',
    opcoes: ['Gastar tudo', 'Guardar para o futuro', 'Doar para alguém', 'Perder dinheiro'],
    resposta_correta: 1,
    explicacao: 'Poupar significa guardar uma parte do dinheiro para usar no futuro, como para comprar algo importante ou para emergências.'
  },
  {
    id: 7,
    pergunta: 'Se você quer comprar um brinquedo de R$ 20 e tem R$ 15, o que deve fazer?',
    opcoes: ['Comprar agora', 'Economizar mais', 'Pedir emprestado', 'Desistir'],
    resposta_correta: 1,
    explicacao: 'Você tem R$ 15, mas o brinquedo custa R$ 20. Economizar mais R$ 5 é a melhor opção para comprar sem dívidas.'
  },
  {
    id: 8,
    pergunta: 'Qual é a melhor maneira de evitar gastos desnecessários?',
    opcoes: ['Comprar tudo que vê', 'Fazer uma lista de compras', 'Guardar todo o dinheiro', 'Não planejar'],
    resposta_correta: 1,
    explicacao: 'Fazer uma lista de compras ajuda a comprar apenas o necessário, evitando gastos impulsivos.'
  },
  {
    id: 9,
    pergunta: 'O que é um investimento?',
    opcoes: ['Gastar dinheiro', 'Usar dinheiro para ganhar mais', 'Doar dinheiro', 'Esconder dinheiro'],
    resposta_correta: 1,
    explicacao: 'Um investimento é usar dinheiro em algo, como uma poupança ou negócio, para tentar ganhar mais no futuro.'
  },
  {
    id: 10,
    pergunta: 'Se você ganha R$ 10 por semana, quanto terá em 4 semanas se não gastar?',
    opcoes: ['R$ 20', 'R$ 30', 'R$ 40', 'R$ 50'],
    resposta_correta: 2,
    explicacao: 'Você ganha R$ 10 por semana. Em 4 semanas, 10 × 4 = R$ 40.'
  },
  {
    id: 11,
    pergunta: 'O que é melhor fazer com o troco que sobra?',
    opcoes: ['Gastar logo', 'Perder', 'Guardar no cofrinho', 'Jogar fora'],
    resposta_correta: 2,
    explicacao: 'Guardar o troco no cofrinho é uma boa ideia para economizar e usar o dinheiro depois.'
  },
  {
    id: 12,
    pergunta: 'Se um sorvete custa R$ 3, quantos pode comprar com R$ 9?',
    opcoes: ['2', '3', '4', '5'],
    resposta_correta: 1,
    explicacao: 'Cada sorvete custa R$ 3. Com R$ 9, você pode comprar 9 ÷ 3 = 3 sorvetes.'
  },
  {
    id: 13,
    pergunta: 'Por que é importante planejar os gastos?',
    opcoes: ['Para gastar mais', 'Para economizar', 'Para perder dinheiro', 'Para não comprar nada'],
    resposta_correta: 1,
    explicacao: 'Planejar os gastos ajuda a economizar e usar o dinheiro de forma inteligente.'
  },
  {
    id: 14,
    pergunta: 'Se você tem R$ 12 e gasta R$ 5, quanto sobra?',
    opcoes: ['R$ 5', 'R$ 6', 'R$ 7', 'R$ 8'],
    resposta_correta: 2,
    explicacao: 'Você tem R$ 12 e gasta R$ 5. Então, 12 - 5 = R$ 7 sobram.'
  },
  {
    id: 15,
    pergunta: 'O que é uma necessidade?',
    opcoes: ['Algo que você quer', 'Algo que você precisa', 'Um brinquedo caro', 'Um presente'],
    resposta_correta: 1,
    explicacao: 'Uma necessidade é algo que você precisa para viver, como comida, água e roupas.'
  },
  {
    id: 16,
    pergunta: 'O que é um desejo?',
    opcoes: ['Algo essencial', 'Algo que você quer, mas não precisa', 'Comida', 'Escola'],
    resposta_correta: 1,
    explicacao: 'Um desejo é algo que você gostaria de ter, como um brinquedo, mas não é essencial.'
  },
  {
    id: 17,
    pergunta: 'Se você economiza R$ 5 por mês, quanto terá em 6 meses?',
    opcoes: ['R$ 20', 'R$ 25', 'R$ 30', 'R$ 35'],
    resposta_correta: 2,
    explicacao: 'Você economiza R$ 5 por mês. Em 6 meses, 5 × 6 = R$ 30.'
  },
  {
    id: 18,
    pergunta: 'Qual é a melhor forma de pagar por algo caro?',
    opcoes: ['Gastar tudo de uma vez', 'Economizar antes', 'Não comprar', 'Pedir emprestado'],
    resposta_correta: 1,
    explicacao: 'Economizar antes permite comprar sem dívidas e planejar melhor.'
  },
  {
    id: 19,
    pergunta: 'O que é um cofrinho?',
    opcoes: ['Um brinquedo', 'Um lugar para guardar dinheiro', 'Uma loja', 'Um banco grande'],
    resposta_correta: 1,
    explicacao: 'Um cofrinho é um lugar onde você guarda moedas e notas para economizar.'
  },
  {
    id: 20,
    pergunta: 'Se você tem R$ 8 e quer comprar algo de R$ 10, quanto falta?',
    opcoes: ['R$ 1', 'R$ 2', 'R$ 3', 'R$ 4'],
    resposta_correta: 1,
    explicacao: 'Você tem R$ 8, mas precisa de R$ 10. Então, 10 - 8 = R$ 2 faltam.'
  },
  {
    id: 21,
    pergunta: 'Por que é bom comparar preços antes de comprar?',
    opcoes: ['Para gastar mais', 'Para economizar', 'Para comprar rápido', 'Para não comprar'],
    resposta_correta: 1,
    explicacao: 'Comparar preços ajuda a encontrar o melhor valor e economizar dinheiro.'
  },
  {
    id: 22,
    pergunta: 'Se um lápis custa R$ 1, quantos pode comprar com R$ 5?',
    opcoes: ['3', '4', '5', '6'],
    resposta_correta: 2,
    explicacao: 'Cada lápis custa R$ 1. Com R$ 5, você pode comprar 5 ÷ 1 = 5 lápis.'
  },
  {
    id: 23,
    pergunta: 'O que significa "economizar"?',
    opcoes: ['Gastar tudo', 'Guardar dinheiro', 'Perder dinheiro', 'Doar tudo'],
    resposta_correta: 1,
    explicacao: 'Economizar significa guardar dinheiro para usar no futuro.'
  },
  {
    id: 24,
    pergunta: 'Se você ganha R$ 15 e gasta R$ 10, quanto sobra?',
    opcoes: ['R$ 3', 'R$ 4', 'R$ 5', 'R$ 6'],
    resposta_correta: 2,
    explicacao: 'Você ganha R$ 15 e gasta R$ 10. Então, 15 - 10 = R$ 5 sobram.'
  },
  {
    id: 25,
    pergunta: 'O que é melhor fazer com o dinheiro de um presente?',
    opcoes: ['Gastar tudo', 'Economizar uma parte', 'Perder', 'Esconder'],
    resposta_correta: 1,
    explicacao: 'Economizar uma parte do dinheiro do presente é bom para usar no futuro.'
  },
  {
    id: 26,
    pergunta: 'Se um suco custa R$ 4, quantos pode comprar com R$ 12?',
    opcoes: ['2', '3', '4', '5'],
    resposta_correta: 1,
    explicacao: 'Cada suco custa R$ 4. Com R$ 12, você pode comprar 12 ÷ 4 = 3 sucos.'
  },
  {
    id: 27,
    pergunta: 'O que é uma compra impulsiva?',
    opcoes: ['Planejar uma compra', 'Comprar sem pensar', 'Economizar', 'Doar dinheiro'],
    resposta_correta: 1,
    explicacao: 'Uma compra impulsiva é quando você compra algo sem planejar, o que pode gastar mais do que deveria.'
  },
  {
    id: 28,
    pergunta: 'Se você tem R$ 20 e gasta R$ 8, quanto sobra?',
    opcoes: ['R$ 10', 'R$ 11', 'R$ 12', 'R$ 13'],
    resposta_correta: 2,
    explicacao: 'Você tem R$ 20 e gasta R$ 8. Então, 20 - 8 = R$ 12 sobram.'
  },
  {
    id: 29,
    pergunta: 'O que é uma poupança?',
    opcoes: ['Um lugar para gastar', 'Um lugar para guardar dinheiro', 'Um brinquedo', 'Uma loja'],
    resposta_correta: 1,
    explicacao: 'Uma poupança é um lugar onde você guarda dinheiro para crescer com o tempo.'
  },
  {
    id: 30,
    pergunta: 'Se você economiza R$ 4 por semana, quanto terá em 5 semanas?',
    opcoes: ['R$ 15', 'R$ 20', 'R$ 25', 'R$ 30'],
    resposta_correta: 1,
    explicacao: 'Você economiza R$ 4 por semana. Em 5 semanas, 4 × 5 = R$ 20.'
  },
  {
    id: 31,
    pergunta: 'Por que é bom ter um objetivo financeiro?',
    opcoes: ['Para gastar mais', 'Para planejar e economizar', 'Para não comprar', 'Para perder dinheiro'],
    resposta_correta: 1,
    explicacao: 'Ter um objetivo financeiro ajuda a planejar e economizar para algo importante.'
  },
  {
    id: 32,
    pergunta: 'Se um caderno custa R$ 6, quantos pode comprar com R$ 18?',
    opcoes: ['2', '3', '4', '5'],
    resposta_correta: 1,
    explicacao: 'Cada caderno custa R$ 6. Com R$ 18, você pode comprar 18 ÷ 6 = 3 cadernos.'
  },
  {
    id: 33,
    pergunta: 'O que é melhor fazer antes de comprar algo caro?',
    opcoes: ['Não pensar', 'Planejar e economizar', 'Gastar tudo', 'Pedir emprestado'],
    resposta_correta: 1,
    explicacao: 'Planejar e economizar é a melhor forma de comprar algo caro sem problemas.'
  },
  {
    id: 34,
    pergunta: 'Se você tem R$ 25 e gasta R$ 15, quanto sobra?',
    opcoes: ['R$ 8', 'R$ 9', 'R$ 10', 'R$ 11'],
    resposta_correta: 2,
    explicacao: 'Você tem R$ 25 e gasta R$ 15. Então, 25 - 15 = R$ 10 sobram.'
  },
  {
    id: 35,
    pergunta: 'O que é uma despesa fixa?',
    opcoes: ['Algo que muda sempre', 'Algo que você paga todo mês', 'Um presente', 'Um brinquedo'],
    resposta_correta: 1,
    explicacao: 'Uma despesa fixa é algo que você paga todo mês, como aluguel ou contas.'
  },
  {
    id: 36,
    pergunta: 'Se você ganha R$ 20 por mês, quanto terá em 3 meses?',
    opcoes: ['R$ 40', 'R$ 50', 'R$ 60', 'R$ 70'],
    resposta_correta: 2,
    explicacao: 'Você ganha R$ 20 por mês. Em 3 meses, 20 × 3 = R$ 60.'
  },
  {
    id: 37,
    pergunta: 'O que é melhor fazer com o dinheiro extra?',
    opcoes: ['Gastar tudo', 'Economizar ou investir', 'Perder', 'Doar tudo'],
    resposta_correta: 1,
    explicacao: 'Economizar ou investir o dinheiro extra é uma boa forma de usá-lo no futuro.'
  },
  {
    id: 38,
    pergunta: 'Se uma bola custa R$ 5, quantas pode comprar com R$ 15?',
    opcoes: ['2', '3', '4', '5'],
    resposta_correta: 1,
    explicacao: 'Cada bola custa R$ 5. Com R$ 15, você pode comprar 15 ÷ 5 = 3 bolas.'
  },
  {
    id: 39,
    pergunta: 'O que é uma dívida?',
    opcoes: ['Dinheiro que você ganha', 'Dinheiro que você deve', 'Dinheiro economizado', 'Dinheiro doado'],
    resposta_correta: 1,
    explicacao: 'Uma dívida é dinheiro que você deve a alguém, como quando pede emprestado.'
  },
  {
    id: 40,
    pergunta: 'Se você tem R$ 30 e gasta R$ 12, quanto sobra?',
    opcoes: ['R$ 16', 'R$ 17', 'R$ 18', 'R$ 19'],
    resposta_correta: 2,
    explicacao: 'Você tem R$ 30 e gasta R$ 12. Então, 30 - 12 = R$ 18 sobram.'
  },
  {
    id: 41,
    pergunta: 'Por que é bom guardar recibos?',
    opcoes: ['Para colecionar', 'Para controlar gastos', 'Para jogar fora', 'Para desenhar'],
    resposta_correta: 1,
    explicacao: 'Guardar recibos ajuda a controlar quanto você gastou e planejar melhor.'
  },
  {
    id: 42,
    pergunta: 'Se um chocolate custa R$ 2, quantos pode comprar com R$ 10?',
    opcoes: ['4', '5', '6', '7'],
    resposta_correta: 1,
    explicacao: 'Cada chocolate custa R$ 2. Com R$ 10, você pode comprar 10 ÷ 2 = 5 chocolates.'
  },
  {
    id: 43,
    pergunta: 'O que é melhor fazer com o dinheiro de mesada?',
    opcoes: ['Gastar tudo', 'Planejar e economizar', 'Perder', 'Doar tudo'],
    resposta_correta: 1,
    explicacao: 'Planejar e economizar a mesada ajuda a usar o dinheiro de forma inteligente.'
  },
  {
    id: 44,
    pergunta: 'Se você tem R$ 16 e gasta R$ 9, quanto sobra?',
    opcoes: ['R$ 6', 'R$ 7', 'R$ 8', 'R$ 9'],
    resposta_correta: 1,
    explicacao: 'Você tem R$ 16 e gasta R$ 9. Então, 16 - 9 = R$ 7 sobram.'
  },
  {
    id: 45,
    pergunta: 'O que é um desconto?',
    opcoes: ['Pagar mais', 'Pagar menos', 'Não pagar', 'Gastar tudo'],
    resposta_correta: 1,
    explicacao: 'Um desconto é quando você paga menos por algo, como numa promoção.'
  },
  {
    id: 46,
    pergunta: 'Se você economiza R$ 6 por mês, quanto terá em 4 meses?',
    opcoes: ['R$ 20', 'R$ 24', 'R$ 28', 'R$ 30'],
    resposta_correta: 1,
    explicacao: 'Você economiza R$ 6 por mês. Em 4 meses, 6 × 4 = R$ 24.'
  },
  {
    id: 47,
    pergunta: 'O que é melhor fazer antes de ir ao mercado?',
    opcoes: ['Não planejar', 'Fazer uma lista', 'Gastar tudo', 'Comprar sem olhar'],
    resposta_correta: 1,
    explicacao: 'Fazer uma lista ajuda a comprar apenas o necessário e economizar.'
  },
  {
    id: 48,
    pergunta: 'Se um jogo custa R$ 25 e você tem R$ 20, quanto falta?',
    opcoes: ['R$ 3', 'R$ 4', 'R$ 5', 'R$ 6'],
    resposta_correta: 2,
    explicacao: 'Você tem R$ 20, mas o jogo custa R$ 25. Então, 25 - 20 = R$ 5 faltam.'
  },
  {
    id: 49,
    pergunta: 'O que é renda?',
    opcoes: ['Dinheiro que você deve', 'Dinheiro que você ganha', 'Dinheiro perdido', 'Dinheiro escondido'],
    resposta_correta: 1,
    explicacao: 'Renda é o dinheiro que você ganha, como mesada ou salário.'
  },
  {
    id: 50,
    pergunta: 'Se você tem R$ 40 e gasta R$ 15, quanto sobra?',
    opcoes: ['R$ 23', 'R$ 24', 'R$ 25', 'R$ 26'],
    resposta_correta: 2,
    explicacao: 'Você tem R$ 40 e gasta R$ 15. Então, 40 - 15 = R$ 25 sobram.'
  }
];

module.exports = { PERGUNTAS_EDUCACAO_FINANCEIRA };