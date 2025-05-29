// Função auxiliar para gerar um número aleatório entre min e max
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Função para gerar um desafio matemático
function generateMathChallenge() {
  const operations = ['soma', 'subtracao', 'multiplicacao', 'divisao'];
  const operation = operations[getRandomInt(0, 3)];
  let num1, num2, pergunta, respostaCorreta;

  switch (operation) {
    case 'soma':
      num1 = getRandomInt(1, 10);
      num2 = getRandomInt(1, 10);
      pergunta = `${num1} + ${num2}`;
      respostaCorreta = num1 + num2;
      break;
    case 'subtracao':
      num1 = getRandomInt(1, 10);
      num2 = getRandomInt(1, num1);
      pergunta = `${num1} - ${num2}`;
      respostaCorreta = num1 - num2;
      break;
    case 'multiplicacao':
      num1 = getRandomInt(1, 10);
      num2 = getRandomInt(1, 10);
      pergunta = `${num1} × ${num2}`;
      respostaCorreta = num1 * num2;
      break;
    case 'divisao':
      num2 = getRandomInt(1, 10);
      respostaCorreta = getRandomInt(1, 10);
      num1 = num2 * respostaCorreta;
      pergunta = `${num1} ÷ ${num2}`;
      break;
    default:
      throw new Error('Operação inválida');
  }

  return { tipo: operation, pergunta, respostaCorreta };
}

// Modelos padrão de desafios
const MODELOS_DESAFIOS = {
  '1': { name: 'Equilibrado', soma: 4, subtracao: 4, multiplicacao: 4, divisao: 3 },
  '2': { name: 'Foco em Soma e Subtração', soma: 7, subtracao: 7, multiplicacao: 1, divisao: 0 },
  '3': { name: 'Foco em Multiplicação', soma: 3, subtracao: 2, multiplicacao: 10, divisao: 0 },
  '4': { name: 'Foco em Divisão', soma: 4, subtracao: 3, multiplicacao: 0, divisao: 8 },
  '5': { name: 'Mistura Leve', soma: 5, subtracao: 5, multiplicacao: 3, divisao: 2 }
};

module.exports = { getRandomInt, generateMathChallenge, MODELOS_DESAFIOS };