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
  {
    id: 4,
    pergunta: 'Qual é a forma correta da palavra "vovó"?',
    opcoes: ['Vovo', 'Vovô', 'Vovó', 'Vovóo'],
    resposta_correta: 2,
    explicacao: 'A forma correta é "Vovó", com acento agudo no último "o" para indicar a pronúncia correta.'
  },
  {
    id: 5,
    pergunta: 'Complete: O ___ está brilhando hoje.',
    opcoes: ['sol', 'sól', 'sóu', 'sôl'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "sol", sem acento, pois é uma palavra monossílaba não acentuada.'
  },
  {
    id: 6,
    pergunta: 'Qual palavra está correta?',
    opcoes: ['Cachorro', 'Cachoro', 'Caxorro', 'Cachoroo'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Cachorro", com dois "r" e escrita padrão.'
  },
  {
    id: 7,
    pergunta: 'Qual é o plural de "pão"?',
    opcoes: ['Pães', 'Pãns', 'Pãos', 'Pãis'],
    resposta_correta: 0,
    explicacao: 'O plural de "pão" é "pães", com til no "a" e "es" no final.'
  },
  {
    id: 8,
    pergunta: 'Complete: Eu gosto de ___ livros.',
    opcoes: ['lê', 'lér', 'ler', 'le'],
    resposta_correta: 2,
    explicacao: 'O verbo correto é "ler" no infinitivo: "Eu gosto de ler livros."'
  },
  {
    id: 9,
    pergunta: 'Qual palavra significa o mesmo que "feliz"?',
    opcoes: ['Triste', 'Alegre', 'Cansado', 'Zangado'],
    resposta_correta: 1,
    explicacao: '"Alegre" é sinônimo de "feliz", indicando um estado de contentamento.'
  },
  {
    id: 10,
    pergunta: 'Qual é a escrita correta?',
    opcoes: ['Viagem', 'Viajem', 'Viage', 'Viajjem'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Viagem" para o substantivo, com "g". "Viajem" é a conjugação do verbo viajar.'
  },
  {
    id: 11,
    pergunta: 'Qual é a forma correta de "avô"?',
    opcoes: ['Avó', 'Avô', 'Avo', 'Avôo'],
    resposta_correta: 1,
    explicacao: 'A forma correta é "Avô", com acento circunflexo no "o".'
  },
  {
    id: 12,
    pergunta: 'Complete: A casa ___ muito bonita.',
    opcoes: ['é', 'eh', 'ê', 'és'],
    resposta_correta: 0,
    explicacao: 'O verbo "ser" correto é "é": "A casa é muito bonita."'
  },
  {
    id: 13,
    pergunta: 'Qual palavra está escrita corretamente?',
    opcoes: ['Amor', 'Amorr', 'Ammor', 'Amur'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Amor", com um "r" e sem acento.'
  },
  {
    id: 14,
    pergunta: 'Qual é o plural de "flor"?',
    opcoes: ['Flores', 'Flors', 'Floris', 'Flóres'],
    resposta_correta: 0,
    explicacao: 'O plural de "flor" é "flores", com "es" no final.'
  },
  {
    id: 15,
    pergunta: 'Complete: Eu ___ para a escola.',
    opcoes: ['vou', 'vo', 'vôu', 'vau'],
    resposta_correta: 0,
    explicacao: 'O verbo "ir" correto é "vou": "Eu vou para a escola."'
  },
  {
    id: 16,
    pergunta: 'Qual palavra está correta?',
    opcoes: ['Gato', 'Gatto', 'Gatu', 'Gatô'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Gato", sem acento e com um "t".'
  },
  {
    id: 17,
    pergunta: 'Qual é a escrita correta de "música"?',
    opcoes: ['Musica', 'Música', 'Muzica', 'Músika'],
    resposta_correta: 1,
    explicacao: 'A palavra correta é "Música", com acento agudo no "u".'
  },
  {
    id: 18,
    pergunta: 'Complete: Nós ___ muito.',
    opcoes: ['brincamos', 'brincámos', 'brinkamos', 'brincamos'],
    resposta_correta: 0,
    explicacao: 'O verbo "brincar" correto é "brincamos": "Nós brincamos muito."'
  },
  {
    id: 19,
    pergunta: 'Qual palavra significa o mesmo que "rápido"?',
    opcoes: ['Lento', 'Veloz', 'Parado', 'Cansado'],
    resposta_correta: 1,
    explicacao: '"Veloz" é sinônimo de "rápido", indicando muita velocidade.'
  },
  {
    id: 20,
    pergunta: 'Qual é a forma correta?',
    opcoes: ['Sol', 'Sól', 'Sôl', 'Sòl'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Sol", sem acento.'
  },
  {
    id: 21,
    pergunta: 'Qual é o plural de "lápis"?',
    opcoes: ['Lápis', 'Lápises', 'Lápiz', 'Lápiss'],
    resposta_correta: 0,
    explicacao: 'O plural de "lápis" é "lápis", que não muda.'
  },
  {
    id: 22,
    pergunta: 'Complete: O céu ___ azul.',
    opcoes: ['está', 'estáa', 'ésta', 'estah'],
    resposta_correta: 0,
    explicacao: 'O verbo "estar" correto é "está": "O céu está azul."'
  },
  {
    id: 23,
    pergunta: 'Qual palavra está correta?',
    opcoes: ['Arvore', 'Árvore', 'Arvóre', 'Árvre'],
    resposta_correta: 1,
    explicacao: 'A palavra correta é "Árvore", com acento agudo no "a".'
  },
  {
    id: 24,
    pergunta: 'Qual é a escrita correta?',
    opcoes: ['Festa', 'Fésta', 'Festta', 'Fessta'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Festa", sem acento e com um "t".'
  },
  {
    id: 25,
    pergunta: 'Complete: Eu ___ um livro.',
    opcoes: ['leio', 'léio', 'leiu', 'lejo'],
    resposta_correta: 0,
    explicacao: 'O verbo "ler" correto é "leio": "Eu leio um livro."'
  },
  {
    id: 26,
    pergunta: 'Qual palavra significa o mesmo que "bonito"?',
    opcoes: ['Feio', 'Lindo', 'Triste', 'Zangado'],
    resposta_correta: 1,
    explicacao: '"Lindo" é sinônimo de "bonito", indicando algo agradável de ver.'
  },
  {
    id: 27,
    pergunta: 'Qual é o plural de "casa"?',
    opcoes: ['Casas', 'Cazas', 'Cásas', 'Casaz'],
    resposta_correta: 0,
    explicacao: 'O plural de "casa" é "casas", com "s" no final.'
  },
  {
    id: 28,
    pergunta: 'Qual é a forma correta?',
    opcoes: ['Pé', 'Pê', 'Péh', 'Pè'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Pé", com acento agudo no "e".'
  },
  {
    id: 29,
    pergunta: 'Complete: Eles ___ felizes.',
    opcoes: ['estão', 'estãu', 'estáo', 'estam'],
    resposta_correta: 0,
    explicacao: 'O verbo "estar" correto é "estão": "Eles estão felizes."'
  },
  {
    id: 30,
    pergunta: 'Qual palavra está correta?',
    opcoes: ['Livro', 'Lívro', 'Livvro', 'Livrô'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Livro", sem acento e com um "v".'
  },
  {
    id: 31,
    pergunta: 'Qual é a escrita correta de "bebê"?',
    opcoes: ['Bebe', 'Bebê', 'Bêbe', 'Bebée'],
    resposta_correta: 1,
    explicacao: 'A palavra correta é "Bebê", com acento circunflexo no último "e".'
  },
  {
    id: 32,
    pergunta: 'Complete: A escola ___ divertida.',
    opcoes: ['é', 'eh', 'ê', 'és'],
    resposta_correta: 0,
    explicacao: 'O verbo "ser" correto é "é": "A escola é divertida."'
  },
  {
    id: 33,
    pergunta: 'Qual palavra significa o mesmo que "grande"?',
    opcoes: ['Pequeno', 'Enorme', 'Fino', 'Curto'],
    resposta_correta: 1,
    explicacao: '"Enorme" é sinônimo de "grande", indicando algo de tamanho grande.'
  },
  {
    id: 34,
    pergunta: 'Qual é o plural de "carro"?',
    opcoes: ['Carros', 'Cárros', 'Carroz', 'Carroes'],
    resposta_correta: 0,
    explicacao: 'O plural de "carro" é "carros", com "s" no final.'
  },
  {
    id: 35,
    pergunta: 'Qual é a forma correta?',
    opcoes: ['Mão', 'Mãu', 'Máo', 'Mân'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Mão", com til no "a".'
  },
  {
    id: 36,
    pergunta: 'Complete: Eu ___ na praia.',
    opcoes: ['estou', 'estôu', 'estau', 'estóu'],
    resposta_correta: 0,
    explicacao: 'O verbo "estar" correto é "estou": "Eu estou na praia."'
  },
  {
    id: 37,
    pergunta: 'Qual palavra está correta?',
    opcoes: ['Bola', 'Bóla', 'Bolla', 'Bôla'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Bola", sem acento e com um "l".'
  },
  {
    id: 38,
    pergunta: 'Qual é a escrita correta?',
    opcoes: ['Céu', 'Ceu', 'Céú', 'Cêu'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Céu", com acento agudo no "e".'
  },
  {
    id: 39,
    pergunta: 'Complete: Nós ___ um filme.',
    opcoes: ['vemos', 'vémos', 'vemmos', 'veemos'],
    resposta_correta: 0,
    explicacao: 'O verbo "ver" correto é "vemos": "Nós vemos um filme."'
  },
  {
    id: 40,
    pergunta: 'Qual palavra significa o mesmo que "frio"?',
    opcoes: ['Quente', 'Gelado', 'Morno', 'Quente'],
    resposta_correta: 1,
    explicacao: '"Gelado" é sinônimo de "frio", indicando baixa temperatura.'
  },
  {
    id: 41,
    pergunta: 'Qual é o plural de "ônibus"?',
    opcoes: ['Ônibus', 'Ônibuses', 'Ônibusis', 'Ônibuss'],
    resposta_correta: 0,
    explicacao: 'O plural de "ônibus" é "ônibus", que não muda.'
  },
  {
    id: 42,
    pergunta: 'Qual é a forma correta?',
    opcoes: ['Chá', 'Chã', 'Cháa', 'Châh'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Chá", com acento agudo no "a".'
  },
  {
    id: 43,
    pergunta: 'Complete: O menino ___ correndo.',
    opcoes: ['está', 'estáa', 'ésta', 'estah'],
    resposta_correta: 0,
    explicacao: 'O verbo "estar" correto é "está": "O menino está correndo."'
  },
  {
    id: 44,
    pergunta: 'Qual palavra está correta?',
    opcoes: ['Janela', 'Janéla', 'Janelas', 'Janella'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Janela", sem acento.'
  },
  {
    id: 45,
    pergunta: 'Qual é a escrita correta?',
    opcoes: ['Pássaro', 'Passaro', 'Pássarro', 'Pásaro'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Pássaro", com acento agudo no "a" e um "s".'
  },
  {
    id: 46,
    pergunta: 'Complete: Eu ___ com meus amigos.',
    opcoes: ['jogo', 'jôgo', 'joogo', 'joguo'],
    resposta_correta: 0,
    explicacao: 'O verbo "jogar" correto é "jogo": "Eu jogo com meus amigos."'
  },
  {
    id: 47,
    pergunta: 'Qual palavra significa o mesmo que "sono"?',
    opcoes: ['Acordado', 'Cansado', 'Fome', 'Sede'],
    resposta_correta: 1,
    explicacao: '"Cansado" pode estar relacionado a "sono", indicando vontade de dormir.'
  },
  {
    id: 48,
    pergunta: 'Qual é o plural de "papel"?',
    opcoes: ['Papéis', 'Papéls', 'Papeles', 'Papéiss'],
    resposta_correta: 0,
    explicacao: 'O plural de "papel" é "papéis", com acento agudo no "is".'
  },
  {
    id: 49,
    pergunta: 'Qual é a forma correta?',
    opcoes: ['Rua', 'Rúa', 'Rûa', 'Ruà'],
    resposta_correta: 0,
    explicacao: 'A palavra correta é "Rua", sem acento.'
  },
  {
    id: 50,
    pergunta: 'Complete: Eles ___ um desenho.',
    opcoes: ['fazem', 'fázem', 'fassem', 'faazem'],
    resposta_correta: 0,
    explicacao: 'O verbo "fazer" correto é "fazem": "Eles fazem um desenho."'
  }
];

module.exports = { PERGUNTAS_ORTOGRAFIA };