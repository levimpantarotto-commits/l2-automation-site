// Scheduler — dispara agentes autonomamente pelo cron_expr do DB.
// Lê tabela `agentes`, agenda cada um com cron_ativo=1 via node-cron.
// Se cron_expr inválido, ignora e marca status='degradado' com erro.
//
// Hot-reload: a cada 60s relê o DB pra detectar agentes ativados/desativados/alterados.
//
// Uso: const start = require('./agents/scheduler'); start(db);

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const AGENTS_DIR = path.join(__dirname);

class Scheduler {
  constructor(db) {
    this.db = db;
    this.jobs = new Map(); // nome -> { task, cron_expr }
    this.reloadTimer = null;
  }

  start() {
    this._sincronizar();
    // hot-reload a cada 60s
    this.reloadTimer = setInterval(() => this._sincronizar(), 60_000);
    console.log('[scheduler] iniciado, hot-reload a cada 60s');
  }

  stop() {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
    for (const [nome, { task }] of this.jobs) {
      task.stop();
    }
    this.jobs.clear();
  }

  _sincronizar() {
    const agentes = this.db.prepare(`
      SELECT nome, cron_expr, cron_ativo FROM agentes
      WHERE cron_ativo = 1 AND cron_expr IS NOT NULL AND cron_expr != ''
    `).all();

    const nomesAtivos = new Set(agentes.map(a => a.nome));

    // Para jobs que sumiram do DB (cron_ativo=0) ou mudaram expressão
    for (const [nome, info] of this.jobs.entries()) {
      const ag = agentes.find(a => a.nome === nome);
      if (!ag || ag.cron_expr !== info.cron_expr) {
        info.task.stop();
        this.jobs.delete(nome);
        console.log(`[scheduler] parou job: ${nome}`);
      }
    }

    // Cria jobs novos
    for (const ag of agentes) {
      if (this.jobs.has(ag.nome)) continue;

      if (!cron.validate(ag.cron_expr)) {
        console.warn(`[scheduler] cron_expr invalida pra ${ag.nome}: "${ag.cron_expr}"`);
        this._marcarErro(ag.nome, `cron_expr inválida: ${ag.cron_expr}`);
        continue;
      }

      const agentFile = path.join(AGENTS_DIR, `${ag.nome}.js`);
      if (!fs.existsSync(agentFile)) {
        // Sem warning ruidoso — agente ainda não implementado é normal nesse MVP
        continue;
      }

      const task = cron.schedule(ag.cron_expr, () => this._dispararAgente(ag.nome), {
        scheduled: true,
        timezone: 'America/Sao_Paulo',
      });

      this.jobs.set(ag.nome, { task, cron_expr: ag.cron_expr });
      this._atualizarProximoRun(ag.nome, ag.cron_expr);
      console.log(`[scheduler] agendou: ${ag.nome} (${ag.cron_expr})`);
    }
  }

  async _dispararAgente(nome) {
    const agentFile = path.join(AGENTS_DIR, `${nome}.js`);
    if (!fs.existsSync(agentFile)) return;

    try {
      delete require.cache[require.resolve(agentFile)]; // hot-reload de código
      const AgenteImpl = require(agentFile);
      const instance = new AgenteImpl(this.db);
      await instance.run({}, 'cron');
    } catch (e) {
      console.error(`[scheduler] erro disparando ${nome}:`, e.message);
    }
  }

  _atualizarProximoRun(nome, expr) {
    // Estima próximo run baseado no cron expr (aproximação simples)
    try {
      this.db.prepare(`
        UPDATE agentes SET proximo_run = datetime('now', '+1 minute')
        WHERE nome = ?
      `).run(nome);
    } catch (_) {}
  }

  _marcarErro(nome, msg) {
    try {
      this.db.prepare(`
        UPDATE agentes SET status = 'degradado', ultimo_erro = ?
        WHERE nome = ?
      `).run(msg, nome);
    } catch (_) {}
  }
}

module.exports = function startScheduler(db) {
  const s = new Scheduler(db);
  s.start();
  return s;
};
