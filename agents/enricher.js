// Enricher — completa dados + calcula BANT + filtra por ICP.
// Hoje: marca como 'enriquecido' OU 'descartado' (não passa ICP).
// Hunter.io / Apollo: ligados quando HUNTER_API_KEY / APOLLO_API_KEY estiverem no env.
//
// Input: { lead_ids: [...], cliente_slug: 'l2-automation' } OU vazio (auto)

const AgenteBase = require('./base');
const { bantScore, passaICP } = require('./utils');

class Enricher extends AgenteBase {
  constructor(db) {
    super(db, 'enricher');
    this.timeoutMs = 180000;
  }

  async execute(input = {}) {
    const clienteSlug = input.cliente_slug || 'l2-automation';
    let leads;
    if (input.lead_ids && input.lead_ids.length) {
      const placeholders = input.lead_ids.map(() => '?').join(',');
      leads = this.db.prepare(`SELECT * FROM leads WHERE id IN (${placeholders})`).all(...input.lead_ids);
    } else {
      leads = this.db.prepare(`
        SELECT * FROM leads
        WHERE status = 'novo' AND data_coleta > datetime('now', '-30 days')
        LIMIT 100
      `).all();
    }

    if (leads.length === 0) return { processados: 0, mensagem: 'Nenhum lead pra enriquecer.' };

    // Carrega persona do nicho pra BANT score
    const personasCache = {};
    const getPersona = (nicho) => {
      if (!nicho) return null;
      if (personasCache[nicho]) return personasCache[nicho];
      const p = this.db.prepare('SELECT * FROM personas WHERE nicho = ?').get(nicho);
      personasCache[nicho] = p;
      return p;
    };

    const stats = { processados: 0, qualificados: 0, descartados_icp: 0, com_email: 0, baixo_bant: 0 };

    for (const lead of leads) {
      stats.processados++;

      // 1) Inferência de email pelo domínio do site
      let novoEmail = lead.email;
      if (!novoEmail && lead.metadata) {
        try {
          const meta = JSON.parse(lead.metadata);
          if (meta.site) {
            const dominio = meta.site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            if (dominio && dominio.includes('.')) novoEmail = `contato@${dominio}`;
          }
        } catch (_) {}
      }

      // 2) Hunter.io (se chave configurada e tem domínio)
      if (!novoEmail && process.env.HUNTER_API_KEY && lead.metadata) {
        try {
          novoEmail = await this._buscarHunter(lead, JSON.parse(lead.metadata));
        } catch (e) {
          console.warn(`[enricher] Hunter falhou pra ${lead.id}: ${e.message}`);
        }
      }

      // 3) ICP filter
      const icp = passaICP(this.db, lead, clienteSlug);
      if (!icp.passa) {
        this.db.prepare(`
          UPDATE leads SET status = 'descartado', data_enrichment = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(lead.id);
        stats.descartados_icp++;
        continue;
      }

      // 4) BANT scoring
      const persona = getPersona(lead.nicho);
      const bant = bantScore({ ...lead, email: novoEmail }, persona);

      // 5) Baixo BANT (<40) → descarta
      let statusNovo = 'enriquecido';
      if (bant.total < 40) {
        statusNovo = 'descartado';
        stats.baixo_bant++;
      } else {
        stats.qualificados++;
      }
      if (novoEmail) stats.com_email++;

      this.db.prepare(`
        UPDATE leads SET
          email = COALESCE(?, email),
          status = ?,
          data_enrichment = CURRENT_TIMESTAMP,
          score = ?,
          bant_budget = ?, bant_authority = ?, bant_need = ?, bant_timeline = ?, bant_detalhe = ?,
          cliente_slug = COALESCE(cliente_slug, ?)
        WHERE id = ?
      `).run(
        novoEmail, statusNovo,
        bant.total, bant.budget, bant.authority, bant.need, bant.timeline, bant.detalhe,
        clienteSlug, lead.id
      );
    }

    return stats;
  }

  async _buscarHunter(lead, meta) {
    const dominio = (meta.site || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!dominio) return null;

    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(dominio)}&api_key=${process.env.HUNTER_API_KEY}&limit=3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hunter ${res.status}`);
    const data = await res.json();
    const decisor = (data?.data?.emails || []).find(e => /ceo|founder|diretor|owner|managing/i.test(e.position || ''));
    return (decisor && decisor.value) || (data?.data?.emails?.[0]?.value) || null;
  }
}

module.exports = Enricher;
