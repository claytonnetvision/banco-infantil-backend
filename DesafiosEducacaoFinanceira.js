const PERGUNTAS_EDUCACAO_FINANCEIRA = [
  {
    id: 1,
    pergunta: 'Se você economiza R$ 2 por dia, quanto terá em 5 dias?',
    opcoes: ['R$ 5', 'R$ 8', 'R$ 10', 'R$ 12'],
    resposta_correta: 2, // Índice da opção correta (R$ 10)
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
];

module.exports = { PERGUNTAS_EDUCACAO_FINANCEIRA };