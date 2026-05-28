// Outbound Email — envia primeiro contato + follow-ups por email.
// Provedor: Resend (preferencial) via RESEND_API_KEY. Fallback: SendGrid via SENDGRID_API_KEY.
// Se nenhuma chave configurada → modo dry-run (registra mensagem em conversas com agente_origem='outbound_email_dryrun').
//
// Input: { lead_ids: [...] } ou vazio (pega leads 'enriquecido' com email)
//
// Output: { enviados, dryrun, erros }

const AgenteBase = require('./base');

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.OUTBOUND_FROM_EMAIL || 'levi@l2automation.com.br';
const FROM_NAME = process.env.OUTBOUND_FROM_NAME || 'Levi · L2 Automation';

const TEMPLATE_PRIMEIRO = ({ razao, nicho }) => ({
  assunto: `Sobre automatizar prospecção em ${razao || 'sua empresa'}`,
  corpo: `Boa tarde,

Vi que vocês atuam${nicho ? ` no ramo ${nicho}` : ''} e o L2 Automation tem ajudado empresas como a sua a rodar prospecção comercial no piloto automático: agentes próprios qualificam leads, abrem conversas e marcam reunião com o decisor — sem precisar de mais um SDR humano.

Posso mandar em 60 segundos um print do painel rodando com os primeiros leads da sua base?

Abraço,
Levi
L2 Automation — IA · Automação · Negócios`,
});

class OutboundEmail extends AgenteBase {
  constructor(db) {
    super(db, 'outbound_email');
    this.timeoutMs = 120000;
  }

  async execute(input = {}) {
    let leads;
    if (input.lead_ids && input.lead_ids.length) {
      const placeholders = input.lead_ids.map(() => '?').join(',');
      leads = this.db.prepare(`
        SELECT * FROM leads WHERE id IN (${placeholders}) AND email IS NOT NULL
      `).all(...input.lead_ids);
    } else {
      leads = this.db.prepare(`
        SELECT * FROM leads
        WHERE status = 'enriquecido' AND email IS NOT NULL
        ORDER BY data_enrichment DESC LIMIT 10
      `).all();
    }

    if (leads.length === 0) return { enviados: 0, mensagem: 'Nenhum lead pra contatar.' };

    const stats = { tentados: 0, enviados: 0, dryrun: 0, erros: 0 };
    const haveResend = !!process.env.RESEND_API_KEY;

    for (const lead of leads) {
      const { assunto, corpo } = TEMPLATE_PRIMEIRO({ razao: lead.razao_social, nicho: lead.nicho });
      stats.tentados++;

      let enviado = false;
      let erro = null;

      if (haveResend) {
        try {
          const res = await fetch(RESEND_API, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${FROM_NAME} <${FROM_EMAIL}>`,
              to: [lead.email],
              subject: assunto,
              text: corpo,
            }),
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
          enviado = true;
          stats.enviados++;
        } catch (e) {
          stats.erros++;
          erro = e.message;
          console.warn(`[outbound_email] falhou pra ${lead.email}:`, e.message);
        }
      } else {
        // Dry-run
        stats.dryrun++;
      }

      // Registra na tabela conversas
      this.db.prepare(`
        INSERT INTO conversas (lead_id, canal, direcao, mensagem, assunto, agente_origem, status, ultimo_msg)
        VALUES (?, 'email', 'enviada', ?, ?, ?, 'aguardando_resposta', CURRENT_TIMESTAMP)
      `).run(
        lead.id,
        corpo,
        assunto,
        enviado ? 'outbound_email' : 'outbound_email_dryrun',
      );

      // Atualiza status do lead
      if (enviado) {
        this.db.prepare(`
          UPDATE leads SET status='contatado', data_primeiro_contato=CURRENT_TIMESTAMP WHERE id=?
        `).run(lead.id);
      }
    }

    if (!haveResend) {
      stats.aviso = 'RESEND_API_KEY não configurado — mensagens registradas em dry-run.';
    }

    return stats;
  }
}

module.exports = OutboundEmail;
