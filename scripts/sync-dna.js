// Sincroniza DNA de clientes do vault Obsidian -> backend L2 via API.
// Le os Hubs (LMP_Social_Engine_Hub.md, Igor_Babolin.md, Charles_Nobre.md)
// e popula clientes.dna_completo. Tambem pode criar cliente se nao existir.
//
// Uso:
//   node scripts/sync-dna.js
//   node scripts/sync-dna.js --url https://app.l2automation.com.br
//
// Vault: C:\Users\55119\Documents\Levi\Milhonario\Mente Milhonaria\90_Workspace_IA\Claude_Cerebro

const fs = require('fs');
const path = require('path');

(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
})();

const VAULT_DEFAULT = 'C:\\Users\\55119\\Documents\\Levi\\Milhonario\\Mente Milhonaria\\90_Workspace_IA\\Claude_Cerebro';
const VAULT_DIR = process.env.VAULT_CLAUDE_CEREBRO || VAULT_DEFAULT;
const API_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : (process.env.L2_API_URL || 'https://app.l2automation.com.br');
const AUTH_USER = process.env.BASIC_AUTH_USER || 'admin';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || 'troqueme';

// Mapeamento Hub.md -> {slug, nome, nicho_alvo} default
const MAPA = [
  { arquivo: 'LMP_Social_Engine_Hub.md', slug: 'lmp', nome: 'LMP Social Engine', nicho_alvo: 'consultoria' },
  { arquivo: 'Igor_Babolin.md', slug: 'igor', nome: 'Igor Babolin · Domare Imóveis', nicho_alvo: 'imobiliaria' },
  { arquivo: 'Charles_Nobre.md', slug: 'charles', nome: 'Charles Nobre', nicho_alvo: 'consultoria' },
];

if (!fs.existsSync(VAULT_DIR)) {
  console.error(`Vault nao encontrado: ${VAULT_DIR}`);
  process.exit(1);
}

async function buscarRecursivo(dir, nome) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const found = await buscarRecursivo(full, nome);
      if (found) return found;
    } else if (f === nome) return full;
  }
  return null;
}

function resumir(md, max = 800) {
  // Tira frontmatter e pega primeiras N chars
  return md.replace(/^---[\s\S]*?---\n/, '').trim().slice(0, max);
}

async function authFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      'Authorization': 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64'),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function main() {
  console.log(`Buscando hubs em ${VAULT_DIR}`);
  let ok = 0, fail = 0;

  for (const m of MAPA) {
    const arquivo = await buscarRecursivo(VAULT_DIR, m.arquivo);
    if (!arquivo) { console.log(`  SKIP ${m.arquivo} (nao encontrado)`); continue; }
    const conteudo = fs.readFileSync(arquivo, 'utf-8');
    const resumo = resumir(conteudo, 800);

    // Verifica se cliente existe
    const cli = await authFetch(`${API_URL}/api/clientes/${m.slug}`).then(r => r.ok ? r.json() : null);

    if (!cli || !cli.cliente?.slug) {
      // Cria
      const r = await authFetch(`${API_URL}/api/clientes`, {
        method: 'POST',
        body: JSON.stringify({
          slug: m.slug, nome: m.nome, nicho_alvo: m.nicho_alvo,
          dna_resumo: resumo,
          dna_completo: conteudo.slice(0, 200000),
          plano: 'enterprise', rate_limit_diario: 50,
        }),
      });
      if (r.ok) { console.log(`  CRIOU ${m.slug}`); ok++; }
      else { console.error(`  FAIL criar ${m.slug}: ${r.status}`); fail++; }
    } else {
      // Atualiza dna
      const r = await authFetch(`${API_URL}/api/clientes/${m.slug}`, {
        method: 'PUT',
        body: JSON.stringify({
          dna_resumo: resumo,
          dna_completo: conteudo.slice(0, 200000),
        }),
      });
      if (r.ok) { console.log(`  ATUALIZOU dna ${m.slug}`); ok++; }
      else { console.error(`  FAIL atualizar ${m.slug}: ${r.status}`); fail++; }
    }
  }

  console.log(`\n${ok} OK · ${fail} falhas`);
}

main().catch(e => { console.error(e); process.exit(1); });
