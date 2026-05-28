// Worker local — bridge entre fila L2 e Claude Max.
// Roda na maquina do Levi. Polleia /api/ia/proxima, processa via Claude Code CLI
// ou Anthropic SDK, e devolve resultado via POST.
//
// Uso:
//   node scripts/worker-claude.js
//
// Variaveis opcionais:
//   L2_API_URL=https://app.l2automation.com.br
//   WORKER_TIPOS=copy_email,post_linkedin,post_instagram,roteiro_video,resumo_reuniao
//   POLL_INTERVAL_MS=5000
//   CLAUDE_CLI=claude   (comando do Claude Code CLI)
//
// O worker tenta nessa ordem:
//   1. ANTHROPIC_API_KEY no env -> usa Anthropic SDK direto
//   2. CLAUDE_CLI disponivel -> chama claude --print '...'
//   3. Falha (e marca tarefa como falhou)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
const WORKER_ID = `worker-${require('os').hostname()}-${process.pid}`;
const TIPOS = process.env.WORKER_TIPOS;
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const CLAUDE_CLI = process.env.CLAUDE_CLI || 'claude';

const authHeader = 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');

console.log(`╔════════════════════════════════════════╗`);
console.log(`║ L2 Worker Claude Max Bridge            ║`);
console.log(`╚════════════════════════════════════════╝`);
console.log(`Worker ID: ${WORKER_ID}`);
console.log(`API: ${API_URL}`);
console.log(`Tipos: ${TIPOS || '(todos)'}`);
console.log(`Poll: ${POLL_MS}ms`);
console.log(`Claude CLI: ${CLAUDE_CLI}`);
console.log(`Anthropic SDK: ${process.env.ANTHROPIC_API_KEY ? 'OK' : 'sem ANTHROPIC_API_KEY — usando CLI'}\n`);

async function pegarTarefa() {
  const url = `${API_URL}/api/ia/proxima?worker_id=${WORKER_ID}${TIPOS ? '&tipos=' + TIPOS : ''}`;
  const r = await fetch(url, { headers: { 'Authorization': authHeader } });
  if (!r.ok) throw new Error(`pegar tarefa: ${r.status}`);
  const data = await r.json();
  return data.tarefa;
}

async function devolverResultado(id, resultado, ms) {
  await fetch(`${API_URL}/api/ia/${id}/concluir`, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultado, duracao_ms: ms }),
  });
}

async function marcarFalha(id, erro) {
  await fetch(`${API_URL}/api/ia/${id}/falhar`, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ erro: String(erro).slice(0, 1000) }),
  });
}

// ============================================================
// PROCESSADORES — varios backends
// ============================================================

// Anthropic SDK direto (precisa ANTHROPIC_API_KEY)
async function processarViaSDK(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// Claude Code CLI: claude --print "..."
function processarViaCLI(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_CLI, ['--print', '--output-format', 'text'], {
      shell: process.platform === 'win32',
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('CLI timeout 180s')); }, 180_000);

    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) resolve(stdout.trim());
      else reject(new Error(`CLI exit ${code}: ${stderr.slice(0, 200)}`));
    });
    proc.on('error', e => { clearTimeout(timer); reject(e); });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

async function processar(prompt) {
  if (process.env.ANTHROPIC_API_KEY) return processarViaSDK(prompt);
  return processarViaCLI(prompt);
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
async function loop() {
  while (true) {
    try {
      const tarefa = await pegarTarefa();
      if (!tarefa) {
        await new Promise(r => setTimeout(r, POLL_MS));
        continue;
      }

      console.log(`[${new Date().toISOString().slice(11,19)}] processando #${tarefa.id} (${tarefa.tipo})`);
      const start = Date.now();

      try {
        const resultado = await processar(tarefa.prompt);
        const ms = Date.now() - start;
        await devolverResultado(tarefa.id, resultado, ms);
        console.log(`  OK em ${ms}ms (${resultado.length} chars)`);
      } catch (e) {
        console.error(`  FAIL: ${e.message}`);
        await marcarFalha(tarefa.id, e.message);
      }
    } catch (e) {
      console.error(`[loop] erro: ${e.message}`);
      await new Promise(r => setTimeout(r, POLL_MS * 2));
    }
  }
}

loop().catch(e => { console.error('FATAL:', e); process.exit(1); });
