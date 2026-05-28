// Enricher — completa dados de leads com email/whatsapp/linkedin/site.
// Por enquanto: marca como 'enriquecido' os leads com email já preenchido pelo BrasilAPI;
// pros sem email, tenta inferir via padrão "contato@<dominio>" quando há site.
// Próxima iteração: integrar Hunter.io / Apollo.io / Snov.io.
//
// Input: { lead_ids: [...] } OU vazio (pega todos com status='novo' nos últimos 7 dias)
const AgenteBase = require('./base');

class Enricher extends AgenteBase {
  constructor(db) {
    super(db, 'enricher');
    this.timeoutMs = 120000;
  }

  async execute(input = {}) {
    let leads;
    if (input.lead_ids && input.lead_ids.length) {
      const placeholders = input.lead_ids.map(() => '?').join(',');
      leads = this.db.prepare(`SELECT * FROM leads WHERE id IN (${placeholders})`).all(...input.lead_ids);
    } else {
      leads = this.db.prepare(`
        SELECT * FROM leads
        WHERE status = 'novo' AND data_coleta > datetime('now', '-7 days')
        LIMIT 50
      `).all();
    }

    if (leads.length === 0) return { processados: 0, mensagem: 'Nenhum lead pra enriquecer.' };

    const stats = { processados: 0, com_email: 0, sem_email: 0 };

    for (const lead of leads) {
      let novoEmail = lead.email;
      let novoStatus = 'enriquecido';

      // Inferência simples: se tem site mas não tem email, gera padrão contato@dominio
      if (!novoEmail && lead.metadata) {
        try {
          const meta = JSON.parse(lead.metadata);
          // BrasilAPI não tem site direto, mas se algum dia tiver
          if (meta.site) {
            const dominio = meta.site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            if (dominio && dominio.includes('.')) {
              novoEmail = `contato@${dominio}`;
            }
          }
        } catch (_) {}
      }

      this.db.prepare(`
        UPDATE leads SET
          email = COALESCE(?, email),
          status = ?,
          data_enrichment = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(novoEmail, novoStatus, lead.id);

      stats.processados++;
      if (novoEmail) stats.com_email++; else stats.sem_email++;
    }

    return stats;
  }
}

module.exports = Enricher;
