const PERGUNTAS_ORTOGRAFIA = [
  {
    id: 1,
    pergunta: 'Qual é a escrita correta da palavra?',
    opcoes: ['Açucar', 'Açúcar', 'Assucar', 'Asucar'],
    resposta_correta: 1,
    explicacao: 'A palavra correta é "Açúcar", com o "ç" e o acento agudo no "u".'
  },
  {
    id: 2,
    pergunta: 'Complete a frase: Eu ___ muito feliz.',
    opcoes: ['sou', 'sow', 'sau', 'sõu'],
    resposta_correta: 0,
    explicacao: 'A conjugação correta do verbo "ser" é "sou". A frase fica: "Eu sou muito feliz."'
  },
  {
    id: 3,
    pergunta: 'Qual palavra está escrita corretamente?',
    opcoes: ['Parabens', 'Parabéns', 'Parabem', 'Paraben'],
    resposta_correta: 1,
    explicacao: 'A palavra correta é "Parabéns", com acento agudo no "e".'
  },
];

module.exports = { PERGUNTAS_ORTOGRAFIA };