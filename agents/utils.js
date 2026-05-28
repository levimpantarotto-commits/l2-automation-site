// Helpers compartilhados entre agentes: BANT scoring, ICP filter, dedup, rate-limit.

// ============================================================
// BANT SCORING — pontuação 0-100 (Budget+Authority+Need+Timeline)
// Cada dimensão 0-25. Usa dados do BrasilAPI + heurísticas por nicho.
// ============================================================
function bantScore(lead, persona = null) {
  const detalhe = { porque: [] };

  // BUDGET (capital social + porte)
  let budget = 0;
  const cap = Number(lead.capital_social) || 0;
  if (cap > 1_000_000) { budget = 25; detalhe.porque.push('capital_social > 1M'); }
  else if (cap > 100_000) { budget = 18; detalhe.porque.push('capital_social > 100k'); }
  else if (cap > 10_000) { budget = 10; detalhe.porque.push('capital_social > 10k'); }
  else if (cap > 0) { budget = 5; detalhe.porque.push('capital pequeno'); }
  if (lead.porte === 'DEMAIS') budget = Math.min(25, budget + 5);
  if (lead.porte === 'MEI') budget = Math.max(0, budget - 5);

  // AUTHORITY — sócios cadastrados são decisores
  let authority = 0;
  try {
    const meta = lead.metadata ? JSON.parse(lead.metadata) : {};
    const numSocios = (meta.socios || []).length;
    if (numSocios === 1) { authority = 25; detalhe.porque.push('1 sócio (decisor único)'); }
    else if (numSocios <= 3) { authority = 20; detalhe.porque.push('2-3 sócios'); }
    else if (numSocios > 3) { authority = 12; detalhe.porque.push('muitos sócios (comitê)'); }
    if (lead.email_decision_maker) { authority = Math.min(25, authority + 5); }
  } catch (_) {}

  // NEED — match com persona/nicho (dor mapeada)
  let need = 0;
  if (lead.nicho && persona && persona.nicho === lead.nicho) {
    need = 22; detalhe.porque.push(`nicho ${lead.nicho} bate com persona`);
  } else if (lead.nicho) {
    need = 12;
  } else {
    need = 5;
  }

  // TIMELINE — recência (empresas abertas há pouco compram mais; outras muito antigas estagnadas)
  let timeline = 10;
  if (lead.data_abertura) {
    const anos = (Date.now() - new Date(lead.data_abertura).getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (anos < 2) { timeline = 20; detalhe.porque.push('aberta < 2 anos (em crescimento)'); }
    else if (anos < 8) { timeline = 18; detalhe.porque.push('2-8 anos (estabilizada, busca crescer)'); }
    else if (anos < 20) { timeline = 12; detalhe.porque.push('madura'); }
    else { timeline = 8; detalhe.porque.push('muito antiga (estagnada?)'); }
  }
  if (lead.status === 'respondeu') timeline = Math.min(25, timeline + 5);

  const total = budget + authority + need + timeline;
  return { total, budget, authority, need, timeline, detalhe: JSON.stringify(detalhe) };
}

// ============================================================
// ICP FILTER — checa se lead casa com algum nicho_alvo do cliente
// ============================================================
function passaICP(db, lead, clienteSlug = 'l2-automation') {
  const nichos = db.prepare(`
    SELECT * FROM nichos_alvo WHERE cliente_slug = ? AND ativo = 1
  `).all(clienteSlug);

  if (nichos.length === 0) return { passa: true, motivo: 'sem ICP cadastrado, passa default' };

  for (const n of nichos) {
    const cnaes = safeParse(n.cnae_filtros);
    const ufs = safeParse(n.uf_filtros);
    const portes = safeParse(n.porte_filtros);
    const cnaesExcluir = safeParse(n.cnaes_excluir);

    // CNAE exclusão tem prioridade
    if (cnaesExcluir.length && cnaesExcluir.some(c => String(lead.cnae_principal || '').startsWith(c.replace('%', '')))) {
      continue;
    }
    // CNAE inclusão
    if (cnaes.length && !cnaes.some(c => String(lead.cnae_principal || '').startsWith(c.replace('%', '')))) continue;
    // UF
    if (ufs.length && !ufs.includes(lead.uf)) continue;
    // Porte
    if (portes.length && !portes.includes(lead.porte)) continue;
    // Capital
    if (n.capital_min && Number(lead.capital_social) < n.capital_min) continue;
    if (n.capital_max && Number(lead.capital_social) > n.capital_max) continue;

    return { passa: true, nicho_alvo_id: n.id, nicho_nome: n.nome };
  }

  return { passa: false, motivo: 'não casa com nenhum nicho_alvo' };
}

function safeParse(s) {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

// ============================================================
// DEDUP — lead já contatado nos últimos N dias?
// ============================================================
function jaContatadoRecente(db, cnpj, dias = 90) {
  const row = db.prepare(`
    SELECT ultimo_outbound FROM leads WHERE cnpj = ?
  `).get(cnpj);
  if (!row || !row.ultimo_outbound) return false;
  const diff = (Date.now() - new Date(row.ultimo_outbound).getTime()) / (1000 * 60 * 60 * 24);
  return diff < dias;
}

// ============================================================
// RATE LIMIT — checa/incrementa contador por chave (janela de 24h)
// retorna { permitido, restante, limite }
// ============================================================
function checarRateLimit(db, chave, limite = 50) {
  const hoje = new Date().toISOString().slice(0, 10);
  const chaveDia = `${chave}:${hoje}`;

  const existing = db.prepare('SELECT contador FROM rate_limits WHERE chave = ?').get(chaveDia);
  const atual = existing ? existing.contador : 0;

  if (atual >= limite) {
    return { permitido: false, restante: 0, limite, atual };
  }

  return { permitido: true, restante: limite - atual, limite, atual };
}

function consumirRateLimit(db, chave, limite = 50) {
  const hoje = new Date().toISOString().slice(0, 10);
  const chaveDia = `${chave}:${hoje}`;
  const janelaFim = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  db.prepare(`
    INSERT INTO rate_limits (chave, contador, limite, janela_fim)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET contador = contador + 1
  `).run(chaveDia, limite, janelaFim);
}

// ============================================================
// FOLLOWUP SCHEDULER — agenda D+3, D+7, D+15
// ============================================================
function agendarFollowups(db, leadId, conversaId, canal) {
  const dias = [3, 7, 15];
  const stmt = db.prepare(`
    INSERT INTO followups (lead_id, conversa_id, agendado_para, tentativa, canal)
    VALUES (?, ?, datetime('now', '+' || ? || ' days'), ?, ?)
  `);
  dias.forEach((d, i) => stmt.run(leadId, conversaId, d, i + 1, canal));
}

// ============================================================
// CANCELAR FOLLOWUPS — quando lead responde, mata os pendentes
// ============================================================
function cancelarFollowupsPendentes(db, leadId) {
  return db.prepare(`
    UPDATE followups SET status = 'cancelado'
    WHERE lead_id = ? AND status = 'pendente'
  `).run(leadId);
}

// ============================================================
// OPT-OUT (LGPD) — lead pediu pra não receber mais
// ============================================================
function temOptOut(db, { cnpj, email, whatsapp }) {
  if (!cnpj && !email && !whatsapp) return false;
  const where = [];
  const vals = [];
  if (cnpj) { where.push('cnpj = ?'); vals.push(cnpj); }
  if (email) { where.push('email = ?'); vals.push(email); }
  if (whatsapp) { where.push('whatsapp = ?'); vals.push(whatsapp); }
  const row = db.prepare(`SELECT id FROM opt_outs WHERE ${where.join(' OR ')} LIMIT 1`).get(...vals);
  return !!row;
}

function registrarOptOut(db, dados) {
  return db.prepare(`
    INSERT INTO opt_outs (cnpj, email, whatsapp, motivo, origem)
    VALUES (?, ?, ?, ?, ?)
  `).run(dados.cnpj || null, dados.email || null, dados.whatsapp || null, dados.motivo || null, dados.origem || 'admin_manual');
}

// ============================================================
// NOTIFICAR (Cortex alertas internos)
// ============================================================
function notificar(db, { titulo, payload, criticidade = 'info' }) {
  try {
    db.prepare(`
      INSERT INTO notificacoes (titulo, payload, criticidade)
      VALUES (?, ?, ?)
    `).run(titulo, JSON.stringify(payload || {}), criticidade);
  } catch (e) {
    console.warn(`[notificar] falhou: ${e.message}`);
  }
}

module.exports = {
  bantScore,
  passaICP,
  jaContatadoRecente,
  checarRateLimit,
  consumirRateLimit,
  agendarFollowups,
  cancelarFollowupsPendentes,
  temOptOut,
  registrarOptOut,
  notificar,
  safeParse,
};
