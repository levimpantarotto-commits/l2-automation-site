// Import dump CNPJ da Receita Federal -> SQLite local.
// Roda LOCAL (precisa ~10GB livre + ~3h pra processar).
// Depois sobe pro Coolify via SCP, e o CnpjFinder usa essa base offline.
//
// Fonte: https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj
// URL base mensal: https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/
//
// Arquivos relevantes:
//   K3241.K03200Y0.D40510.ESTABELE.zip  (60M estabelecimentos — usamos)
//   K3241.K03200Y0.D40510.EMPRECSV.zip  (49M empresas — razão social)
//
// Uso:
//   node scripts/import-receita-dump.js --download    # baixa zips
//   node scripts/import-receita-dump.js --import      # importa CSVs no SQLite
//   node scripts/import-receita-dump.js --all         # baixa + importa

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const https = require('https');
const zlib = require('zlib');

const TRABALHO_DIR = path.join(__dirname, '..', 'data', 'receita-dump');
if (!fs.existsSync(TRABALHO_DIR)) fs.mkdirSync(TRABALHO_DIR, { recursive: true });

const DB_PATH = path.join(__dirname, '..', 'data', 'receita-cnpj.db');

// Função pra detectar URL/mês mais recente automaticamente
async function detectarMesAtual() {
  console.log('Detectando ultimo dump disponivel...');
  return new Promise((resolve) => {
    https.get('https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/', res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const matches = [...body.matchAll(/href="(\d{4}-\d{2})\/"/g)].map(m => m[1]).sort();
        const ultimo = matches[matches.length - 1];
        if (!ultimo) {
          console.log('Nao consegui detectar — usando hardcoded fallback');
          return resolve('2024-12'); // ajustar manualmente se mudar
        }
        console.log(`Mes detectado: ${ultimo}`);
        resolve(ultimo);
      });
    }).on('error', () => resolve('2024-12'));
  });
}

async function listarArquivos(mes) {
  return new Promise((resolve) => {
    https.get(`https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/${mes}/`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const links = [...body.matchAll(/href="([^"]+\.zip)"/g)].map(m => m[1]);
        resolve(links);
      });
    }).on('error', () => resolve([]));
  });
}

async function baixar(url, destino) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destino)) {
      const size = fs.statSync(destino).size;
      console.log(`  Ja existe: ${path.basename(destino)} (${(size/1024/1024).toFixed(1)}MB) — pulando`);
      return resolve();
    }
    console.log(`  Baixando ${path.basename(destino)}...`);
    const file = fs.createWriteStream(destino);
    https.get(url, res => {
      const total = parseInt(res.headers['content-length'], 10);
      let baixado = 0;
      res.on('data', chunk => {
        baixado += chunk.length;
        process.stdout.write(`\r    ${(baixado/1024/1024).toFixed(0)}MB / ${(total/1024/1024).toFixed(0)}MB`);
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log(' OK'); resolve(); });
    }).on('error', e => { fs.unlinkSync(destino); reject(e); });
  });
}

async function comandoDownload() {
  const mes = await detectarMesAtual();
  const arquivos = await listarArquivos(mes);
  const relevantes = arquivos.filter(a =>
    a.includes('Estabelecimentos') || a.includes('Empresas')
  );
  console.log(`${relevantes.length} arquivos relevantes encontrados.`);
  console.log(`Destino: ${TRABALHO_DIR}\n`);

  for (const a of relevantes) {
    const url = `https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/${mes}/${a}`;
    const dest = path.join(TRABALHO_DIR, a);
    try { await baixar(url, dest); } catch (e) { console.error(`  FAIL: ${e.message}`); }
  }
  console.log('\nDownload completo. Rode: node scripts/import-receita-dump.js --import');
}

async function comandoImport() {
  console.log(`Importando para ${DB_PATH}...`);
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS receita_estabelecimento (
      cnpj_base TEXT,
      cnpj_ordem TEXT,
      cnpj_dv TEXT,
      cnpj TEXT GENERATED ALWAYS AS (cnpj_base || cnpj_ordem || cnpj_dv) VIRTUAL,
      matriz_filial INTEGER,
      nome_fantasia TEXT,
      situacao_cadastral TEXT,
      data_situacao TEXT,
      motivo_situacao TEXT,
      nome_cidade_exterior TEXT,
      pais TEXT,
      data_inicio_atividade TEXT,
      cnae_principal TEXT,
      cnaes_secundarios TEXT,
      tipo_logradouro TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cep TEXT,
      uf TEXT,
      municipio TEXT,
      ddd_1 TEXT,
      telefone_1 TEXT,
      ddd_2 TEXT,
      telefone_2 TEXT,
      ddd_fax TEXT,
      fax TEXT,
      email TEXT,
      situacao_especial TEXT,
      data_situacao_especial TEXT
    );

    CREATE TABLE IF NOT EXISTS receita_empresa (
      cnpj_base TEXT PRIMARY KEY,
      razao_social TEXT,
      natureza_juridica TEXT,
      qualificacao_responsavel TEXT,
      capital_social REAL,
      porte TEXT,
      ente_federativo TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_estab_uf_cnae ON receita_estabelecimento(uf, cnae_principal);
    CREATE INDEX IF NOT EXISTS idx_estab_cnae ON receita_estabelecimento(cnae_principal);
    CREATE INDEX IF NOT EXISTS idx_estab_base ON receita_estabelecimento(cnpj_base);
  `);

  const arquivos = fs.readdirSync(TRABALHO_DIR).filter(f => f.endsWith('.zip'));

  for (const z of arquivos) {
    const tipo = z.includes('Estabelecimento') ? 'estabelecimento' : z.includes('Empresa') ? 'empresa' : null;
    if (!tipo) continue;
    console.log(`\nProcessando ${z} (${tipo})...`);

    // Descompacta via unzip CLI
    const extraido = path.join(TRABALHO_DIR, 'extraido_' + z.replace('.zip', ''));
    if (!fs.existsSync(extraido)) fs.mkdirSync(extraido, { recursive: true });
    try {
      execSync(`unzip -o "${path.join(TRABALHO_DIR, z)}" -d "${extraido}"`, { stdio: 'pipe' });
    } catch (e) {
      console.error(`  unzip falhou: ${e.message}`);
      console.error(`  Instale unzip ou descompacte manualmente em ${extraido}`);
      continue;
    }

    // Lê CSVs (encoding ISO-8859-1, separador ; sem header)
    const csvs = fs.readdirSync(extraido).filter(f => f.match(/\.(csv|ESTABELE|EMPRECSV)/i));
    for (const csv of csvs) {
      const full = path.join(extraido, csv);
      console.log(`  Importando ${csv} (${(fs.statSync(full).size/1024/1024).toFixed(1)}MB)...`);
      await importarCSV(db, full, tipo);
    }
  }

  // Estatisticas finais
  const totalE = db.prepare('SELECT COUNT(*) AS c FROM receita_estabelecimento').get().c;
  const totalC = db.prepare('SELECT COUNT(*) AS c FROM receita_empresa').get().c;
  console.log(`\nFim. ${totalE} estabelecimentos, ${totalC} empresas no DB.`);
  console.log(`\nProximo passo: SCP ${DB_PATH} pro Coolify.`);
}

async function importarCSV(db, file, tipo) {
  return new Promise((resolve, reject) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity,
    });

    const insertE = db.prepare(`
      INSERT INTO receita_estabelecimento (
        cnpj_base, cnpj_ordem, cnpj_dv, matriz_filial, nome_fantasia,
        situacao_cadastral, data_situacao, motivo_situacao, nome_cidade_exterior, pais,
        data_inicio_atividade, cnae_principal, cnaes_secundarios,
        tipo_logradouro, logradouro, numero, complemento, bairro, cep, uf, municipio,
        ddd_1, telefone_1, ddd_2, telefone_2, ddd_fax, fax, email,
        situacao_especial, data_situacao_especial
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertC = db.prepare(`
      INSERT OR REPLACE INTO receita_empresa
      (cnpj_base, razao_social, natureza_juridica, qualificacao_responsavel, capital_social, porte, ente_federativo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let lidas = 0;
    db.exec('BEGIN');
    rl.on('line', linha => {
      const cols = linha.split(';').map(c => c.replace(/^"|"$/g, ''));
      try {
        if (tipo === 'estabelecimento' && cols.length >= 30) {
          insertE.run(...cols.slice(0, 30));
        } else if (tipo === 'empresa' && cols.length >= 7) {
          insertC.run(cols[0], cols[1], cols[2], cols[3],
            cols[4] ? parseFloat(cols[4].replace(',', '.')) : 0,
            cols[5], cols[6] || null);
        }
        lidas++;
        if (lidas % 100000 === 0) {
          db.exec('COMMIT'); db.exec('BEGIN');
          process.stdout.write(`\r    ${lidas} linhas`);
        }
      } catch (e) { /* skip linha mal-formada */ }
    });
    rl.on('close', () => {
      db.exec('COMMIT');
      console.log(`\r    ${lidas} linhas OK`);
      resolve();
    });
    rl.on('error', reject);
  });
}

// CLI
const cmd = process.argv[2];
if (cmd === '--download') comandoDownload();
else if (cmd === '--import') comandoImport();
else if (cmd === '--all') comandoDownload().then(comandoImport);
else {
  console.log('Uso:');
  console.log('  node scripts/import-receita-dump.js --download   # baixa ~5GB de zips');
  console.log('  node scripts/import-receita-dump.js --import     # importa CSVs no SQLite (~3h)');
  console.log('  node scripts/import-receita-dump.js --all        # tudo de uma vez');
  console.log('\nDB final: data/receita-cnpj.db (~8-10GB)');
  console.log('Depois: SCP pro Coolify volume /data/');
}
