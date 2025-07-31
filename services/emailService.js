const nodemailer = require('nodemailer');

// Config Zoho SMTP usando variável de ambiente
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false, // TLS
  auth: {
    user: 'suporte@tarefinhapaga.com.br',
    pass: process.env.ZOHO_PASSWORD // Usa a senha do .env
  }
});

// Função pra enviar email de verificação
async function sendVerificationEmail(userEmail, verificationToken) {
  const verificationLink = `https://www.tarefinhapaga.com.br/auth/verify?token=${verificationToken}&email=${encodeURIComponent(userEmail)}`;
  const mailOptions = {
    from: 'suporte@tarefinhapaga.com.br',
    to: userEmail,
    subject: 'Verifique seu email no Tarefinha Paga',
    html: `<p>Olá! Clique no link para verificar seu email: <a href="${verificationLink}">Verificar agora</a></p>
           <p>Se não foi você, ignore este email.</p>`
  };
  await transporter.sendMail(mailOptions);
  console.log(`Email de verificação enviado para: ${userEmail}`);
}

// Função pra email pós-cadastro
async function sendPostSignupEmail(userEmail) {
  const whatsappLink = `https://wa.me/31997209998?text=${encodeURIComponent("Quero realizar e enviar o comprovante de pagamento do pix para ativação")}`;
  const mailOptions = {
    from: 'suporte@tarefinhapaga.com.br',
    to: userEmail,
    subject: 'Bem-vindo ao Tarefinha Paga! Ative sua licença',
    html: `<p>Cadastro concluído! Você tem 7 dias grátis. Para ativar a licença de 6 meses (R$19,99), clique: <a href="${whatsappLink}">Solicitar via WhatsApp</a></p>
           <p>Ou pague via PIX no app após verificar seu email.</p>`
  };
  await transporter.sendMail(mailOptions);
  console.log(`Email pós-cadastro enviado para: ${userEmail}`);
}

module.exports = { sendVerificationEmail, sendPostSignupEmail };