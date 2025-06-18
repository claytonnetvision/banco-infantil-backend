from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
from google.generativeai import GenerativeModel
import psycopg2
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Configuração do Gemini
os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")
gemini_model = GenerativeModel("gemini-1.5-pro")

# Configuração do PostgreSQL (Neon)
db_config = {
    "host": "ep-rapid-flower-act74795-pooler.sa-east-1.aws.neon.tech",
    "database": "banco_infantil",
    "user": "neondb_owner",
    "password": os.getenv("DB_PASSWORD"),
    "sslmode": "require"
}

class QuizConfig(BaseModel):
    filho_id: int
    materia: str
    idade: int
    nivel: str
    quantidade: int
    recompensa: float
    notificacoes_whatsapp: bool

def generate_quiz(config: QuizConfig):
    prompt = f"""
    Gere um quiz com {config.quantidade} perguntas de {config.materia} para uma criança de {config.idade} anos, 
    nível de dificuldade {config.nivel}. Cada pergunta deve ter:
    - Enunciado claro e educativo
    - 4 opções de resposta (apenas uma correta)
    - Explicação da resposta correta
    Formato JSON:
    [
        {{
            "pergunta": "texto",
            "opcoes": ["op1", "op2", "op3", "op4"],
            "resposta_correta": 0, // índice da opção correta
            "explicacao": "texto"
        }}
    ]
    """
    response = gemini_model.generate_content(prompt)
    return response.text.strip()

@app.post("/generate_quiz")
async def create_quiz(config: QuizConfig):
    try:
        # Gerar quiz com Gemini
        quiz_json = generate_quiz(config)
        perguntas = eval(quiz_json)  # Converte string JSON para lista Python

        # Conectar ao PostgreSQL
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        # Verificar saldo do pai
        cursor.execute("SELECT id, saldo FROM contas WHERE pai_id = (SELECT pai_id FROM filhos WHERE id = %s)", (config.filho_id,))
        conta_pai = cursor.fetchone()
        if not conta_pai or conta_pai[1] < config.recompensa:
            raise HTTPException(status_code=400, detail="Saldo insuficiente")

        # Inserir conjunto no banco
        cursor.execute(
            """
            INSERT INTO conjuntos_desafios (pai_id, filho_id, tipos, perguntas, valor_recompensa, status, automatico)
            VALUES ((SELECT pai_id FROM filhos WHERE id = %s), %s, %s, %s, %s, 'pendente', true)
            RETURNING id
            """,
            (config.filho_id, config.filho_id, {"custom": config.quantidade}, perguntas, config.recompensa)
        )
        conjunto_id = cursor.fetchone()[0]

        # Adicionar notificação
        cursor.execute(
            "INSERT INTO notificacoes (filho_id, mensagem, data_criacao) VALUES (%s, %s, %s)",
            (config.filho_id, "Novo quiz personalizado disponível!", "NOW()")
        )

        conn.commit()
        cursor.close()
        conn.close()

        return {"conjunto_id": conjunto_id, "perguntas": perguntas, "message": "Quiz gerado com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)