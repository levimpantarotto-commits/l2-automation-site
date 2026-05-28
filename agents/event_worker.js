// Event Worker — consome a tabela `eventos` em loop curto (10s).
// Substitui o polling de 5min do Maestro pra reações imediatas:
//   lead_novo       → enricher.run({ lead_ids: [id] })
//   lead_enriquecido → outbound_email.run({ lead_ids: [id] })
//   lead_respondeu  → sdr_neural.run({ modo: 'resposta' })
//   email_aberto    → marca evento de interesse
//   agente_quebrou  → cortex_alertas (notificação Levi)
//
// Cada evento processado é marcado `processado=1`.

const path = require('path');
const fs = require('fs');
const AGENTS_DIR = __dirname;

class EventWorker {
  constructor(db) {
    this.db = db;
    this.running = false;
    this.intervalo = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._tick(); // primeira passada imediata
    this.intervalo = setInterval(() => this._tick(), 10_000);
    console.log('[event_worker] iniciado, polling a cada 10s');
  }

  stop() {
    this.running = false;
    if (this.intervalo) clearInterval(this.intervalo);
  }

  async _tick() {
    try {
      const pendentes = this.db.prepare(`
        SELECT * FROM eventos
        WHERE processado = 0
        ORDER BY created_at ASC LIMIT 50
      `).all();

      for (const ev of pendentes) {
        await this._processar(ev);
      }
    } catch (e) {
      console.error('[event_worker] tick falhou:', e.message);
    }
  }

  async _processar(ev) {
    let payload = {};
    try { payload = JSON.parse(ev.payload || '{}'); } catch {}

    const handlers = {
      'lead_novo': () => this._disparar('enricher', { lead_ids: [payload.lead_id] }),
      'lead_enriquecido': () => this._disparar('outbound_email', { lead_ids: [payload.lead_id] }),
      'lead_respondeu': () => this._disparar('sdr_neural', { modo: 'resposta' }),
      'aprovacao_pendente': () => this._notificar('Aprovação pendente', payload),
      'snapshot_diario': () => this._notificar('Snapshot diário pronto', payload),
      'maestro_decisao': () => null, // só log
      'debug_concluido': () => this._notificar('Self-debugger rodou', payload),
    };

    const handler = handlers[ev.tipo];
    if (handler) {
      try { await handler(); } catch (e) {
        console.warn(`[event_worker] handler ${ev.tipo} falhou: ${e.message}`);
      }
    }

    this.db.prepare(`
      UPDATE eventos SET processado = 1, processado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ev.id);
  }

  _disparar(nomeAgente, input) {
    const file = path.join(AGENTS_DIR, `${nomeAgente}.js`);
    if (!fs.existsSync(file)) return;
    try {
      const AgenteImpl = require(file);
      const instance = new AgenteImpl(this.db);
      instance.run(input, 'evento').catch(e => console.error(`[event_worker -> ${nomeAgente}]`, e.message));
    } catch (e) {
      console.error(`[event_worker] erro disparando ${nomeAgente}:`, e.message);
    }
  }

  _notificar(titulo, payload) {
    try {
      this.db.prepare(`
        INSERT INTO notificacoes (titulo, payload, criticidade)
        VALUES (?, ?, ?)
      `).run(titulo, JSON.stringify(payload), 'info');
    } catch (e) {
      // tabela ainda não existe se for primeira execução — silently ignore
    }
  }
}

module.exports = function startEventWorker(db) {
  const w = new EventWorker(db);
  w.start();
  return w;
};
