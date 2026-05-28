// Outbound Email — envia primeiro contato via Resend.
// - Dedup: lead já contatado nos últimos 90 dias é pulado.
// - Rate limit: respeita rate_limit_diario do cliente.
// - Aprovação humana: se cliente.auto_pilot=0 OU confianca<0.6, vai pra fila aprovacoes.
// - Cérebro: copy gerado pelo agente Copywriter.
// - Agenda follow-ups D+3/D+7/D+15.

const AgenteBase = require('./base');
const Copywriter = require('./copywriter');
const {
  jaContatadoRecente, checarRateLimit, consumirRateLimit, agendarFollowups,
} = require('./utils');

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.OUTBOUND_FROM_EMAIL || 'levi@l2automation.com.br';
const FROM_NAME = process.env.OUTBOUND_FROM_NAME || 'Levi · L2 Automation';
const CONFIANCA_MINIMA = 0.6;

class OutboundEmail extends AgenteBase {
  constructor(db) {
    super(db, 'outbound_email');
    this.timeoutMs = 180000;
    this.copywriter = new Copywriter(db);
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
        WHERE status = 'enriquecido' AND email IS NOT NULL AND (score IS NULL OR score >= 40)
        ORDER BY score DESC, data_enrichment DESC LIMIT 20
      `).all();
    }

    if (leads.length === 0) return { enviados: 0, mensagem: 'Nenhum lead pra contatar.' };

    const haveResend = !!process.env.RESEND_API_KEY;
    const stats = { tentados: 0, enviados: 0, dryrun: 0, aprovacao_pendente: 0, dedup: 0, rate_limit: 0, erros: 0 };

    for (const lead of leads) {
      stats.tentados++;
      const clienteSlug = lead.cliente_slug || 'l2-automation';
      const cliente = this.db.prepare('SELECT * FROM clientes WHERE slug = ?').get(clienteSlug);

      // Dedup
      if (jaContatadoRecente(this.db, lead.cnpj, 90)) {
        stats.dedup++;
        continue;
      }

      // Rate limit
      const rateChave = `outbound_email:${clienteSlug}`;
      const limite = cliente?.rate_limit_diario || 50;
      const rl = checarRateLimit(this.db, rateChave, limite);
      if (!rl.permitido) {
        stats.rate_limit++;
        break; // sai do loop — atingiu limite
      }

      // Gera copy via Copywriter
      let copy;
      try {
        copy = await this.copywriter.execute({ lead, canal: 'email', tentativa: 1 });
      } catch (e) {
        stats.erros++;
        console.warn(`[outbound_email] copy falhou pra ${lead.id}: ${e.message}`);
        continue;
      }

      // Auto-pilot OFF ou baixa confiança → fila aprovação
      if (!cliente?.auto_pilot || copy.confianca < CONFIANCA_MINIMA) {
        const apr = this.db.prepare(`
          INSERT INTO aprovacoes (lead_id, agente_origem, canal, assunto, mensagem, confianca, motivo_aprovacao)
          VALUES (?, 'outbound_email', 'email', ?, ?, ?, ?)
        `).run(
          lead.id, copy.assunto, copy.corpo, copy.confianca,
          !cliente?.auto_pilot ? 'cliente sem auto_pilot' : `confianca ${copy.confianca} < ${CONFIANCA_MINIMA}`
        );
        stats.aprovacao_pendente++;
        this.emitirEvento('aprovacao_pendente', { aprovacao_id: apr.lastInsertRowid, lead_id: lead.id });
        continue;
      }

      // Envia de fato (ou dry-run)
      let enviado = false;
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
              subject: copy.assunto,
              text: copy.corpo,
              headers: { 'X-Lead-Id': String(lead.id), 'X-Cliente': clienteSlug },
            }),
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
          enviado = true;
          stats.enviados++;
          consumirRateLimit(this.db, rateChave, limite);
        } catch (e) {
          stats.erros++;
          console.warn(`[outbound_email] envio falhou ${lead.email}:`, e.message);
          continue;
        }
      } else {
        stats.dryrun++;
      }

      // Registra na tabela conversas
      const conv = this.db.prepare(`
        INSERT INTO conversas (lead_id, canal, direcao, mensagem, assunto, agente_origem, status, ultimo_msg, template_id)
        VALUES (?, 'email', 'enviada', ?, ?, ?, 'aguardando_resposta', CURRENT_TIMESTAMP, ?)
      `).run(
        lead.id, copy.corpo, copy.assunto,
        enviado ? 'outbound_email' : 'outbound_email_dryrun',
        copy.framework_usado,
      );

      // Marca lead
      this.db.prepare(`
        UPDATE leads SET status='contatado', data_primeiro_contato=CURRENT_TIMESTAMP, ultimo_outbound=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(lead.id);

      // Agenda followups
      agendarFollowups(this.db, lead.id, conv.lastInsertRowid, 'email');
    }

    if (!haveResend) stats.aviso = 'RESEND_API_KEY ausente — dry-run.';
    return stats;
  }
}

module.exports = OutboundEmail;
