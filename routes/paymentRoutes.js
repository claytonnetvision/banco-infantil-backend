const express = require('express');
const router = express.Router();
const MercadoPago = require('mercadopago');
const { pool } = require('../db');
const { sendPostSignupEmail } = require('../services/emailService');

const mp = new MercadoPago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

router.post('/create-preference', async (req, res) => {
  const { email, userId } = req.body;
  try {
    const preference = new MercadoPago.Preference(mp);
    const body = {
      items: [
        {
          title: 'Licença Tarefinha Paga 6 meses',
          unit_price: 1.00, // Valor teste
          quantity: 1,
        },
      ],
      payer: { email },
      back_urls: {
        success: 'https://www.tarefinhapaga.com.br/payment/success',
        failure: 'https://www.tarefinhapaga.com.br/payment/failure',
        pending: 'https://www.tarefinhapaga.com.br/payment/pending',
      },
      auto_return: 'approved',
      external_reference: userId.toString(),
      notification_url: 'https://banco-infantil-backend.onrender.com/webhook', // Webhook correto
    };
    console.log('Corpo da preferência:', body);
    const response = await preference.create({ body });
    console.log('Resposta da API:', response);
    await pool.query('UPDATE pais SET payment_id = $1 WHERE id = $2', [response.id, userId]);
    res.json({ preferenceId: response.id, redirectUrl: response.init_point });
  } catch (error) {
    console.error('Erro na API do Mercado Pago:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-payment', async (req, res) => {
  const { userId } = req.body;
  try {
    const payment = new MercadoPago.Payment(mp);
    const searchResponse = await payment.search({ params: { external_reference: userId } });
    console.log('Informações do pagamento:', searchResponse);
    if (searchResponse.results.length > 0) {
      const paymentInfo = searchResponse.results[0];
      if (paymentInfo.status === 'approved') {
        const user = await pool.query('SELECT id, email FROM pais WHERE id = $1', [userId]);
        if (user.rows[0]) {
          await pool.query('UPDATE pais SET licenca_ativa = true, data_ativacao = CURRENT_DATE, data_expiracao = CURRENT_DATE + INTERVAL \'6 months\' WHERE id = $1', [user.rows[0].id]);
          await sendPostSignupEmail(user.rows[0].email);
          res.json({ message: 'Pagamento confirmado, licença ativada!' });
        } else {
          res.status(404).json({ error: 'Usuário não encontrado' });
        }
      } else {
        res.json({ message: `Pagamento está ${paymentInfo.status}` });
      }
    } else {
      res.json({ message: 'Pagamento não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhook', async (req, res) => {
  const { id, topic, external_reference } = req.body;
  try {
    if (topic === 'payment') {
      const payment = new MercadoPago.Payment(mp);
      const paymentInfo = await payment.get({ id });
      console.log('Webhook recebido:', paymentInfo);
      if (paymentInfo.status === 'approved') {
        const userId = external_reference;
        const user = await pool.query('SELECT id, email FROM pais WHERE id = $1', [userId]);
        if (user.rows[0]) {
          await pool.query('UPDATE pais SET licenca_ativa = true, data_ativacao = CURRENT_DATE, data_expiracao = CURRENT_DATE + INTERVAL \'6 months\' WHERE id = $1', [user.rows[0].id]);
          await sendPostSignupEmail(user.rows[0].email);
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;