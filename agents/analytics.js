// Analytics — snapshot diário de métricas. Calcula KPIs e emite evento pra dashboard.
// Output: { leads, taxa_conversao, agentes_health, top_falhas }

const AgenteBase = require('./base');

class Analytics extends AgenteBase {
  constructor(db) {
    super(db, 'analytics');
    this.timeoutMs = 30000;
  }

  async execute() {
    const leadsPorStatus = this.db.prepare(`
      SELECT status, COUNT(*) AS c FROM leads GROUP BY status
    `).all();

    const totalLeads = leadsPorStatus.reduce((s, r) => s + r.c, 0);
    const cliente = leadsPorStatus.find(r => r.status === 'cliente')?.c || 0;
    const contatados = leadsPorStatus.find(r => r.status === 'contatado')?.c || 0;
    const taxa_conversao = totalLeads > 0 ? (cliente / totalLeads * 100).toFixed(2) : 0;
    const taxa_contato = totalLeads > 0 ? (contatados / totalLeads * 100).toFixed(2) : 0;

    const agentesHealth = this.db.prepare(`
      SELECT nome, status, runs_24h, erros_24h FROM agentes
    `).all();

    const topFalhas = this.db.prepare(`
      SELECT agente, padrao_erro, ocorrencias FROM failures
      ORDER BY ocorrencias DESC LIMIT 5
    `).all();

    const snapshot = {
      ts: new Date().toISOString(),
      leads: { total: totalLeads, por_status: leadsPorStatus },
      conversao: { taxa_conversao_pct: taxa_conversao, taxa_contato_pct: taxa_contato },
      agentes_health: agentesHealth,
      top_falhas: topFalhas,
    };

    this.emitirEvento('snapshot_diario', snapshot);
    return snapshot;
  }
}

module.exports = Analytics;
