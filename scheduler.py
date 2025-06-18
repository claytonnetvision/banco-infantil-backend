from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import psycopg2
import requests
from dotenv import load_dotenv
import os
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

db_config = {
    "host": "ep-rapid-flower-act74795-pooler.sa-east-1.aws.neon.tech",
    "database": "banco_infantil",
    "user": "neondb_owner",
    "password": os.getenv("DB_PASSWORD"),
    "sslmode": "require"
}

def send_whatsapp_notification(phone, message):
    # Configuração da WhatsApp Business API
    url = "https://api.whatsapp.com/v19.0/YOUR_PHONE_NUMBER/messages"
    headers = {"Authorization": f"Bearer {os.getenv('WHATSAPP_TOKEN')}"}
    data = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message}
    }
    try:
        response = requests.post(url, json=data, headers=headers)
        response.raise_for_status()
        logger.info(f"Notificação enviada para {phone}")
    except Exception as e:
        logger.error(f"Erro ao enviar notificação: {e}")

def generate_daily_quizzes():
    logger.info("Gerando quizzes diários...")
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        cursor.execute("SET search_path TO banco_infantil")

        # Buscar configurações dos pais
        cursor.execute("""
            SELECT f.id AS filho_id, f.pai_id, p.telefone, p.notificacoes_whatsapp,
                   c.materia, c.idade, c.nivel, c.quantidade, c.recompensa
            FROM filhos f
            JOIN pais p ON f.pai_id = p.pai_id
            JOIN quiz_config c ON f.id = c.filho_id
            WHERE c.rotina = 'diario' AND c.ativo = true
        """)
        configs = cursor.fetchall()

        for config in configs:
            filho_id, pai_id, telefone, notificacoes_whatsapp, materia, idade, nivel, quantidade, recompensa = config

            # Verificar se já existe quiz para hoje
            cursor.execute(
                "SELECT id FROM conjuntos_desafios WHERE filho_id = %s AND DATE(criado_em) = CURRENT_DATE AND automatico = true",
                (filho_id,)
            )
            if cursor.fetchone():
                logger.info(f"Quiz já existe para filho {filho_id}")
                continue

            # Chamar API Python
            response = requests.post("http://localhost:8000/generate_quiz", json={
                "filho_id": filho_id,
                "materia": materia,
                "idade": idade,
                "nivel": nivel,
                "quantidade": quantidade,
                "recompensa": recompensa,
                "notificacoes_whatsapp": notificacoes_whatsapp
            })
            response.raise_for_status()

            # Enviar notificação WhatsApp, se habilitado
            if notificacoes_whatsapp:
                send_whatsapp_notification(telefone, "Novo quiz disponível para seu filho!")

        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Erro ao gerar quizzes: {e}")

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        generate_daily_quizzes,
        trigger=CronTrigger(hour=0, minute=1),  # Diariamente às 00:01
        id="daily_quiz",
        name="Geração de quizzes diários"
    )
    scheduler.start()
    logger.info("Agendador iniciado")

if __name__ == "__main__":
    start_scheduler()
    try:
        import time
        while True:
            time.sleep(3600)  # Mantém o script rodando
    except KeyboardInterrupt:
        logger.info("Agendador encerrado")