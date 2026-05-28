// Drive Sync — agente que recebe transcrições do Google Drive e gera ideias + resumo.
// O agente NÃO baixa do Drive direto (precisa OAuth do Levi).
//   Solução: o Levi roda LOCAL `node scripts/drive-puller.js` que tem acesso OAuth
//   e faz POST em /api/ideias com o conteúdo. Esse agente reage ao evento.
// Quando ideia chega com fonte='drive_transcricao' E conteudo_raw>2000 chars,
// dispara tarefa pro Claude resumir.

const AgenteBase = require('./base');

class DriveSync extends AgenteBase {
  constructor(db) {
    super(db, 'drive_sync');
    this.timeoutMs = 30000;
  }

  async execute(input = {}) {
    // Callback: resumo voltou
    if (input.tarefa_id && input.resultado) {
      return this._processarCallback(input);
    }

    // Modo varredura: pega ideias com conteudo_raw sem resumo
    const semResumo = this.db.prepare(`
      SELECT * FROM ideias
      WHERE fonte = 'drive_transcricao'
        AND conteudo_raw IS NOT NULL
        AND length(conteudo_raw) > 2000
        AND (resumo IS NULL OR resumo = '')
      ORDER BY created_at DESC LIMIT 10
    `).all();

    if (semResumo.length === 0) {
      return { mensagem: 'Nenhuma transcrição pra resumir.' };
    }

    const stats = { enfileiradas: 0 };
    for (const ideia of semResumo) {
      const prompt = this._montarPrompt(ideia);
      this.db.prepare(`
        INSERT INTO tarefas_ia (tipo, prompt, contexto, prioridade, agente_origem, callback_agente, callback_payload, expires_at)
        VALUES ('resumo_reuniao', ?, ?, 7, 'drive_sync', 'drive_sync', ?, datetime('now', '+24 hours'))
      `).run(
        prompt,
        JSON.stringify({ ideia_id: ideia.id }),
        JSON.stringify({ ideia_id: ideia.id }),
      );
      stats.enfileiradas++;
    }
    return stats;
  }

  _processarCallback({ tarefa_id, resultado }) {
    const tarefa = this.db.prepare(`SELECT * FROM tarefas_ia WHERE id = ?`).get(tarefa_id);
    if (!tarefa) return { erro: 'tarefa nao encontrada' };
    const ctx = JSON.parse(tarefa.contexto || '{}');

    let parsed = {};
    try {
      const match = resultado.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { resumo: resultado };
    } catch {
      parsed = { resumo: resultado };
    }

    this.db.prepare(`
      UPDATE ideias SET
        resumo = ?, tags = COALESCE(?, tags)
      WHERE id = ?
    `).run(
      parsed.resumo || resultado.slice(0, 3000),
      parsed.tags ? JSON.stringify(parsed.tags) : null,
      ctx.ideia_id,
    );

    return { ideia_id: ctx.ideia_id, resumo_chars: (parsed.resumo || '').length };
  }

  _montarPrompt(ideia) {
    return `Analise a transcrição abaixo de uma reunião e gere um RESUMO EXECUTIVO em JSON.

=== TÍTULO ===
${ideia.titulo}

=== TRANSCRIÇÃO ===
${(ideia.conteudo_raw || '').slice(0, 20000)}

=== INSTRUÇÕES ===
- Resumo em português brasileiro, tom executivo direto
- 5-8 bullets concretos do que foi decidido/discutido
- Liste insights acionáveis pra posts/roteiros (assunto + ângulo)
- Identifique 3-5 tags temáticas

Devolva APENAS JSON:
{
  "resumo": "texto markdown com bullets",
  "decisoes": ["...", "..."],
  "ideias_de_conteudo": [{"assunto": "...", "angulo": "..."}],
  "tags": ["tag1", "tag2"]
}`;
  }
}

module.exports = DriveSync;
