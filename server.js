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

// Alias amigável /admin/inbox -> inbox.html (precisa estar ANTES do SPA fallback)
app.get('/admin/inbox', (req, res) => res.sendFile(path.join(__dirname, 'inbox.html')));

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
  'sitemap.xml', 'robots.txt', 'logo.svg', 'inbox.html',
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
