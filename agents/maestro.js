// Maestro — orquestrador. Roda periodicamente e decide:
//  - leads novos (status='novo') → dispara enricher
//  - leads enriquecidos (status='enriquecido') → dispara outbound_email
//  - leads em conversa há > 24h sem resposta → dispara sdr_neural pra follow-up
//  - failures pendentes → dispara self_debugger
//
// Não bloqueante: dispara via .run() async sem await em paralelo.

const AgenteBase = require('./base');
const path = require('path');
const fs = require('fs');

class Maestro extends AgenteBase {
  constructor(db) {
    super(db, 'maestro');
    this.timeoutMs = 30000;
  }

  async execute() {
    const decisoes = [];

    // 1) Leads novos → enricher
    const novos = this.db.prepare(`SELECT id, cnpj FROM leads WHERE status = 'novo' LIMIT 20`).all();
    if (novos.length > 0) {
      decisoes.push({ acao: 'enriquecer', quantidade: novos.length });
      this._dispararSeExiste('enricher', { lead_ids: novos.map(l => l.id) });
    }

    // 2) Leads enriquecidos → outbound_email
    const prontos = this.db.prepare(`SELECT id FROM leads WHERE status = 'enriquecido' AND email IS NOT NULL LIMIT 10`).all();
    if (prontos.length > 0) {
      decisoes.push({ acao: 'outbound_email', quantidade: prontos.length });
      this._dispararSeExiste('outbound_email', { lead_ids: prontos.map(l => l.id) });
    }

    // 3) Conversas paradas → sdr_neural follow-up
    const paradas = this.db.prepare(`
      SELECT id, lead_id FROM conversas
      WHERE status = 'aguardando_resposta'
        AND ultimo_msg < datetime('now', '-1 day')
        AND followups_count < 3
      LIMIT 10
    `).all();
    if (paradas.length > 0) {
      decisoes.push({ acao: 'followup_sdr', quantidade: paradas.length });
      this._dispararSeExiste('sdr_neural', { conversa_ids: paradas.map(c => c.id), modo: 'followup' });
    }

    // 4) Failures pendentes → self_debugger
    const failures = this.db.prepare(`
      SELECT COUNT(*) AS c FROM failures
      WHERE resolucao_tentada IS NULL
    `).get();
    if (failures.c > 0) {
      decisoes.push({ acao: 'analisar_falhas', quantidade: failures.c });
      this._dispararSeExiste('self_debugger', { limite: 5 });
    }

    if (decisoes.length === 0) {
      return { decisoes: [], mensagem: 'Pipeline em dia — nada pra disparar.' };
    }

    this.emitirEvento('maestro_decisao', { decisoes });
    return { decisoes };
  }

  _dispararSeExiste(nome, payload) {
    const file = path.join(__dirname, `${nome}.js`);
    if (!fs.existsSync(file)) return;
    try {
      delete require.cache[require.resolve(file)];
      const AgenteImpl = require(file);
      const instance = new AgenteImpl(this.db);
      instance.run(payload, 'maestro').catch(e => console.error(`[maestro -> ${nome}]`, e.message));
    } catch (e) {
      console.error(`[maestro] erro carregando ${nome}:`, e.message);
    }
  }
}

module.exports = Maestro;
