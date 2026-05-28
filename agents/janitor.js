// Janitor — limpeza periódica do DB pra não crescer infinito.
// - runs: mantém últimos 30 dias
// - eventos: mantém processados >7 dias removidos
// - rate_limits: remove janelas expiradas
// - backups_log: mantém últimos 90 dias
// Também faz auto-promote de leads quentes (BANT>80 ou respondeu) pra 'qualificado'.

const AgenteBase = require('./base');

class Janitor extends AgenteBase {
  constructor(db) {
    super(db, 'janitor');
    this.timeoutMs = 60000;
  }

  async execute() {
    const stats = { runs_removidos: 0, eventos_removidos: 0, rate_limits_removidos: 0, promovidos: 0 };

    // Runs antigos (>30 dias)
    const r1 = this.db.prepare(`DELETE FROM runs WHERE inicio < datetime('now', '-30 days')`).run();
    stats.runs_removidos = r1.changes;

    // Eventos processados antigos (>7 dias)
    const r2 = this.db.prepare(`
      DELETE FROM eventos WHERE processado = 1 AND processado_em < datetime('now', '-7 days')
    `).run();
    stats.eventos_removidos = r2.changes;

    // Rate limits expirados
    const r3 = this.db.prepare(`
      DELETE FROM rate_limits WHERE janela_fim < datetime('now')
    `).run();
    stats.rate_limits_removidos = r3.changes;

    // Backups_log >90 dias
    const r4 = this.db.prepare(`
      DELETE FROM backups_log WHERE created_at < datetime('now', '-90 days')
    `).run();
    stats.backups_log_removidos = r4.changes;

    // Auto-promote: leads que responderam OU BANT>80 viram 'qualificado'
    const r5 = this.db.prepare(`
      UPDATE leads SET status = 'qualificado'
      WHERE status = 'respondeu' AND score >= 60
    `).run();
    stats.promovidos += r5.changes;

    const r6 = this.db.prepare(`
      UPDATE leads SET status = 'qualificado'
      WHERE status IN ('contatado','enriquecido') AND score >= 85
    `).run();
    stats.promovidos += r6.changes;

    // Notifica quando há leads qualificados novos
    if (stats.promovidos > 0) {
      this.emitirEvento('leads_qualificados', { quantidade: stats.promovidos });
    }

    // VACUUM uma vez por semana (domingo madrugada)
    const dow = new Date().getDay();
    const hr = new Date().getHours();
    if (dow === 0 && hr < 5) {
      try { this.db.exec('VACUUM'); stats.vacuum = 'ok'; }
      catch (e) { stats.vacuum = `falhou: ${e.message}`; }
    }

    return stats;
  }
}

module.exports = Janitor;
