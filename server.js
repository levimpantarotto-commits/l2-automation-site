// L2 Automation — backend principal
// Stack: Node 22 + Express + better-sqlite3
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3004;
const DB_PATH = process.env.DB_PATH || './data/l2.db';

// ============================================================
// DB SETUP — cria DB se não existir + aplica schema na inicialização
// ============================================================
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Auto-aplica schema na inicialização (idempotente)
try {
  const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf-8');
  db.exec(schema);
} catch (e) {
  console.error('[boot] erro aplicando schema:', e.message);
}

// Migrations defensivas — adicionar colunas em DBs antigos (SQLite ignora se já existe via try/catch)
function tryAddColumn(table, col, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (_) {}
}
tryAddColumn('conversas', 'status', "TEXT DEFAULT 'aberta'");
tryAddColumn('conversas', 'ultimo_msg', 'TIMESTAMP');
tryAddColumn('conversas', 'followups_count', 'INTEGER DEFAULT 0');
tryAddColumn('failures', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

// Auto-popula/atualiza agentes (idempotente — roda sempre pra refletir mudanças do código)
try {
  const { seed } = require('./scripts/init-db.js');
  seed(db);
} catch (e) {
  console.error('[boot] init-db falhou:', e.message);
}

console.log(`[boot] DB: ${DB_PATH} · agentes: ${db.prepare('SELECT COUNT(*) AS c FROM agentes').get().c}`);

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();
app.use(express.json({ limit: '2mb' }));

// ============================================================
// BASIC AUTH — protege /admin e /api/* (exceto /api/saude pro Coolify)
// User/senha vêm de env vars. Defaults inseguros pra dev local.
// ============================================================
const AUTH_USER = process.env.BASIC_AUTH_USER || 'admin';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || 'troqueme';

function basicAuth(req, res, next) {
  // /api/saude sempre aberto (Coolify healthcheck precisa)
  if (req.path === '/api/saude') return next();
  // Site marketing aberto (estáticos da raiz, /blog, etc)
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/api')) return next();

  const auth = req.headers.authorization || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="L2 Admin"');
    return res.status(401).send('Auth required');
  }
  const [u, p] = Buffer.from(encoded, 'base64').toString('utf-8').split(':');
  if (u !== AUTH_USER || p !== AUTH_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="L2 Admin"');
    return res.status(401).send('Credenciais inválidas');
  }
  next();
}
app.use(basicAuth);

// ============================================================
// ESTÁTICOS — serve site marketing + admin
// Whitelist por segurança (não expõe server.js, .env, etc)
// ============================================================
const PASTAS_PUBLICAS = ['blog', 'img', 'posts', 'models', 'public', 'cortex-frames'];
PASTAS_PUBLICAS.forEach(p => {
  const dir = path.join(__dirname, p);
  if (fs.existsSync(dir)) app.use(`/${p}`, express.static(dir, { maxAge: '7d' }));
});

// Painel admin — dashboard React buildado pelo Vite (public/admin/)
// Fallback: admin/index.html simples (legacy) caso dashboard não esteja buildado
const adminBuilt = path.join(__dirname, 'public/admin');
if (fs.existsSync(adminBuilt)) {
  app.use('/admin', express.static(adminBuilt, { maxAge: 0 }));
  // SPA: rotas internas do React (ex: /admin/kanban) devolvem index.html
  app.get('/admin/*', (req, res) => res.sendFile(path.join(adminBuilt, 'index.html')));
} else {
  app.use('/admin', express.static(path.join(__dirname, 'admin'), { maxAge: 0 }));
}

// HTML/recursos da raiz (whitelist explícita)
const ARQS_RAIZ = [
  'index.html', 'avatares-teste.html', 'escritorio-3d-teste.html', 'escritorioteste.html',
  'sitemap.xml', 'robots.txt', 'logo.svg',
];
ARQS_RAIZ.forEach(arq => {
  const file = path.join(__dirname, arq);
  if (fs.existsSync(file)) {
    app.get(`/${arq}`, (req, res) => res.sendFile(file));
  }
});

// Raiz → landing page
app.get('/', (req, res) => {
  const idx = path.join(__dirname, 'index.html');
  if (fs.existsSync(idx)) return res.sendFile(idx);
  res.redirect('/admin/');
});

// CORS pro escritório 3D externo poder consultar (site marketing)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// HEALTHCHECK (pro Coolify detectar app travado)
// ============================================================
app.get('/api/saude', (req, res) => {
  res.json({
    ok: true,
    projeto: 'l2-automation-app',
    versao: '0.1.0',
    ts: new Date().toISOString(),
    uptime_s: Math.floor(process.uptime()),
    agentes: db.prepare('SELECT COUNT(*) AS c FROM agentes').get().c,
    leads: db.prepare('SELECT COUNT(*) AS c FROM leads').get().c,
  });
});

// ============================================================
// AGENTES — listar status (consumido pelo escritório 3D)
// Formato compatível com /api/agentes/status do LMP/Igor
// ============================================================
app.get('/api/agentes/status', (req, res) => {
  const agentes = db.prepare(`
    SELECT
      nome, label, descricao, status,
      ultimo_run, proximo_run,
      cron_ativo, cron_expr,
      runs_24h, erros_24h,
      ultimo_erro, ultimo_modo, ultimo_cliente,
      CAST((julianday('now') - julianday(ultimo_run)) * 86400 AS INTEGER) AS segundos_desde_ultimo
    FROM agentes
    ORDER BY nome
  `).all();
  res.json({ agentes });
});

// ============================================================
// AGENTES — disparar manualmente
// ============================================================
app.post('/api/agentes/:nome/run', async (req, res) => {
  const { nome } = req.params;
  const agente = db.prepare('SELECT * FROM agentes WHERE nome = ?').get(nome);
  if (!agente) return res.status(404).json({ error: 'agente nao encontrado' });

  // Tenta carregar e executar o agente
  const agentPath = path.join(__dirname, 'agents', `${nome}.js`);
  if (!fs.existsSync(agentPath)) {
    return res.status(501).json({ error: `agente ${nome} ainda nao implementado`, file_esperado: agentPath });
  }

  try {
    const AgenteImpl = require(agentPath);
    const instance = new AgenteImpl(db);
    // Executa em background — resposta imediata
    instance.run(req.body || {}, 'manual').catch(e => console.error(`[agente ${nome}]`, e));
    res.json({ success: true, message: `agente ${nome} disparado` });
  } catch (e) {
    console.error('[run]', e);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ============================================================
// LEADS — lista paginada
// ============================================================
app.get('/api/leads', (req, res) => {
  const status = req.query.status;
  const nicho = req.query.nicho;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const offset = parseInt(req.query.offset, 10) || 0;

  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (nicho) { sql += ' AND nicho = ?'; params.push(nicho); }
  sql += ' ORDER BY data_coleta DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const leads = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS c FROM leads' + (status ? ' WHERE status = ?' : '')).get(...(status ? [status] : [])).c;

  res.json({ leads, total, limit, offset });
});

// ============================================================
// RUNS — logs de execuções (pra debug)
// ============================================================
app.get('/api/runs', (req, res) => {
  const agente = req.query.agente;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

  let sql = 'SELECT id, agente, inicio, fim, duracao_ms, status, erro, retry_count, modo FROM runs';
  const params = [];
  if (agente) { sql += ' WHERE agente = ?'; params.push(agente); }
  sql += ' ORDER BY inicio DESC LIMIT ?';
  params.push(limit);

  res.json({ runs: db.prepare(sql).all(...params) });
});

// ============================================================
// FAILURES — padrões de erro aprendidos
// ============================================================
app.get('/api/failures', (req, res) => {
  const failures = db.prepare(`
    SELECT * FROM failures
    ORDER BY ocorrencias DESC, ultimo_caso DESC
    LIMIT 100
  `).all();
  res.json({ failures });
});

// ============================================================
// STUBS — rotas que o dashboard LMP consome.
// Retornam vazio/default pra não quebrar UI até implementação real.
// ============================================================

// Auth (dashboard LMP espera cookie HTTP-only; nossa auth é Basic via header
// já tratada acima, então /auth/me retorna user fixo)
app.get('/api/auth/me', (req, res) => {
  res.json({ id: 1, username: 'admin', email: 'admin@l2automation.com.br', role: 'admin' });
});
app.post('/api/auth/login', (req, res) => res.json({ success: true, user: { username: 'admin' } }));
app.post('/api/auth/logout', (req, res) => res.json({ success: true }));

// Clientes (multi-tenant futuro; por enquanto 1 fixo - L2 Automation próprio)
app.get('/api/clientes', (req, res) => {
  res.json([
    { slug: 'l2-automation', nome: 'L2 Automation', ativo: 1, auto_pilot: 0 },
  ]);
});
app.get('/api/clientes/:slug', (req, res) => {
  res.json({
    cliente: {
      slug: req.params.slug,
      nome: 'L2 Automation',
      ativo: 1,
      auto_pilot: 0,
      vault_folder: null,
      dna: null,
    },
    stats: {
      manualPosts: 0,
      autoPosts: 0,
      totalPosts: 0,
      aprovados: 0,
      pendentes: 0,
    },
    dna: 'Cérebro do cliente ainda não configurado. Integração com Obsidian em desenvolvimento — você poderá colar o DNA aqui ou conectar pasta do vault.',
    log: null,
    neuralFlow: [],
  });
});

// Posts/Roteiros/Calendário (stub vazio até implementar)
app.get('/api/posts', (req, res) => res.json([]));
app.get('/api/roteiros', (req, res) => res.json([]));
app.get('/api/roteiros/:id', (req, res) => res.status(404).json({ error: 'não encontrado' }));
app.get('/api/calendar', (req, res) => res.json([]));
app.get('/api/analytics', (req, res) => res.json({ posts: 0, engajamento: 0, alcance: 0 }));
app.get('/api/metrics-dashboard', (req, res) => res.json({ stats: {} }));
app.get('/api/metrics/:postId', (req, res) => res.json({ likes: 0, comentarios: 0, alcance: 0 }));

// Miner / Referências / YT trends (stub)
app.get('/api/miner-report', (req, res) => res.json({}));
app.get('/api/miner-last-log', (req, res) => res.json({ log: '(sem dados)' }));
app.get('/api/referencias', (req, res) => res.json([]));

// Usuários (admin)
app.get('/api/auth/users', (req, res) => res.json([{ id: 1, username: 'admin', email: 'admin@l2automation.com.br', role: 'admin', ativo: 1 }]));

// Notificações
app.get('/api/notifications', (req, res) => res.json([]));
app.get('/api/notificacoes', (req, res) => res.json([]));

// Tráfego pago
app.get('/api/trafego-pago', (req, res) => res.json([]));
app.get('/api/midia-paga', (req, res) => res.json([]));

// Aprovação pública (token)
app.get('/api/aprovacao/:token', (req, res) => res.status(404).json({ error: 'token invalido' }));

// ============================================================
// MAESTRO (placeholder) — terminal interativo (futuro)
// ============================================================
app.post('/api/maestro', (req, res) => {
  const { command } = req.body || {};
  if (!command) return res.status(400).json({ error: 'command obrigatorio' });

  // Por enquanto: comandos básicos hardcoded
  const cmd = command.trim().toLowerCase();

  if (cmd === 'help') {
    return res.json({
      response: `Comandos disponíveis:
- help: lista comandos
- status: estado dos agentes
- leads: total de leads por status
- failures: padrões de erro
- run <agente>: dispara agente manualmente
- clear: limpa console`
    });
  }
  if (cmd === 'clear' || cmd === 'cls') {
    return res.json({ response: 'CLEAR_CONSOLE' });
  }
  if (cmd === 'status') {
    const ags = db.prepare('SELECT nome, status, runs_24h FROM agentes').all();
    return res.json({ response: ags.map(a => `${a.nome}: ${a.status} (${a.runs_24h} runs/24h)`).join('\n') });
  }
  if (cmd === 'leads') {
    const stats = db.prepare('SELECT status, COUNT(*) AS c FROM leads GROUP BY status').all();
    if (stats.length === 0) return res.json({ response: '(sem leads ainda)' });
    return res.json({ response: stats.map(s => `${s.status}: ${s.c}`).join('\n') });
  }
  if (cmd === 'failures') {
    const fails = db.prepare('SELECT padrao_erro, ocorrencias FROM failures ORDER BY ocorrencias DESC LIMIT 5').all();
    if (fails.length === 0) return res.json({ response: '(nenhuma falha aprendida ainda — bom sinal)' });
    return res.json({ response: fails.map(f => `${f.padrao_erro} (${f.ocorrencias}x)`).join('\n') });
  }
  if (cmd.startsWith('run ')) {
    const nome = cmd.slice(4).trim();
    const agente = db.prepare('SELECT nome FROM agentes WHERE nome = ?').get(nome);
    if (!agente) return res.json({ response: `agente "${nome}" não encontrado. Use "status" pra listar.` });
    const agentPath = path.join(__dirname, 'agents', `${nome}.js`);
    if (!fs.existsSync(agentPath)) return res.json({ response: `agente "${nome}" ainda não implementado.` });
    try {
      const AgenteImpl = require(agentPath);
      const instance = new AgenteImpl(db);
      instance.run({}, 'maestro').catch(e => console.error(`[${nome}]`, e));
      return res.json({ response: `disparado: ${nome}. Veja "status" em uns segundos.` });
    } catch (e) {
      return res.json({ response: `erro disparando ${nome}: ${e.message}` });
    }
  }

  res.json({ response: `comando desconhecido: "${cmd}". Digite "help".` });
});

// ============================================================
// CRON SCHEDULER (node-cron) — dispara agentes pelo cron_expr do DB
// Lê tabela agentes (cron_ativo=1) e agenda jobs. Hot-reload a cada 60s.
// ============================================================
let schedulerInstance = null;
try {
  const startScheduler = require('./agents/scheduler');
  schedulerInstance = startScheduler(db);
} catch (e) {
  console.error('[boot] scheduler falhou:', e.message);
}

// Endpoint pra ver estado do scheduler
app.get('/api/scheduler/status', (req, res) => {
  if (!schedulerInstance) return res.json({ ativo: false, jobs: [] });
  const jobs = Array.from(schedulerInstance.jobs.entries()).map(([nome, info]) => ({
    nome, cron_expr: info.cron_expr,
  }));
  res.json({ ativo: true, total: jobs.length, jobs });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`[L2 Automation] rodando em http://localhost:${PORT}`);
  console.log(`[L2 Automation] DB: ${DB_PATH}`);
  console.log(`[L2 Automation] admin: http://localhost:${PORT}/`);
});
