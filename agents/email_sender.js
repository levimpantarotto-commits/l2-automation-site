// Email Sender — abstração que escolhe entre Gmail SMTP, Resend ou dry-run.
// Prioridade:
//   1. SMTP Gmail (GMAIL_USER + GMAIL_APP_PASSWORD) — gratuito, 500/dia
//   2. Resend (RESEND_API_KEY) — gratuito 3k/mês, exige domínio
//   3. Dry-run (sem chave) — só registra em conversas
//
// Uso:
//   const sender = require('./agents/email_sender');
//   const result = await sender.enviar({ to, subject, text, leadId });
//   result = { enviado: true|false, provedor: 'gmail'|'resend'|'dryrun', erro?: '...' }

const nodemailer = require('nodemailer');

let _gmailTransporter = null;
function getGmailTransporter() {
  if (_gmailTransporter) return _gmailTransporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  _gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return _gmailTransporter;
}

async function enviarGmail({ to, subject, text, html, leadId }) {
  const transporter = getGmailTransporter();
  if (!transporter) throw new Error('Gmail não configurado');

  const fromName = process.env.OUTBOUND_FROM_NAME || 'L2 Automation';
  const optoutToken = Buffer.from(to).toString('base64');
  const optoutUrl = `https://app.l2automation.com.br/opt-out/${optoutToken}`;
  const corpoComOptout = `${text}\n\n— — —\nSe não quer mais receber: ${optoutUrl}`;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: corpoComOptout,
    html: html || undefined,
    headers: {
      'X-Lead-Id': String(leadId || ''),
      'List-Unsubscribe': `<${optoutUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  return { enviado: true, provedor: 'gmail', messageId: info.messageId };
}

async function enviarResend({ to, subject, text, leadId }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Resend não configurado');

  const fromEmail = process.env.OUTBOUND_FROM_EMAIL || 'levi@l2automation.com.br';
  const fromName = process.env.OUTBOUND_FROM_NAME || 'L2 Automation';
  const optoutToken = Buffer.from(to).toString('base64');
  const optoutUrl = `https://app.l2automation.com.br/opt-out/${optoutToken}`;
  const corpoComOptout = `${text}\n\n— — —\nSe não quer mais receber: ${optoutUrl}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      text: corpoComOptout,
      headers: {
        'X-Lead-Id': String(leadId || ''),
        'List-Unsubscribe': `<${optoutUrl}>`,
      },
    }),
  });

  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { enviado: true, provedor: 'resend' };
}

async function enviar({ to, subject, text, html, leadId }) {
  // Gmail tem prioridade
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      return await enviarGmail({ to, subject, text, html, leadId });
    } catch (e) {
      console.warn(`[email_sender] Gmail falhou: ${e.message}`);
      // tenta Resend como fallback
    }
  }
  if (process.env.RESEND_API_KEY) {
    try {
      return await enviarResend({ to, subject, text, leadId });
    } catch (e) {
      console.warn(`[email_sender] Resend falhou: ${e.message}`);
      return { enviado: false, provedor: 'erro', erro: e.message };
    }
  }
  return { enviado: false, provedor: 'dryrun', erro: null };
}

function provedorAtivo() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'dryrun';
}

module.exports = { enviar, provedorAtivo };
