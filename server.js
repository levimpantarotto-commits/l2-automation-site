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

// Auto-popula agentes se tabela vazia
const agentesCount = db.prepare('SELECT COUNT(*) AS c FROM agentes').get().c;
if (agentesCount === 0) {
  console.log('[boot] tabela agentes vazia, rodando init-db...');
  require('./scripts/init-db.js');
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

// Painel admin (uso interno, sem cache, ATRÁS DE BASIC AUTH)
app.use('/admin', express.static(path.join(__dirname, 'admin'), { maxAge: 0 }));

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
// CRON SCHEDULER (simples — setInterval) — dispara agentes com cron_ativo
// ============================================================
const cronExpressions = {}; // cache
function parseCronAndShouldRun(expr) {
  if (!expr) return false;
  // Implementação simplificada: aceita 5 campos clássicos (min, hr, dom, mon, dow)
  // Pra robustez, próxima versão usar 'node-cron' mas pra MVP o setInterval com check
  // a cada minuto cobre os casos comuns.
  return true; // Placeholder — só usa quando expr tá presente
}

// (Cron real será adicionado na próxima iteração — por enquanto agentes rodam manualmente)

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`[L2 Automation] rodando em http://localhost:${PORT}`);
  console.log(`[L2 Automation] DB: ${DB_PATH}`);
  console.log(`[L2 Automation] admin: http://localhost:${PORT}/`);
});
