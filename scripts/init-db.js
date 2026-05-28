// Inicializa o SQLite com schema + agentes pré-cadastrados.
// Pode ser chamado de duas formas:
//   - CLI: `node scripts/init-db.js` (abre/fecha própria conexão)
//   - Inline: `require('./scripts/init-db.js').seed(db)` (usa conexão existente)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/l2.db';
const SCHEMA_PATH = path.join(__dirname, '../db/schema.sql');

// Cliente default (L2 vendendo pra si própria)
const CLIENTES_BASE = [
  {
    slug: 'l2-automation',
    nome: 'L2 Automation',
    email_contato: 'levi@l2automation.com.br',
    auto_pilot: 0, // por segurança, começa OFF (toda msg vai pra aprovação)
    nicho_alvo: 'imobiliaria',
    dna_resumo: 'L2 Automation — sistema autônomo de prospecção e venda B2B. Substitui SDR caro por agentes IA que rodam 24/7.',
    plano: 'enterprise',
    rate_limit_diario: 100,
  },
];

// Personas por nicho (copy switcher)
const PERSONAS_BASE = [
  {
    nicho: 'imobiliaria',
    label: 'Imobiliária / Corretor',
    dor_principal: 'depender de captação ativa via WhatsApp e Instagram pra fechar venda',
    ganho_prometido: 'fluxo previsível de leads quentes qualificados sem precisar de SDR humano',
    tom: 'executivo direto, fala em volume de leads e ROI',
    abertura_template: 'Vi que a {razao} atua em {cidade} — quantos leads vocês recebem por mês hoje?',
  },
  {
    nicho: 'saude',
    label: 'Clínica / Consultório',
    dor_principal: 'agenda com buracos e dependência de indicação boca-a-boca',
    ganho_prometido: 'agenda cheia e previsível com pacientes do perfil certo',
    tom: 'consultivo, foco em qualidade de paciente não só volume',
    abertura_template: 'Como vocês de {razao} estão recebendo pacientes novos hoje?',
  },
  {
    nicho: 'advocacia',
    label: 'Escritório de Advocacia',
    dor_principal: 'dependência de indicação e dificuldade de prospectar sem parecer antiético',
    ganho_prometido: 'fluxo ético e previsível de clientes corporativos no perfil',
    tom: 'sóbrio, técnico, sem sensacionalismo',
    abertura_template: '{razao} — vocês prospectam ativamente ou trabalham só por indicação hoje?',
  },
  {
    nicho: 'consultoria',
    label: 'Consultoria',
    dor_principal: 'ciclo longo de venda e dificuldade de prospectar decisores C-level',
    ganho_prometido: 'pipeline com decisores C-level qualificados',
    tom: 'estratégico, fala em transformação de negócio',
    abertura_template: 'Como a {razao} prospecta novos contratos hoje?',
  },
];

// Nicho alvo de exemplo pra L2 (imobiliárias EPP no RS/SC)
const NICHOS_ALVO_BASE = [
  {
    cliente_slug: 'l2-automation',
    nome: 'Imobiliárias SUL — EPP/ME',
    cnae_filtros: JSON.stringify(['6810', '6822']),
    uf_filtros: JSON.stringify(['RS', 'SC', 'PR']),
    porte_filtros: JSON.stringify(['EPP', 'ME', 'DEMAIS']),
    capital_min: 50000,
    cnaes_excluir: null,
  },
];

// Agentes do sistema L2 (definição declarativa)
const AGENTES_BASE = [
  {
    nome: 'maestro',
    label: 'Maestro',
    descricao: 'Orquestra os outros agentes. Decide quem roda e quando baseado em estado e eventos.',
    cron_expr: '*/5 * * * *', // a cada 5 min: checa eventos + dispara ciclos
    cron_ativo: 1,
  },
  {
    nome: 'prospector',
    label: 'Prospector',
    descricao: 'Busca empresas (CNPJs) por nicho/região em fontes públicas. Salva leads novos.',
    cron_expr: '0 9 * * *', // 9h da manhã
    cron_ativo: 1,
  },
  {
    nome: 'enricher',
    label: 'Enricher',
    descricao: 'Completa dados dos leads: email decisor, LinkedIn, telefone, site.',
    cron_expr: '0 10 * * *', // 10h
    cron_ativo: 1,
  },
  {
    nome: 'outbound_linkedin',
    label: 'Outbound LinkedIn',
    descricao: 'Envia primeira mensagem personalizada via LinkedIn (Playwright).',
    cron_expr: '0 14 * * 1-5', // 14h seg-sex
    cron_ativo: 0, // desativado por padrão até implementar Playwright
  },
  {
    nome: 'outbound_email',
    label: 'Outbound Email',
    descricao: 'Envia email personalizado pra leads enriquecidos. Trackeia abertura.',
    cron_expr: '0 11 * * 1-5',
    cron_ativo: 1, // dry-run até RESEND_API_KEY configurado
  },
  {
    nome: 'sdr_neural',
    label: 'SDR Neural',
    descricao: 'Responde mensagens recebidas. Qualifica BANT. Encaminha quentes pro humano.',
    cron_expr: '*/30 * * * *', // check follow-ups a cada 30min
    cron_ativo: 1,
  },
  {
    nome: 'analytics',
    label: 'Analytics',
    descricao: 'Calcula métricas do funil. Detecta anomalias. Gera relatório semanal.',
    cron_expr: '0 * * * *', // hora em hora
    cron_ativo: 1,
  },
  {
    nome: 'self_debugger',
    label: 'Self Debugger',
    descricao: 'Lê logs de erro, analisa com IA, aplica fix automático ou escala pro humano.',
    cron_expr: '*/15 * * * *', // 15 min
    cron_ativo: 1,
  },
  {
    nome: 'cnpj_finder',
    label: 'CNPJ Finder',
    descricao: 'Busca CNPJs novos por filtros ICP (CNAE+UF+porte) via Casa dos Dados.',
    cron_expr: '0 8 * * 1-5', // 8h dia útil, antes do prospector
    cron_ativo: 1,
  },
  {
    nome: 'copywriter',
    label: 'Copywriter',
    descricao: 'Gera copy personalizada por lead usando persona + Cerebro de Persuasao.',
    cron_expr: null, // event-driven
    cron_ativo: 0,
  },
  {
    nome: 'backup',
    label: 'Backup',
    descricao: 'Hot-backup do SQLite diario com rotacao de 14 dias.',
    cron_expr: '0 3 * * *', // 3h da manha
    cron_ativo: 1,
  },
];

function seed(db) {
  // Agentes
  const upsertAg = db.prepare(`
    INSERT INTO agentes (nome, label, descricao, status, cron_expr, cron_ativo)
    VALUES (@nome, @label, @descricao, 'aguardando', @cron_expr, @cron_ativo)
    ON CONFLICT(nome) DO UPDATE SET
      label = excluded.label,
      descricao = excluded.descricao,
      cron_expr = excluded.cron_expr,
      cron_ativo = excluded.cron_ativo,
      updated_at = CURRENT_TIMESTAMP
  `);
  for (const ag of AGENTES_BASE) upsertAg.run(ag);

  // Clientes (não sobrescreve auto_pilot/plano existente)
  const upsertCli = db.prepare(`
    INSERT INTO clientes (slug, nome, email_contato, auto_pilot, nicho_alvo, dna_resumo, plano, rate_limit_diario)
    VALUES (@slug, @nome, @email_contato, @auto_pilot, @nicho_alvo, @dna_resumo, @plano, @rate_limit_diario)
    ON CONFLICT(slug) DO NOTHING
  `);
  for (const c of CLIENTES_BASE) upsertCli.run(c);

  // Personas (sempre atualiza)
  const upsertP = db.prepare(`
    INSERT INTO personas (nicho, label, dor_principal, ganho_prometido, tom, abertura_template)
    VALUES (@nicho, @label, @dor_principal, @ganho_prometido, @tom, @abertura_template)
    ON CONFLICT(nicho) DO UPDATE SET
      label = excluded.label,
      dor_principal = excluded.dor_principal,
      ganho_prometido = excluded.ganho_prometido,
      tom = excluded.tom,
      abertura_template = excluded.abertura_template,
      updated_at = CURRENT_TIMESTAMP
  `);
  for (const p of PERSONAS_BASE) upsertP.run(p);

  // Nichos alvo — só insere se não existir nome igual pro mesmo cliente
  const insNa = db.prepare(`
    INSERT INTO nichos_alvo (cliente_slug, nome, cnae_filtros, uf_filtros, porte_filtros, capital_min, cnaes_excluir, ativo)
    SELECT @cliente_slug, @nome, @cnae_filtros, @uf_filtros, @porte_filtros, @capital_min, @cnaes_excluir, 1
    WHERE NOT EXISTS (SELECT 1 FROM nichos_alvo WHERE cliente_slug = @cliente_slug AND nome = @nome)
  `);
  for (const n of NICHOS_ALVO_BASE) insNa.run(n);

  console.log(`[init-db] seed OK — ${AGENTES_BASE.length} agentes, ${CLIENTES_BASE.length} clientes, ${PERSONAS_BASE.length} personas, ${NICHOS_ALVO_BASE.length} nichos alvo`);
}

module.exports = { seed, AGENTES_BASE };

// CLI mode — abre/fecha própria conexão
if (require.main === module) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  console.log('[init-db] Schema aplicado em', DB_PATH);
  seed(db);
  db.close();
  console.log('[init-db] OK');
}
