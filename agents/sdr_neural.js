// SDR Neural — duas funções:
//   1) Processar followups pendentes (régua D+3/D+7/D+15)
//   2) Quando lead responde, gerar próxima mensagem na conversa
//
// Usa Copywriter pra geração e respeita aprovação humana / rate limit.

const AgenteBase = require('./base');
const Copywriter = require('./copywriter');
const {
  checarRateLimit, consumirRateLimit, cancelarFollowupsPendentes, temOptOut,
} = require('./utils');

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.OUTBOUND_FROM_EMAIL || 'levi@l2automation.com.br';
const FROM_NAME = process.env.OUTBOUND_FROM_NAME || 'Levi · L2 Automation';
const CONFIANCA_MINIMA = 0.6;

class SdrNeural extends AgenteBase {
  constructor(db) {
    super(db, 'sdr_neural');
    this.timeoutMs = 120000;
    this.copywriter = new Copywriter(db);
  }

  async execute(input = {}) {
    const modo = input.modo || 'auto';
    const stats = { followups: 0, respostas: 0, aprovacao: 0, rate_limit: 0, erros: 0 };

    if (modo === 'auto' || modo === 'followup') {
      await this._processarFollowups(stats);
    }
    if (modo === 'auto' || modo === 'resposta') {
      await this._processarRespostas(stats);
    }

    return stats;
  }

  async _processarFollowups(stats) {
    const pendentes = this.db.prepare(`
      SELECT f.*, l.razao_social, l.nicho, l.cliente_slug, l.email, l.cnpj
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      WHERE f.status = 'pendente' AND f.agendado_para <= datetime('now')
      LIMIT 30
    `).all();

    for (const f of pendentes) {
      const clienteSlug = f.cliente_slug || 'l2-automation';
      const cliente = this.db.prepare('SELECT * FROM clientes WHERE slug = ?').get(clienteSlug);
      const lead = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(f.lead_id);

      // Lead já respondeu OU pediu opt-out? cancela tudo
      if (lead.status === 'respondeu' || lead.status === 'qualificado' || lead.status === 'reuniao'
          || temOptOut(this.db, { cnpj: lead.cnpj, email: lead.email, whatsapp: lead.whatsapp })) {
        this.db.prepare(`UPDATE followups SET status='cancelado' WHERE id=?`).run(f.id);
        continue;
      }

      // Rate limit
      const rateChave = `sdr_neural:${clienteSlug}`;
      const limite = cliente?.rate_limit_diario || 50;
      const rl = checarRateLimit(this.db, rateChave, limite);
      if (!rl.permitido) { stats.rate_limit++; break; }

      // Gera follow-up
      let copy;
      try {
        copy = await this.copywriter.execute({ lead, canal: f.canal, tentativa: f.tentativa + 1 });
      } catch (e) {
        stats.erros++;
        continue;
      }

      // Aprovação?
      if (!cliente?.auto_pilot || copy.confianca < CONFIANCA_MINIMA) {
        this.db.prepare(`
          INSERT INTO aprovacoes (lead_id, conversa_id, agente_origem, canal, assunto, mensagem, confianca, motivo_aprovacao)
          VALUES (?, ?, 'sdr_neural', ?, ?, ?, ?, 'followup pendente aprovacao')
        `).run(f.lead_id, f.conversa_id, f.canal, copy.assunto || '', copy.corpo, copy.confianca);
        this.db.prepare(`UPDATE followups SET status='enviado', executado_em=CURRENT_TIMESTAMP WHERE id=?`).run(f.id);
        stats.aprovacao++;
        continue;
      }

      // Envia (email por enquanto; whatsapp/linkedin dry-run)
      const enviado = await this._enviar(lead, copy, f.canal);

      this.db.prepare(`
        INSERT INTO conversas (lead_id, canal, direcao, mensagem, assunto, agente_origem, status, ultimo_msg, template_id)
        VALUES (?, ?, 'enviada', ?, ?, ?, 'aguardando_resposta', CURRENT_TIMESTAMP, ?)
      `).run(
        f.lead_id, f.canal, copy.corpo, copy.assunto || '',
        enviado ? 'sdr_neural' : 'sdr_neural_dryrun', copy.framework_usado,
      );

      this.db.prepare(`UPDATE followups SET status='enviado', executado_em=CURRENT_TIMESTAMP WHERE id=?`).run(f.id);
      this.db.prepare(`UPDATE leads SET ultimo_outbound=CURRENT_TIMESTAMP WHERE id=?`).run(f.lead_id);
      if (enviado) consumirRateLimit(this.db, rateChave, limite);
      stats.followups++;
    }
  }

  async _processarRespostas(stats) {
    // Conversas com mensagem recebida não respondida pelo sistema
    const inbound = this.db.prepare(`
      SELECT c.*, l.razao_social, l.nicho, l.cliente_slug
      FROM conversas c
      JOIN leads l ON l.id = c.lead_id
      WHERE c.direcao = 'recebida'
        AND c.id NOT IN (
          SELECT COALESCE(c2.id, -1) FROM conversas c2
          WHERE c2.lead_id = c.lead_id AND c2.direcao = 'enviada' AND c2.timestamp > c.timestamp
        )
      ORDER BY c.timestamp DESC LIMIT 10
    `).all();

    for (const msg of inbound) {
      const lead = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(msg.lead_id);
      const cliente = this.db.prepare('SELECT * FROM clientes WHERE slug = ?').get(lead.cliente_slug || 'l2-automation');

      // Atualiza status do lead pra 'respondeu' (se ainda não tava)
      if (lead.status === 'contatado') {
        this.db.prepare(`
          UPDATE leads SET status='respondeu', data_resposta=CURRENT_TIMESTAMP WHERE id=?
        `).run(lead.id);
      }

      // Cancela followups pendentes (já respondeu)
      cancelarFollowupsPendentes(this.db, lead.id);

      // Resposta de continuação SEMPRE vai pra aprovação humana (alto risco mandar besteira)
      let copy;
      try {
        copy = await this.copywriter.execute({
          lead, canal: msg.canal,
          tentativa: 1, // tom de continuação, não followup
        });
      } catch (e) { stats.erros++; continue; }

      this.db.prepare(`
        INSERT INTO aprovacoes (lead_id, conversa_id, agente_origem, canal, assunto, mensagem, confianca, motivo_aprovacao)
        VALUES (?, ?, 'sdr_neural', ?, ?, ?, ?, 'lead respondeu, sugestao de continuacao')
      `).run(lead.id, msg.id, msg.canal, copy.assunto || '', copy.corpo, copy.confianca);

      // Marca conversa recebida como "tratada"
      this.db.prepare(`UPDATE conversas SET status='respondida' WHERE id=?`).run(msg.id);
      this.emitirEvento('lead_respondeu', { lead_id: lead.id, conversa_id: msg.id });
      stats.respostas++;
    }
  }

  async _enviar(lead, copy, canal) {
    if (canal !== 'email' || !process.env.RESEND_API_KEY) return false;
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
          headers: { 'X-Lead-Id': String(lead.id) },
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

module.exports = SdrNeural;
