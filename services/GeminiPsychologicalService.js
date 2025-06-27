require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY não está configurada no .env');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function analisarMissao({ missao, imagemPath }) {
  console.log(`Analisando missão com Gemini: { missaoId: ${missao.id}, tipo: ${missao.tipo} }`);

  const prompt = `
Você é um especialista em psicologia infantil e pedagogia. Analise a missão a seguir do ponto de vista psicológico e pedagógico, fornecendo insights sobre o desenvolvimento emocional, cognitivo ou criativo da criança com base no conteúdo da missão. A análise deve ser clara, concisa e adequada para pais, com no máximo 200 palavras. Inclua observações sobre como a missão reflete habilidades ou emoções da criança.

Missão:
- Tipo: ${missao.tipo}
- Descrição: ${missao.descricao || 'N/A'}
- Equipe: ${missao.equipe_nomes || 'N/A'}
- Valor da Recompensa: R$${missao.valor_recompensa}
${missao.imagem ? `- Imagem: Disponível em ${imagemPath}` : ''}

Retorne o resultado exclusivamente no formato JSON abaixo, sem texto adicional ou marcações como \`\`\`json:

{
  "analise": "Texto da análise psicológica"
}
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

      const analise = JSON.parse(responseText);
      if (!analise.analise || typeof analise.analise !== 'string') {
        throw new Error('Resposta inválida: esperado objeto com propriedade "analise"');
      }
      return analise;
    } catch (error) {
      console.error('Erro ao analisar missão com Gemini:', {
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
        throw new Error(`Erro ao analisar missão com Gemini: ${error.message}`);
      }
    }
  }
  throw new Error('Cota excedida após várias tentativas');
}

module.exports = { analisarMissao };