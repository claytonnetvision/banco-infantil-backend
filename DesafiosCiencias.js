const PERGUNTAS_CIENCIAS = [
  {
    id: 1,
    pergunta: 'O que as plantas precisam para crescer?',
    opcoes: ['Apenas água', 'Luz solar, água e terra', 'Apenas luz', 'Nada'],
    resposta_correta: 1,
    explicacao: 'As plantas precisam de luz solar, água e nutrientes da terra para crescer.'
  },
  {
    id: 2,
    pergunta: 'Qual é o maior planeta do Sistema Solar?',
    opcoes: ['Terra', 'Marte', 'Júpiter', 'Vênus'],
    resposta_correta: 2,
    explicacao: 'Júpiter é o maior planeta do Sistema Solar.'
  },
  {
    id: 3,
    pergunta: 'O que é a fotossíntese?',
    opcoes: ['Plantas comem comida', 'Plantas fazem comida com luz', 'Plantas dormem', 'Plantas nadam'],
    resposta_correta: 1,
    explicacao: 'A fotossíntese é quando as plantas usam luz solar para fazer comida.'
  },
  {
    id: 4,
    pergunta: 'Qual é o estado da água na chuva?',
    opcoes: ['Sólido', 'Líquido', 'Gasoso', 'Nenhum'],
    resposta_correta: 1,
    explicacao: 'A chuva é água na forma líquida.'
  },
  {
    id: 5,
    pergunta: 'O que é um mamífero?',
    opcoes: ['Um animal que voa', 'Um animal que tem pelos e amamenta', 'Um animal que vive na água', 'Um animal com escamas'],
    resposta_correta: 1,
    explicacao: 'Mamíferos são animais que têm pelos e amamentam seus filhotes.'
  },
  {
    id: 6,
    pergunta: 'Por que o céu é azul?',
    opcoes: ['Porque tem água', 'Porque a luz se espalha', 'Porque é pintado', 'Porque é frio'],
    resposta_correta: 1,
    explicacao: 'O céu é azul porque a luz do sol se espalha na atmosfera.'
  },
  {
    id: 7,
    pergunta: 'O que é um vulcão?',
    opcoes: ['Uma montanha que explode', 'Um rio quente', 'Uma nuvem grande', 'Um lago'],
    resposta_correta: 0,
    explicacao: 'Um vulcão é uma montanha que pode liberar lava, cinzas e gases.'
  },
  {
    id: 8,
    pergunta: 'Qual é a principal fonte de energia da Terra?',
    opcoes: ['Vento', 'Sol', 'Água', 'Fogo'],
    resposta_correta: 1,
    explicacao: 'O Sol é a principal fonte de energia da Terra, fornecendo luz e calor.'
  },
  {
    id: 9,
    pergunta: 'O que é reciclagem?',
    opcoes: ['Jogar lixo fora', 'Reusar materiais', 'Queimar coisas', 'Esconder lixo'],
    resposta_correta: 1,
    explicacao: 'Reciclagem é transformar materiais usados, como papel e plástico, em novos produtos.'
  },
  {
    id: 10,
    pergunta: 'Qual animal é conhecido por mudar de cor?',
    opcoes: ['Cachorro', 'Camaleão', 'Gato', 'Pássaro'],
    resposta_correta: 1,
    explicacao: 'O camaleão muda de cor para se camuflar no ambiente.'
  },
  {
    id: 11,
    pergunta: 'O que é a gravidade?',
    opcoes: ['Uma força que puxa as coisas para baixo', 'Uma luz brilhante', 'Um tipo de água', 'Um som alto'],
    resposta_correta: 0,
    explicacao: 'A gravidade é a força que faz as coisas caírem e mantém os planetas em órbita.'
  },
  {
    id: 12,
    pergunta: 'Qual é o maior oceano do mundo?',
    opcoes: ['Atlântico', 'Índico', 'Pacífico', 'Ártico'],
    resposta_correta: 2,
    explicacao: 'O Oceano Pacífico é o maior oceano do mundo.'
  },
  {
    id: 13,
    pergunta: 'O que os pássaros têm que os ajuda a voar?',
    opcoes: ['Pelos', 'Escamas', 'Asas', 'Nadadeiras'],
    resposta_correta: 2,
    explicacao: 'As asas ajudam os pássaros a voar.'
  },
  {
    id: 14,
    pergunta: 'O que é um arco-íris?',
    opcoes: ['Uma ponte', 'Cores formadas pela luz', 'Uma nuvem', 'Uma estrela'],
    resposta_correta: 1,
    explicacao: 'Um arco-íris é formado quando a luz se divide em cores ao passar pela chuva.'
  },
  {
    id: 15,
    pergunta: 'Qual é o estado da água no gelo?',
    opcoes: ['Sólido', 'Líquido', 'Gasoso', 'Nenhum'],
    resposta_correta: 0,
    explicacao: 'O gelo é água na forma de vapor.'
  },
  {
    id: 16,
    pergunta: 'O que as abelhas produzem?',
    opcoes: ['Leite', 'Mel', 'Suco', 'Água'],
    resposta_correta: 1,
    explicacao: 'As abelhas produzem mel, que é um alimento.'
  },
  {
    id: 17,
    pergunta: 'Qual planeta é conhecido como Planeta Vermelho?',
    opcoes: ['Vênus', 'Marte', 'Mercúrio', 'Júpiter'],
    resposta_correta: 1,
    explicacao: 'Marte é chamado de Planeta Vermelho por causa da cor avermelhada do solo.'
  },
  {
    id: 18,
    pergunta: 'O que é um fóssil?',
    opcoes: ['Uma planta viva', 'Restos de seres antigos', 'Uma rocha comum', 'Uma árvore'],
    resposta_correta: 1,
    explicacao: 'Fósseis são restos ou marcas de seres vivos preservados em rochas.'
  },
  {
    id: 19,
    pergunta: 'O que é energia eólica?',
    opcoes: ['Energia do sol', 'Energia do vento', 'Energia da água', 'Energia do fogo'],
    resposta_correta: 1,
    explicacao: 'Energia eólica é a energia gerada pelo vento.'
  },
  {
    id: 20,
    pergunta: 'Qual animal é um réptil?',
    opcoes: ['Cachorro', 'Cobra', 'Pinguim', 'Golfinho'],
    resposta_correta: 1,
    explicacao: 'A cobra é um réptil, com pele escamosa e que geralmente rasteja.'
  },
  {
    id: 21,
    pergunta: 'O que é um ímã?',
    opcoes: ['Um brinquedo', 'Algo que atrai metal', 'Uma planta', 'Uma luz'],
    resposta_correta: 1,
    explicacao: 'Um ímã é um objeto que atrai metais como ferro.'
  },
  {
    id: 22,
    pergunta: 'Qual é a camada externa da Terra?',
    opcoes: ['Núcleo', 'Manto', 'Crosta', 'Atmosfera'],
    resposta_correta: 2,
    explicacao: 'A crosta é a camada externa da Terra, onde vivemos.'
  },
  {
    id: 23,
    pergunta: 'O que as estrelas brilham?',
    opcoes: ['Porque são quentes', 'Porque têm água', 'Porque são frias', 'Porque são escuras'],
    resposta_correta: 0,
    explicacao: 'As estrelas brilham porque são muito quentes e produzem luz.'
  },
  {
    id: 24,
    pergunta: 'O que é um termômetro?',
    opcoes: ['Um medidor de altura', 'Um medidor de temperatura', 'Um medidor de peso', 'Um medidor de tempo'],
    resposta_correta: 1,
    explicacao: 'O termômetro mede a temperatura, como calor ou frio.'
  },
  {
    id: 25,
    pergunta: 'Qual animal vive na água e respira com brânquias?',
    opcoes: ['Cachorro', 'Peixe', 'Pássaro', 'Gato'],
    resposta_correta: 1,
    explicacao: 'Peixes vivem na água e respiram com brânquias.'
  },
  {
    id: 26,
    pergunta: 'O que é o oxigênio?',
    opcoes: ['Um gás que respiramos', 'Uma comida', 'Uma pedra', 'Um líquido'],
    resposta_correta: 0,
    explicacao: 'O oxigênio é um gás que os seres vivos precisam para respirar.'
  },
  {
    id: 27,
    pergunta: 'Qual é o menor planeta do Sistema Solar?',
    opcoes: ['Mercúrio', 'Vênus', 'Terra', 'Marte'],
    resposta_correta: 0,
    explicacao: 'Mercúrio é o menor planeta do Sistema Solar.'
  },
  {
    id: 28,
    pergunta: 'O que é um ecossistema?',
    opcoes: ['Um tipo de rocha', 'Um lugar onde seres vivos interagem', 'Um brinquedo', 'Uma estrela'],
    resposta_correta: 1,
    explicacao: 'Um ecossistema é um lugar onde plantas, animais e o ambiente trabalham juntos.'
  },
  {
    id: 29,
    pergunta: 'O que é a Lua?',
    opcoes: ['Uma estrela', 'Um planeta', 'Um satélite', 'Uma nuvem'],
    resposta_correta: 2,
    explicacao: 'A Lua é um satélite natural que orbita a Terra.'
  },
  {
    id: 30,
    pergunta: 'O que é um herbívoro?',
    opcoes: ['Um animal que come carne', 'Um animal que come plantas', 'Um animal que não come', 'Um animal que voa'],
    resposta_correta: 1,
    explicacao: 'Herbívoros são animais que comem apenas plantas, como vacas.'
  },
  {
    id: 31,
    pergunta: 'O que é a eletricidade?',
    opcoes: ['Uma forma de energia', 'Uma planta', 'Uma água especial', 'Uma cor'],
    resposta_correta: 0,
    explicacao: 'A eletricidade é uma forma de energia que faz coisas como lâmpadas funcionarem.'
  },
  {
    id: 32,
    pergunta: 'Qual é o maior animal do mundo?',
    opcoes: ['Elefante', 'Baleia-azul', 'Girafa', 'Tubarão'],
    resposta_correta: 1,
    explicacao: 'A baleia-azul é o maior animal do mundo, vivendo nos oceanos.'
  },
  {
    id: 33,
    pergunta: 'O que é um carnívoro?',
    opcoes: ['Um animal que come plantas', 'Um animal que come carne', 'Um animal que não come', 'Um animal que bebe água'],
    resposta_correta: 1,
    explicacao: 'Carnívoros são animais que comem carne, como leões.'
  },
  {
    id: 34,
    pergunta: 'O que é o vento?',
    opcoes: ['Água em movimento', 'Ar em movimento', 'Luz em movimento', 'Fogo em movimento'],
    resposta_correta: 1,
    explicacao: 'O vento é o ar em movimento, que sentimos quando sopra.'
  },
  {
    id: 35,
    pergunta: 'Qual é o órgão que bombeia sangue?',
    opcoes: ['Cérebro', 'Coração', 'Pulmão', 'Estômago'],
    resposta_correta: 1,
    explicacao: 'O coração bombeia sangue para todo o corpo.'
  },
  {
    id: 36,
    pergunta: 'O que é um dinossauro?',
    opcoes: ['Um animal vivo hoje', 'Um animal extinto', 'Um tipo de peixe', 'Um pássaro moderno'],
    resposta_correta: 1,
    explicacao: 'Dinossauros são animais que viveram há milhões de anos e estão extintos.'
  },
  {
    id: 37,
    pergunta: 'O que é a atmosfera?',
    opcoes: ['O chão da Terra', 'O ar ao redor do planeta', 'A água dos oceanos', 'O Sol'],
    resposta_correta: 1,
    explicacao: 'A atmosfera é a camada de ar que envolve a Terra.'
  },
  {
    id: 38,
    pergunta: 'Qual é um exemplo de inseto?',
    opcoes: ['Cachorro', 'Joaninha', 'Peixe', 'Pássaro'],
    resposta_correta: 1,
    explicacao: 'Joaninha é um inseto, com seis pernas e corpo segmentado.'
  },
  {
    id: 39,
    pergunta: 'O que é a luz?',
    opcoes: ['Uma forma de energia', 'Uma pedra', 'Uma planta', 'Uma sombra'],
    resposta_correta: 0,
    explicacao: 'A luz é uma forma de energia que nos permite enxergar.'
  },
  {
    id: 40,
    pergunta: 'Qual é o processo de transformar água líquida em vapor?',
    opcoes: ['Congelamento', 'Evaporação', 'Condensação', 'Solidificação'],
    resposta_correta: 1,
    explicacao: 'Evaporação é quando a água líquida vira vapor, como quando seca.'
  },
  {
    id: 41,
    pergunta: 'O que é um omnívoro?',
    opcoes: ['Um animal que come apenas plantas', 'Um animal que come plantas e carne', 'Um animal que não come', 'Um animal que voa'],
    resposta_correta: 1,
    explicacao: 'Omnívoros comem plantas e carne, como os humanos.'
  },
  {
    id: 42,
    pergunta: 'O que é um deserto?',
    opcoes: ['Um lugar muito molhado', 'Um lugar muito seco', 'Um lugar muito frio', 'Um lugar com muitas árvores'],
    resposta_correta: 1,
    explicacao: 'Um deserto é um lugar muito seco, com pouca chuva.'
  },
  {
    id: 43,
    pergunta: 'Qual é o satélite natural da Terra?',
    opcoes: ['Sol', 'Lua', 'Marte', 'Júpiter'],
    resposta_correta: 1,
    explicacao: 'A Lua é o satélite natural da Terra.'
  },
  {
    id: 44,
    pergunta: 'O que é um tornado?',
    opcoes: ['Uma chuva forte', 'Um vento giratório', 'Uma onda grande', 'Um vulcão'],
    resposta_correta: 1,
    explicacao: 'Um tornado é um vento giratório muito forte que forma uma nuvem em funil.'
  },
  {
    id: 45,
    pergunta: 'O que as minhocas fazem no solo?',
    opcoes: ['Comem pedras', 'Fazem túneis', 'Produzem luz', 'Nadam'],
    resposta_correta: 1,
    explicacao: 'Minhocas fazem túneis no solo, ajudando a deixar a terra mais solta.'
  },
  {
    id: 46,
    pergunta: 'O que é um cometa?',
    opcoes: ['Uma estrela', 'Uma bola de gelo e poeira', 'Um planeta', 'Uma nuvem'],
    resposta_correta: 1,
    explicacao: 'Um cometa é uma bola de gelo e poeira que orbita o Sol.'
  },
  {
    id: 47,
    pergunta: 'O que é um vulcão ativo?',
    opcoes: ['Um vulcão que nunca entra em erupção', 'Um vulcão que pode entrar em erupção', 'Um vulcão extinto', 'Um vulcão de gelo'],
    resposta_correta: 1,
    explicacao: 'Um vulcão ativo pode entrar em erupção a qualquer momento.'
  },
  {
    id: 48,
    pergunta: 'O que é a cadeia alimentar?',
    opcoes: ['Uma corrente de metal', 'A forma como os seres vivos se alimentam', 'Uma planta grande', 'Uma montanha'],
    resposta_correta: 1,
    explicacao: 'A cadeia alimentar mostra como os seres vivos se alimentam uns dos outros.'
  },
  {
    id: 49,
    pergunta: 'Qual é o gás que as plantas liberam na fotossíntese?',
    opcoes: ['Oxigênio', 'Nitrogênio', 'Gás carbônico', 'Hidrogênio'],
    resposta_correta: 0,
    explicacao: 'As plantas liberam oxigênio durante a fotossíntese.'
  },
  {
    id: 50,
    pergunta: 'O que é um terremoto?',
    opcoes: ['Um tremor na terra', 'Uma chuva forte', 'Um vento forte', 'Uma onda'],
    resposta_correta: 0,
    explicacao: 'Um terremoto é um tremor na terra causado pelo movimento das placas.'
  }
];

module.exports = { PERGUNTAS_CIENCIAS };