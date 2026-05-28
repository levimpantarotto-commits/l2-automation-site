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
tryAddColumn('leads', 'bant_budget', 'INTEGER');
tryAddColumn('leads', 'bant_authority', 'INTEGER');
tryAddColumn('leads', 'bant_need', 'INTEGER');
tryAddColumn('leads', 'bant_timeline', 'INTEGER');
tryAddColumn('leads', 'bant_detalhe', 'TEXT');
tryAddColumn('leads', 'cliente_slug', 'TEXT');
tryAddColumn('leads', 'ultimo_outbound', 'TIMESTAMP');

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
  // Webhooks externos (Resend/Stripe/etc) precisam acesso sem Basic Auth
  if (req.path.startsWith('/webhook/')) return next();
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

// Aliases admin (HTML standalone — ANTES do SPA fallback do React)
const sendHome = (req, res) => res.sendFile(path.join(__dirname, 'home-admin.html'));
app.get('/admin', sendHome);
app.get('/admin/', sendHome);
app.get('/admin/inbox', (req, res) => res.sendFile(path.join(__dirname, 'inbox.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard-admin.html')));
app.get('/admin/leads', (req, res) => res.sendFile(path.join(__dirname, 'leads-admin.html')));
app.get('/admin/config', (req, res) => res.sendFile(path.join(__dirname, 'config-admin.html')));
app.get('/admin/posts', (req, res) => res.sendFile(path.join(__dirname, 'posts-admin.html')));
app.get('/admin/roteiros', (req, res) => res.sendFile(path.join(__dirname, 'roteiros-admin.html')));
app.get('/admin/ideias', (req, res) => res.sendFile(path.join(__dirname, 'ideias-admin.html')));
app.get('/admin/ia', (req, res) => res.sendFile(path.join(__dirname, 'ia-admin.html')));
app.get('/admin/comecar', (req, res) => res.sendFile(path.join(__dirname, 'comecar-admin.html')));
app.get('/admin/cerebro', (req, res) => res.sendFile(path.join(__dirname, 'cerebro-admin.html')));
app.get('/admin/escritorio.html', (req, res) => {
  const built = path.join(__dirname, 'public/admin/escritorio.html');
  if (fs.existsSync(built)) return res.sendFile(built);
  res.sendFile(path.join(__dirname, 'dashboard/public/escritorio.html'));
});

// Painel React antigo fica em /admin/painel-antigo/ (não é mais a home)
const adminBuilt = path.join(__dirname, 'public/admin');
if (fs.existsSync(adminBuilt)) {
  // Vite buildou com base /admin/ — assets carregam de /admin/assets/...
  // Mantemos esse path funcionando pro React rodar quando acessado via /admin/painel-antigo/
  app.use('/admin/assets', express.static(path.join(adminBuilt, 'assets'), { maxAge: 0 }));
  app.use('/admin/painel-antigo/assets', express.static(path.join(adminBuilt, 'assets'), { maxAge: 0 }));
  app.use('/admin/painel-antigo', express.static(adminBuilt, { maxAge: 0 }));
  app.get('/admin/painel-antigo/*', (req, res) => res.sendFile(path.join(adminBuilt, 'index.html')));
}

// HTML/recursos da raiz (whitelist explícita)
const ARQS_RAIZ = [
  'index.html', 'avatares-teste.html', 'escritorio-3d-teste.html', 'escritorioteste.html',
  'sitemap.xml', 'robots.txt', 'logo.svg', 'inbox.html',
  'dashboard-admin.html', 'leads-admin.html', 'config-admin.html', 'home-admin.html',
  'posts-admin.html', 'roteiros-admin.html', 'ideias-admin.html', 'ia-admin.html',
  'comecar-admin.html', 'cerebro-admin.html',
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

// Clientes (multi-tenant real)
app.get('/api/clientes', (req, res) => {
  const clientes = db.prepare(`SELECT * FROM clientes ORDER BY created_at DESC`).all();
  res.json(clientes);
});

app.get('/api/clientes/:slug', (req, res) => {
  const cliente = db.prepare(`SELECT * FROM clientes WHERE slug = ?`).get(req.params.slug);
  if (!cliente) {
    // Backward-compat com dashboard React antigo
    return res.json({
      cliente: { slug: req.params.slug, nome: req.params.slug, ativo: 1, auto_pilot: 0 },
      stats: { manualPosts: 0, autoPosts: 0, totalPosts: 0, aprovados: 0, pendentes: 0 },
      dna: 'Cliente ainda não cadastrado. Use /admin/config pra criar.',
      log: null, neuralFlow: [],
    });
  }
  // Stats do funil pra esse cliente
  const stats = {
    leads: db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE cliente_slug = ?`).get(req.params.slug).c,
    contatados: db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE cliente_slug = ? AND status IN ('contatado','respondeu','qualificado','reuniao','cliente')`).get(req.params.slug).c,
    qualificados: db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE cliente_slug = ? AND status IN ('qualificado','reuniao','cliente')`).get(req.params.slug).c,
    aprovacoes_pendentes: db.prepare(`SELECT COUNT(*) AS c FROM aprovacoes WHERE status='pendente' AND lead_id IN (SELECT id FROM leads WHERE cliente_slug = ?)`).get(req.params.slug).c,
  };
  res.json({
    cliente,
    stats,
    dna: cliente.dna_resumo || 'DNA não cadastrado',
    dnaCompleto: cliente.dna_completo,
    log: null, neuralFlow: [],
  });
});

// Calendar (stub)
app.get('/api/roteiros/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM roteiros WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'nao encontrado' });
  res.json(r);
});
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
// CEREBRO DE PERSUASAO — upload/listagem (auth obrigatorio)
// Vault privado do Levi nao vai pro git. Sobe via API e fica no volume /data.
// ============================================================
app.get('/api/cerebro', (req, res) => {
  const arquivos = db.prepare(`
    SELECT slug, titulo, fonte, tamanho_bytes, updated_at,
           length(conteudo_md) AS chars
    FROM cerebro_arquivos ORDER BY slug
  `).all();
  res.json({ arquivos, total: arquivos.length });
});

app.get('/api/cerebro/:slug', (req, res) => {
  const a = db.prepare('SELECT * FROM cerebro_arquivos WHERE slug = ?').get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'nao encontrado' });
  res.json(a);
});

app.post('/api/cerebro/upload', (req, res) => {
  const { slug, titulo, fonte, conteudo_md, resumo_curto, tags } = req.body || {};
  if (!slug || !titulo || !conteudo_md) return res.status(400).json({ error: 'slug, titulo e conteudo_md obrigatorios' });

  db.prepare(`
    INSERT INTO cerebro_arquivos (slug, titulo, fonte, conteudo_md, resumo_curto, tags, tamanho_bytes, updated_at)
    VALUES (@slug, @titulo, @fonte, @conteudo_md, @resumo_curto, @tags, @tamanho_bytes, CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET
      titulo = excluded.titulo,
      fonte = excluded.fonte,
      conteudo_md = excluded.conteudo_md,
      resumo_curto = excluded.resumo_curto,
      tags = excluded.tags,
      tamanho_bytes = excluded.tamanho_bytes,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    slug, titulo, fonte: fonte || 'manual', conteudo_md,
    resumo_curto: resumo_curto || conteudo_md.slice(0, 1500),
    tags: tags ? JSON.stringify(tags) : null,
    tamanho_bytes: Buffer.byteLength(conteudo_md, 'utf-8'),
  });
  res.json({ success: true, slug });
});

app.delete('/api/cerebro/:slug', (req, res) => {
  const r = db.prepare('DELETE FROM cerebro_arquivos WHERE slug = ?').run(req.params.slug);
  res.json({ success: true, removidos: r.changes });
});

// ============================================================
// APROVACOES — fila de mensagens pendente OK do humano
// ============================================================
app.get('/api/aprovacoes', (req, res) => {
  const status = req.query.status || 'pendente';
  const aprovacoes = db.prepare(`
    SELECT a.*, l.razao_social, l.email, l.nicho
    FROM aprovacoes a
    LEFT JOIN leads l ON l.id = a.lead_id
    WHERE a.status = ?
    ORDER BY a.created_at DESC LIMIT 100
  `).all(status);
  res.json({ aprovacoes });
});

app.post('/api/aprovacoes/:id/decidir', async (req, res) => {
  const { decisao, mensagem_final, decidido_por } = req.body || {};
  // decisao: 'aprovar' | 'editar' | 'rejeitar'
  const apr = db.prepare('SELECT * FROM aprovacoes WHERE id = ?').get(req.params.id);
  if (!apr) return res.status(404).json({ error: 'aprovacao nao encontrada' });
  if (apr.status !== 'pendente') return res.status(400).json({ error: 'ja decidida' });

  if (decisao === 'rejeitar') {
    db.prepare(`UPDATE aprovacoes SET status='rejeitada', decidido_por=?, decidido_em=CURRENT_TIMESTAMP WHERE id=?`)
      .run(decidido_por || 'admin', req.params.id);
    return res.json({ success: true, decisao: 'rejeitada' });
  }

  // aprovar ou editar: dispara envio real
  const msgFinal = (decisao === 'editar' && mensagem_final) ? mensagem_final : apr.mensagem;
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(apr.lead_id);

  let enviado = false;
  if (apr.canal === 'email' && process.env.RESEND_API_KEY && lead?.email) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${process.env.OUTBOUND_FROM_NAME || 'Levi · L2 Automation'} <${process.env.OUTBOUND_FROM_EMAIL || 'levi@l2automation.com.br'}>`,
          to: [lead.email],
          subject: apr.assunto,
          text: msgFinal,
          headers: { 'X-Lead-Id': String(apr.lead_id), 'X-Aprovacao': String(apr.id) },
        }),
      });
      enviado = r.ok;
    } catch (e) {
      console.warn('[aprovacoes/decidir]', e.message);
    }
  }

  // Atualiza aprovacao
  db.prepare(`
    UPDATE aprovacoes SET status=?, mensagem_final=?, decidido_por=?, decidido_em=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    decisao === 'editar' ? 'editada' : 'aprovada',
    msgFinal, decidido_por || 'admin', req.params.id
  );

  // Registra em conversas
  db.prepare(`
    INSERT INTO conversas (lead_id, canal, direcao, mensagem, assunto, agente_origem, status, ultimo_msg)
    VALUES (?, ?, 'enviada', ?, ?, ?, 'aguardando_resposta', CURRENT_TIMESTAMP)
  `).run(apr.lead_id, apr.canal, msgFinal, apr.assunto, enviado ? `${apr.agente_origem}_aprovado` : `${apr.agente_origem}_dryrun_aprovado`);

  // Marca lead
  if (lead) {
    db.prepare(`UPDATE leads SET status='contatado', data_primeiro_contato=COALESCE(data_primeiro_contato, CURRENT_TIMESTAMP), ultimo_outbound=CURRENT_TIMESTAMP WHERE id=?`).run(apr.lead_id);
  }

  res.json({ success: true, decisao, enviado_de_verdade: enviado });
});

// ============================================================
// NICHOS_ALVO — CRUD ICP
// ============================================================
app.get('/api/nichos', (req, res) => {
  const cliente = req.query.cliente_slug || 'l2-automation';
  const nichos = db.prepare(`SELECT * FROM nichos_alvo WHERE cliente_slug = ? ORDER BY id`).all(cliente);
  res.json({ nichos });
});

app.post('/api/nichos', (req, res) => {
  const { cliente_slug, nome, cnae_filtros, uf_filtros, porte_filtros, capital_min, capital_max, cnaes_excluir } = req.body || {};
  if (!cliente_slug || !nome) return res.status(400).json({ error: 'cliente_slug e nome obrigatorios' });
  const r = db.prepare(`
    INSERT INTO nichos_alvo (cliente_slug, nome, cnae_filtros, uf_filtros, porte_filtros, capital_min, capital_max, cnaes_excluir)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cliente_slug, nome,
    cnae_filtros ? JSON.stringify(cnae_filtros) : null,
    uf_filtros ? JSON.stringify(uf_filtros) : null,
    porte_filtros ? JSON.stringify(porte_filtros) : null,
    capital_min || null, capital_max || null,
    cnaes_excluir ? JSON.stringify(cnaes_excluir) : null,
  );
  res.json({ success: true, id: r.lastInsertRowid });
});

app.delete('/api/nichos/:id', (req, res) => {
  db.prepare('DELETE FROM nichos_alvo WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============================================================
// PERSONAS — leitura/edição
// ============================================================
app.get('/api/personas', (req, res) => {
  res.json({ personas: db.prepare('SELECT * FROM personas ORDER BY nicho').all() });
});

app.put('/api/personas/:nicho', (req, res) => {
  const { label, dor_principal, ganho_prometido, tom, abertura_template, ganchos, exemplos_concretos } = req.body || {};
  db.prepare(`
    UPDATE personas SET
      label = COALESCE(?, label),
      dor_principal = COALESCE(?, dor_principal),
      ganho_prometido = COALESCE(?, ganho_prometido),
      tom = COALESCE(?, tom),
      abertura_template = COALESCE(?, abertura_template),
      ganchos = COALESCE(?, ganchos),
      exemplos_concretos = COALESCE(?, exemplos_concretos),
      updated_at = CURRENT_TIMESTAMP
    WHERE nicho = ?
  `).run(
    label, dor_principal, ganho_prometido, tom, abertura_template,
    ganchos ? JSON.stringify(ganchos) : null,
    exemplos_concretos ? JSON.stringify(exemplos_concretos) : null,
    req.params.nicho,
  );
  res.json({ success: true });
});

// ============================================================
// CLIENTES — multi-tenant CRUD
// ============================================================
app.post('/api/clientes', (req, res) => {
  const { slug, nome, email_contato, whatsapp_contato, nicho_alvo, dna_resumo, dna_completo, plano, rate_limit_diario, auto_pilot } = req.body || {};
  if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatorios' });
  try {
    db.prepare(`
      INSERT INTO clientes (slug, nome, email_contato, whatsapp_contato, nicho_alvo, dna_resumo, dna_completo, plano, rate_limit_diario, auto_pilot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(slug, nome, email_contato || null, whatsapp_contato || null, nicho_alvo || null,
      dna_resumo || null, dna_completo || null, plano || 'trial', rate_limit_diario || 50, auto_pilot ? 1 : 0);
    res.json({ success: true, slug });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/clientes/:slug', (req, res) => {
  const updates = req.body || {};
  const cols = ['nome','email_contato','whatsapp_contato','auto_pilot','nicho_alvo','dna_resumo','dna_completo','plano','cobranca_status','rate_limit_diario'];
  const sets = [], vals = [];
  for (const c of cols) if (c in updates) { sets.push(`${c} = ?`); vals.push(updates[c]); }
  if (!sets.length) return res.status(400).json({ error: 'nada a atualizar' });
  vals.push(req.params.slug);
  db.prepare(`UPDATE clientes SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`).run(...vals);
  res.json({ success: true });
});

// ============================================================
// WEBHOOKS — Resend (abertura, clique, bounce, delivered)
// ============================================================
app.post('/webhook/resend', express.json({ limit: '500kb' }), (req, res) => {
  const evento = req.body || {};
  const tipo = evento.type; // ex: 'email.opened', 'email.clicked', 'email.bounced'
  const leadId = evento.data?.headers?.find(h => h.name === 'X-Lead-Id')?.value;

  db.prepare(`
    INSERT INTO eventos (tipo, origem, payload, agente_responsavel)
    VALUES (?, 'resend', ?, NULL)
  `).run(tipo || 'resend.unknown', JSON.stringify(evento).slice(0, 5000));

  if (leadId) {
    const lid = parseInt(leadId, 10);
    if (tipo === 'email.opened') {
      db.prepare(`UPDATE conversas SET abertura = 1 WHERE lead_id = ? AND canal = 'email' AND direcao = 'enviada' ORDER BY timestamp DESC LIMIT 1`).run(lid);
    } else if (tipo === 'email.clicked') {
      db.prepare(`UPDATE conversas SET clique = 1 WHERE lead_id = ? AND canal = 'email' AND direcao = 'enviada' ORDER BY timestamp DESC LIMIT 1`).run(lid);
    } else if (tipo === 'email.bounced') {
      db.prepare(`UPDATE leads SET status = 'descartado' WHERE id = ?`).run(lid);
    }
  }
  res.json({ ok: true });
});

// Webhook não precisa de auth (mas precisa estar antes do basicAuth.use no app)
// Como ele já tá protegido por basicAuth porque /webhook não é whitelistado... Vou abrir:

// ============================================================
// VERIFICADOR DE EMAIL — regex + DNS MX (sem chave paga)
// ============================================================
const dns = require('dns').promises;
app.get('/api/verificar-email/:email', async (req, res) => {
  const email = req.params.email;
  const regex = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
  const m = email.match(regex);
  if (!m) return res.json({ valido: false, motivo: 'formato_invalido' });
  try {
    const mx = await dns.resolveMx(m[1]);
    const tem = Array.isArray(mx) && mx.length > 0;
    res.json({ valido: tem, mx_count: mx.length, dominio: m[1] });
  } catch (e) {
    res.json({ valido: false, motivo: 'sem_mx', erro: e.code });
  }
});

// ============================================================
// ANALYTICS — funil real
// ============================================================
app.get('/api/analytics/funil', (req, res) => {
  const cliente = req.query.cliente_slug;
  const where = cliente ? 'WHERE cliente_slug = ?' : '';
  const params = cliente ? [cliente] : [];

  const total = db.prepare(`SELECT COUNT(*) AS c FROM leads ${where}`).get(...params).c;
  const porStatus = db.prepare(`SELECT status, COUNT(*) AS c FROM leads ${where} GROUP BY status`).all(...params);
  const porNicho = db.prepare(`SELECT nicho, COUNT(*) AS c FROM leads ${where} GROUP BY nicho`).all(...params);
  const respondidos = db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE status IN ('respondeu','qualificado','reuniao','cliente') ${cliente ? 'AND cliente_slug = ?' : ''}`).get(...params).c;
  const contatados = db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE status IN ('contatado','respondeu','qualificado','reuniao','cliente') ${cliente ? 'AND cliente_slug = ?' : ''}`).get(...params).c;
  const taxaResposta = contatados > 0 ? (respondidos / contatados * 100).toFixed(2) : 0;

  res.json({
    total, por_status: porStatus, por_nicho: porNicho,
    taxa_resposta_pct: taxaResposta,
    respondidos, contatados,
  });
});

app.get('/api/analytics/canal', (req, res) => {
  const stats = db.prepare(`
    SELECT canal,
      COUNT(*) AS total,
      SUM(CASE WHEN direcao='enviada' THEN 1 ELSE 0 END) AS enviadas,
      SUM(CASE WHEN direcao='recebida' THEN 1 ELSE 0 END) AS recebidas,
      SUM(abertura) AS aberturas,
      SUM(clique) AS cliques
    FROM conversas
    WHERE timestamp > datetime('now', '-30 days')
    GROUP BY canal
  `).all();
  res.json({ por_canal: stats });
});

app.get('/api/analytics/agentes', (req, res) => {
  const stats = db.prepare(`
    SELECT agente, COUNT(*) AS runs, SUM(CASE WHEN status='sucesso' THEN 1 ELSE 0 END) AS sucessos,
      SUM(CASE WHEN status='erro' THEN 1 ELSE 0 END) AS erros,
      AVG(duracao_ms) AS duracao_media_ms
    FROM runs WHERE inicio > datetime('now', '-7 days')
    GROUP BY agente
  `).all();
  res.json({ por_agente: stats });
});

// ============================================================
// FOLLOWUPS — visualização da agenda
// ============================================================
app.get('/api/followups', (req, res) => {
  const status = req.query.status || 'pendente';
  res.json({
    followups: db.prepare(`
      SELECT f.*, l.razao_social, l.email
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      WHERE f.status = ?
      ORDER BY f.agendado_para ASC LIMIT 200
    `).all(status),
  });
});

// ============================================================
// CLAUDE MAX BRIDGE — fila de tarefas pro worker local processar
// Worker (scripts/worker-claude.js) roda na máquina do Levi com Claude Code,
// pesca tarefa pendente, processa, devolve resultado.
// ============================================================

// Workers buscam próximas tarefas pendentes (pega lock atomico)
app.get('/api/ia/proxima', (req, res) => {
  const workerId = req.query.worker_id || 'unknown';
  const tipos = req.query.tipos ? req.query.tipos.split(',') : null;

  // Atomic SELECT + UPDATE — pega 1 tarefa pendente e marca processando
  const candidato = tipos
    ? db.prepare(`SELECT * FROM tarefas_ia WHERE status = 'pendente' AND tipo IN (${tipos.map(() => '?').join(',')})
                  ORDER BY prioridade ASC, created_at ASC LIMIT 1`).get(...tipos)
    : db.prepare(`SELECT * FROM tarefas_ia WHERE status = 'pendente'
                  ORDER BY prioridade ASC, created_at ASC LIMIT 1`).get();

  if (!candidato) return res.json({ tarefa: null });

  db.prepare(`
    UPDATE tarefas_ia SET status='processando', worker_id=?, pego_em=CURRENT_TIMESTAMP
    WHERE id = ? AND status='pendente'
  `).run(workerId, candidato.id);

  res.json({ tarefa: candidato });
});

// Worker devolve resultado
app.post('/api/ia/:id/concluir', (req, res) => {
  const { resultado, tokens_usados, duracao_ms } = req.body || {};
  if (!resultado) return res.status(400).json({ error: 'resultado obrigatorio' });

  const tarefa = db.prepare('SELECT * FROM tarefas_ia WHERE id = ?').get(req.params.id);
  if (!tarefa) return res.status(404).json({ error: 'tarefa nao encontrada' });

  db.prepare(`
    UPDATE tarefas_ia SET
      status='concluida', resultado=?, tokens_usados=?, duracao_ms=?,
      concluido_em=CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(resultado, tokens_usados || null, duracao_ms || null, req.params.id);

  // Dispara callback agente se configurado
  if (tarefa.callback_agente) {
    const agentFile = path.join(__dirname, 'agents', `${tarefa.callback_agente}.js`);
    if (fs.existsSync(agentFile)) {
      try {
        const AgenteImpl = require(agentFile);
        const instance = new AgenteImpl(db);
        const payload = { tarefa_id: tarefa.id, resultado, ...JSON.parse(tarefa.callback_payload || '{}') };
        instance.run(payload, 'ia_callback').catch(e => console.error(`[ia_callback ${tarefa.callback_agente}]`, e.message));
      } catch (e) {
        console.error('[ia_callback]', e.message);
      }
    }
  }

  res.json({ success: true });
});

app.post('/api/ia/:id/falhar', (req, res) => {
  const { erro } = req.body || {};
  db.prepare(`
    UPDATE tarefas_ia SET status='falhou', erro=?, concluido_em=CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(erro || 'erro nao informado', req.params.id);
  res.json({ success: true });
});

// Lista tarefas (UI)
app.get('/api/ia', (req, res) => {
  const status = req.query.status;
  const sql = status
    ? `SELECT * FROM tarefas_ia WHERE status = ? ORDER BY created_at DESC LIMIT 100`
    : `SELECT * FROM tarefas_ia ORDER BY created_at DESC LIMIT 100`;
  const tarefas = status ? db.prepare(sql).all(status) : db.prepare(sql).all();

  // Stats
  const stats = db.prepare(`
    SELECT status, COUNT(*) AS c FROM tarefas_ia GROUP BY status
  `).all();

  res.json({ tarefas, stats });
});

// Admin pode criar tarefa manual (pra testar)
app.post('/api/ia', (req, res) => {
  const { tipo, prompt, contexto, prioridade, callback_agente, callback_payload } = req.body || {};
  if (!tipo || !prompt) return res.status(400).json({ error: 'tipo e prompt obrigatorios' });

  const r = db.prepare(`
    INSERT INTO tarefas_ia (tipo, prompt, contexto, prioridade, agente_origem, callback_agente, callback_payload, expires_at)
    VALUES (?, ?, ?, ?, 'admin_manual', ?, ?, datetime('now', '+24 hours'))
  `).run(
    tipo, prompt,
    contexto ? JSON.stringify(contexto) : null,
    prioridade || 5,
    callback_agente || null,
    callback_payload ? JSON.stringify(callback_payload) : null,
  );

  res.json({ success: true, id: r.lastInsertRowid });
});

// ============================================================
// POSTS / ROTEIROS / IDEIAS — endpoints de leitura
// ============================================================
app.get('/api/posts', (req, res) => {
  const status = req.query.status;
  const sql = status
    ? `SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC LIMIT 100`
    : `SELECT * FROM posts ORDER BY created_at DESC LIMIT 100`;
  res.json({ posts: status ? db.prepare(sql).all(status) : db.prepare(sql).all() });
});

app.post('/api/posts/:id/aprovar', (req, res) => {
  db.prepare(`UPDATE posts SET status='aprovado', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

app.post('/api/posts/:id/rejeitar', (req, res) => {
  db.prepare(`UPDATE posts SET status='rejeitado', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

app.get('/api/roteiros', (req, res) => {
  res.json({ roteiros: db.prepare(`SELECT * FROM roteiros ORDER BY created_at DESC LIMIT 100`).all() });
});

app.get('/api/ideias', (req, res) => {
  const status = req.query.status;
  const sql = status
    ? `SELECT * FROM ideias WHERE status = ? ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM ideias ORDER BY created_at DESC LIMIT 200`;
  res.json({ ideias: status ? db.prepare(sql).all(status) : db.prepare(sql).all() });
});

app.post('/api/ideias', (req, res) => {
  const { titulo, descricao, fonte, conteudo_raw, tags } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'titulo obrigatorio' });
  const r = db.prepare(`
    INSERT INTO ideias (titulo, descricao, fonte, conteudo_raw, tags)
    VALUES (?, ?, ?, ?, ?)
  `).run(titulo, descricao || null, fonte || 'manual', conteudo_raw || null, tags ? JSON.stringify(tags) : null);
  res.json({ success: true, id: r.lastInsertRowid });
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
// EVENT WORKER — consome tabela eventos em loop curto (10s)
// Reage em tempo quase real a lead_novo, lead_respondeu, etc.
// ============================================================
let eventWorkerInstance = null;
try {
  const startEventWorker = require('./agents/event_worker');
  eventWorkerInstance = startEventWorker(db);
} catch (e) {
  console.error('[boot] event_worker falhou:', e.message);
}

// ============================================================
// NOTIFICACOES — Cortex alertas internos
// ============================================================
app.get('/api/notif', (req, res) => {
  const filtro = req.query.lida === '0' ? 'WHERE lida = 0' : '';
  const notifs = db.prepare(`
    SELECT * FROM notificacoes ${filtro} ORDER BY created_at DESC LIMIT 100
  `).all();
  const naoLidas = db.prepare(`SELECT COUNT(*) AS c FROM notificacoes WHERE lida = 0`).get().c;
  res.json({ notificacoes: notifs, nao_lidas: naoLidas });
});

app.post('/api/notif/:id/ler', (req, res) => {
  db.prepare(`UPDATE notificacoes SET lida = 1, lida_em = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

app.post('/api/notif/marcar-todas-lidas', (req, res) => {
  const r = db.prepare(`UPDATE notificacoes SET lida = 1, lida_em = CURRENT_TIMESTAMP WHERE lida = 0`).run();
  res.json({ success: true, marcadas: r.changes });
});

// ============================================================
// OPT-OUTS (LGPD)
// ============================================================
app.get('/api/opt-outs', (req, res) => {
  res.json({ opt_outs: db.prepare(`SELECT * FROM opt_outs ORDER BY created_at DESC LIMIT 200`).all() });
});

app.post('/api/opt-outs', (req, res) => {
  const { cnpj, email, whatsapp, motivo, origem } = req.body || {};
  if (!cnpj && !email && !whatsapp) return res.status(400).json({ error: 'pelo menos um identificador obrigatorio' });
  const r = db.prepare(`
    INSERT INTO opt_outs (cnpj, email, whatsapp, motivo, origem)
    VALUES (?, ?, ?, ?, ?)
  `).run(cnpj || null, email || null, whatsapp || null, motivo || null, origem || 'admin_manual');

  // Cancela followups pendentes desse lead
  if (cnpj) {
    db.prepare(`
      UPDATE followups SET status = 'cancelado' WHERE lead_id IN (SELECT id FROM leads WHERE cnpj = ?)
    `).run(cnpj);
  }
  res.json({ success: true, id: r.lastInsertRowid });
});

// Endpoint público (sem auth) pra lead se descadastrar via link no email
app.get('/opt-out/:token', (req, res) => {
  // Token simples: base64 do email — substituir por JWT em produção
  let email;
  try { email = Buffer.from(req.params.token, 'base64').toString('utf-8'); } catch { return res.status(400).send('Token inválido'); }
  if (!email.includes('@')) return res.status(400).send('Token inválido');

  db.prepare(`
    INSERT INTO opt_outs (email, motivo, origem)
    VALUES (?, 'lead pediu via link', 'lead_pediu')
  `).run(email);
  db.prepare(`
    UPDATE followups SET status = 'cancelado' WHERE lead_id IN (SELECT id FROM leads WHERE email = ?)
  `).run(email);

  res.send(`
    <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Descadastrado</title>
    <style>body{font-family:system-ui;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{text-align:center;padding:40px;border:1px solid #D4AF37;border-radius:8px;max-width:480px}
    h1{color:#D4AF37;font-weight:900;letter-spacing:-0.03em}</style></head>
    <body><div class="box"><h1>Descadastrado.</h1>
    <p>Não vamos mais te enviar nada. Se foi engano, manda email pra levi@l2automation.com.br.</p></div></body></html>
  `);
});

// ============================================================
// LEADS — detalhe + histórico conversas
// ============================================================
app.get('/api/leads/:id', (req, res) => {
  const lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'nao encontrado' });
  const conversas = db.prepare(`SELECT * FROM conversas WHERE lead_id = ? ORDER BY timestamp ASC`).all(req.params.id);
  const followups = db.prepare(`SELECT * FROM followups WHERE lead_id = ? ORDER BY agendado_para ASC`).all(req.params.id);
  const aprovacoes = db.prepare(`SELECT * FROM aprovacoes WHERE lead_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ lead, conversas, followups, aprovacoes });
});

// Exportar leads como CSV
app.get('/api/leads/export.csv', (req, res) => {
  const { status, nicho, uf, score_min } = req.query;
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (nicho) { sql += ' AND nicho = ?'; params.push(nicho); }
  if (uf) { sql += ' AND uf = ?'; params.push(uf); }
  if (score_min) { sql += ' AND score >= ?'; params.push(Number(score_min)); }
  sql += ' ORDER BY data_coleta DESC LIMIT 5000';

  const leads = db.prepare(sql).all(...params);
  const cols = ['id','cnpj','razao_social','nome_fantasia','email','telefone','cidade','uf','cnae_principal','porte','capital_social','score','status','nicho','data_coleta'];
  const esc = v => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...leads.map(l => cols.map(c => esc(l[c])).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-l2-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('﻿' + csv); // BOM pra Excel abrir UTF-8 certo
});

// Importar leads via CSV/texto (1 CNPJ por linha, OU CSV com header cnpj,razao_social,email)
app.post('/api/leads/import', (req, res) => {
  const { csv, dispatch_prospector = false } = req.body || {};
  if (!csv) return res.status(400).json({ error: 'csv obrigatorio' });

  const linhas = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const stats = { lidas: 0, novos: 0, ja_existiam: 0, invalidos: 0 };

  // Detecta se primeira linha é header
  const header = linhas[0].toLowerCase();
  const temHeader = header.includes('cnpj') || header.includes('razao');
  const rows = temHeader ? linhas.slice(1) : linhas;

  // Detecta separador
  const sep = rows[0]?.includes(';') ? ';' : rows[0]?.includes(',') ? ',' : null;

  for (const linha of rows) {
    stats.lidas++;
    const cols = sep ? linha.split(sep).map(c => c.replace(/^"|"$/g, '').trim()) : [linha];
    const cnpj = (cols[0] || '').replace(/\D/g, '');
    if (cnpj.length !== 14) { stats.invalidos++; continue; }

    const exists = db.prepare('SELECT id FROM leads WHERE cnpj = ?').get(cnpj);
    if (exists) { stats.ja_existiam++; continue; }

    const lead = {
      cnpj,
      razao_social: cols[1] || null,
      email: cols[2] || null,
      telefone: cols[3] || null,
      origem: 'csv_import',
      status: 'novo',
    };

    db.prepare(`
      INSERT INTO leads (cnpj, razao_social, email, telefone, origem, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(lead.cnpj, lead.razao_social, lead.email, lead.telefone, lead.origem, lead.status);
    stats.novos++;
  }

  // Dispara prospector automaticamente pra enriquecer os novos
  if (dispatch_prospector && stats.novos > 0) {
    const novosCnpjs = db.prepare(`
      SELECT cnpj FROM leads WHERE origem = 'csv_import' AND data_coleta > datetime('now', '-1 minute')
    `).all().map(r => r.cnpj);
    try {
      const Prospector = require('./agents/prospector');
      const p = new Prospector(db);
      p.run({ cnpjs: novosCnpjs }, 'csv_import').catch(e => console.error('[csv->prospector]', e.message));
      stats.prospector_disparado = novosCnpjs.length;
    } catch (e) { /* ignore */ }
  }

  res.json(stats);
});

// Lista leads com mais filtros
app.get('/api/leads-full', (req, res) => {
  const { status, nicho, score_min, uf, q, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (nicho) { sql += ' AND nicho = ?'; params.push(nicho); }
  if (uf) { sql += ' AND uf = ?'; params.push(uf); }
  if (score_min) { sql += ' AND score >= ?'; params.push(Number(score_min)); }
  if (q) { sql += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
    const like = `%${q}%`; params.push(like, like, like); }
  sql += ' ORDER BY score DESC NULLS LAST, data_coleta DESC LIMIT ? OFFSET ?';
  params.push(Math.min(Number(limit) || 50, 500), Number(offset) || 0);
  res.json({ leads: db.prepare(sql).all(...params) });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`[L2 Automation] rodando em http://localhost:${PORT}`);
  console.log(`[L2 Automation] DB: ${DB_PATH}`);
  console.log(`[L2 Automation] admin: http://localhost:${PORT}/`);
});
