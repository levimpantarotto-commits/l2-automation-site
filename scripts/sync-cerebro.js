// Sincroniza o Cerebro de Persuasao do vault Obsidian -> backend L2 via API.
// Rodar LOCAL na maquina do Levi (precisa ter acesso ao vault).
// Nao vai pro container — so existe como ferramenta de upload.
//
// Uso:
//   node scripts/sync-cerebro.js
//   ou
//   node scripts/sync-cerebro.js --url https://app.l2automation.com.br
//
// Usa BASIC_AUTH do .env (ou env vars).
//
// CUIDADO: este script LE arquivos do vault e MANDA pra API. Conteudo IP do Levi
// fica no volume /data do Coolify (privado). NUNCA commitar este conteudo no git.

const fs = require('fs');
const path = require('path');

// Mini parser de .env (evita dep externa)
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
})();

const VAULT_DEFAULT = 'C:\\Users\\55119\\Documents\\Levi\\Milhonario\\Mente Milhonaria\\90_Workspace_IA\\Cerebro_Persuasao';
const VAULT_DIR = process.env.CEREBRO_VAULT || VAULT_DEFAULT;
const API_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : (process.env.L2_API_URL || 'https://app.l2automation.com.br');
const AUTH_USER = process.env.BASIC_AUTH_USER || 'admin';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || 'troqueme';

if (!fs.existsSync(VAULT_DIR)) {
  console.error(`Vault nao encontrado: ${VAULT_DIR}`);
  console.error('Configure CEREBRO_VAULT no .env ou passe outro caminho.');
  process.exit(1);
}

async function main() {
  const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.md'));
  console.log(`Encontrados ${files.length} arquivos em ${VAULT_DIR}`);

  let ok = 0, falha = 0;
  for (const f of files) {
    const conteudo = fs.readFileSync(path.join(VAULT_DIR, f), 'utf-8');
    const slug = f.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const titulo = f.replace(/\.md$/, '').replace(/_/g, ' ');

    // Resumo curto = primeiras 1500 chars sem frontmatter
    const semFM = conteudo.replace(/^---[\s\S]*?---\n/, '').trim();
    const resumo = semFM.slice(0, 1500);

    try {
      const res = await fetch(`${API_URL}/api/cerebro/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64'),
        },
        body: JSON.stringify({
          slug, titulo,
          fonte: slug.includes('kahneman') ? 'livro' : slug.includes('damasio') ? 'livro' : slug.includes('sobral') ? 'video' : 'misto',
          conteudo_md: conteudo,
          resumo_curto: resumo,
          tags: ['persuasao', 'copy', 'cerebro'],
        }),
      });
      if (res.ok) { console.log(`  OK  ${slug}`); ok++; }
      else { console.error(`  FAIL ${slug}: ${res.status} ${await res.text()}`); falha++; }
    } catch (e) {
      console.error(`  FAIL ${slug}: ${e.message}`); falha++;
    }
  }

  console.log(`\n${ok}/${files.length} sincronizados. ${falha} falhas.`);
}

main().catch(e => { console.error(e); process.exit(1); });
