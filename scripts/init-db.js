// Inicializa o SQLite com schema + agentes pré-cadastrados.
// Pode ser chamado de duas formas:
//   - CLI: `node scripts/init-db.js` (abre/fecha própria conexão)
//   - Inline: `require('./scripts/init-db.js').seed(db)` (usa conexão existente)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/l2.db';
const SCHEMA_PATH = path.join(__dirname, '../db/schema.sql');

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
];

function seed(db) {
  const upsert = db.prepare(`
    INSERT INTO agentes (nome, label, descricao, status, cron_expr, cron_ativo)
    VALUES (@nome, @label, @descricao, 'aguardando', @cron_expr, @cron_ativo)
    ON CONFLICT(nome) DO UPDATE SET
      label = excluded.label,
      descricao = excluded.descricao,
      cron_expr = excluded.cron_expr,
      cron_ativo = excluded.cron_ativo,
      updated_at = CURRENT_TIMESTAMP
  `);
  for (const ag of AGENTES_BASE) upsert.run(ag);
  console.log(`[init-db] ${AGENTES_BASE.length} agentes registrados/atualizados`);
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
