require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY não está configurada no .env');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function gerarPerguntas({ tipoDesafio, idade, dificuldade, quantidade }) {
  console.log(`Gerando ${quantidade} perguntas de ${tipoDesafio} (${dificuldade}) para idade ${idade}`);

  const prompt = `
Você é um especialista em criar perguntas educacionais para crianças. Gere exatamente ${quantidade} perguntas de múltipla escolha sobre ${tipoDesafio} com nível de dificuldade ${dificuldade} (facil, moderado ou dificil) adequadas para uma criança de ${idade} anos. Cada pergunta deve ter:

- Um enunciado claro e adequado para a idade e o nível de dificuldade.
- Exatamente 4 opções de resposta (índices de 0 a 3).
- Indicação do índice da resposta correta (0 a 3).
- Uma explicação breve e educativa para a resposta correta.

Retorne o resultado exclusivamente no formato JSON abaixo, sem texto adicional ou marcações como \`\`\`json:

[
  {
    "pergunta": "Enunciado da pergunta",
    "opcoes": [
      {"texto": "Opção 0"},
      {"texto": "Opção 1"},
      {"texto": "Opção 2"},
      {"texto": "Opção 3"}
    ],
    "resposta_correta": 0,
    "explicacao": "Explicação da resposta correta"
  },
  ...
]

As perguntas devem ser educativas, precisas e adequadas para crianças. Evite conteúdo sensível ou complexo demais para a idade e nível de dificuldade especificados.
`;

  let retries = 3;
  while (retries > 0) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      let responseText = result.response.text();

      console.log('Resposta bruta da API do Gemini:', responseText);

      // Remover marcações Markdown (```json\n...\n```)
      responseText = responseText.replace(/```json\s*|\s*```/g, '').trim();

      console.log('Resposta limpa após remover markdown:', responseText);

      const perguntas = JSON.parse(responseText);
      if (!Array.isArray(perguntas) || perguntas.length !== quantidade) {
        throw new Error(`Resposta inválida: esperado ${quantidade} perguntas, recebido ${perguntas.length}`);
      }
      return perguntas;
    } catch (error) {
      console.error('Erro ao gerar perguntas com Gemini:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      if (error.response?.status === 429 && retries > 0) {
        console.warn(`Cota excedida, tentando novamente em ${3 * (4 - retries)} segundos...`);
        await new Promise(resolve => setTimeout(resolve, 3000 * (4 - retries)));
        retries--;
      } else if (error.response?.status === 400 || error.response?.status === 403) {
        console.error('Erro de autenticação. Verifique a chave da API no Google Cloud Console.');
        throw new Error(`Erro de autenticação: ${error.message}`);
      } else {
        throw new Error(`Erro ao gerar perguntas com Gemini: ${error.message}`);
      }
    }
  }
  throw new Error('Cota excedida após várias tentativas');
}

module.exports = { gerarPerguntas };