// Drive Puller — script LOCAL que le pasta do Google Drive e empurra
// transcricoes/docs como "ideias" pro backend L2.
//
// Requer (no maquinario do Levi):
//   1. Conta de servico do Google Cloud OU OAuth user
//   2. Drive Folder ID compartilhado com a conta
//   3. Pacote googleapis: npm install googleapis -g  (ou local)
//
// Uso:
//   node scripts/drive-puller.js --folder-id 1abc...
//
// Polleia a pasta a cada 5min e sincroniza arquivos novos.

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

const API_URL = process.env.L2_API_URL || 'https://app.l2automation.com.br';
const AUTH_USER = process.env.BASIC_AUTH_USER || 'admin';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || 'troqueme';
const FOLDER_ID = process.argv.includes('--folder-id')
  ? process.argv[process.argv.indexOf('--folder-id') + 1]
  : process.env.DRIVE_FOLDER_ID;

const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || path.join(__dirname, '..', 'google-service-account.json');
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000', 10); // 5min

const authHeader = 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');

if (!FOLDER_ID) {
  console.error('FOLDER_ID obrigatório. Passe --folder-id <id> ou DRIVE_FOLDER_ID no .env');
  console.error('\nComo achar o folder id:');
  console.error('  1. Abra a pasta no Google Drive');
  console.error('  2. Olhe a URL: https://drive.google.com/drive/folders/<ID>');
  console.error('  3. Esse <ID> é o folder_id\n');
  process.exit(1);
}

if (!fs.existsSync(KEY_FILE)) {
  console.error(`Arquivo de credenciais Google Service Account não encontrado: ${KEY_FILE}`);
  console.error('\nComo gerar:');
  console.error('  1. Acesse https://console.cloud.google.com/iam-admin/serviceaccounts');
  console.error('  2. Crie conta de serviço, baixe JSON');
  console.error('  3. Salve como google-service-account.json na raiz do projeto L2');
  console.error('  4. Habilite Google Drive API no projeto');
  console.error('  5. Compartilhe a pasta do Drive com o EMAIL da conta de serviço (read access)\n');
  process.exit(1);
}

let google;
try {
  google = require('googleapis').google;
} catch {
  console.error('Pacote googleapis nao instalado.');
  console.error('Instale: npm install googleapis');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

console.log(`Drive Puller iniciado`);
console.log(`Folder: ${FOLDER_ID}`);
console.log(`Poll: ${POLL_MS / 1000}s\n`);

async function listarArquivos() {
  const r = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime, size)',
    pageSize: 100,
  });
  return r.data.files || [];
}

async function lerConteudo(file) {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    // Doc do Google: exporta como texto
    const r = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' });
    return r.data;
  }
  if (file.mimeType.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
    const r = await drive.files.get({ fileId: file.id, alt: 'media' });
    return r.data;
  }
  // Outros mimetypes: ignora (pdf, video etc precisariam parser)
  return null;
}

async function jaImportada(driveId) {
  const r = await fetch(`${API_URL}/api/ideias`, { headers: { 'Authorization': authHeader } });
  if (!r.ok) return false;
  const data = await r.json();
  return (data.ideias || []).some(i => i.fonte === 'drive_transcricao' && i.fonte_id && i.fonte_id.includes(driveId));
}

async function sincronizar() {
  try {
    const files = await listarArquivos();
    let novos = 0, ignorados = 0;
    for (const f of files) {
      if (await jaImportada(f.id)) { ignorados++; continue; }
      const conteudo = await lerConteudo(f);
      if (!conteudo) { ignorados++; continue; }

      const r = await fetch(`${API_URL}/api/ideias`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: f.name,
          descricao: `Transcrição do Drive (${f.mimeType})`,
          fonte: 'drive_transcricao',
          fonte_id: f.id,
          conteudo_raw: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo),
          tags: ['drive', 'reuniao'],
        }),
      });
      if (r.ok) { console.log(`  + ${f.name}`); novos++; }
    }
    console.log(`[${new Date().toISOString().slice(11,19)}] ${novos} novas, ${ignorados} ignoradas`);
  } catch (e) {
    console.error(`erro: ${e.message}`);
  }
}

async function loop() {
  await sincronizar();
  setInterval(sincronizar, POLL_MS);
}

loop();
