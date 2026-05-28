// Video Prototyper — gera ROTEIRO (sem gerar vídeo real — isso precisa Runway/Sora pago).
// Estrutura: gancho (3s), bloco principal, CTA. Cenas separadas com cue.
// Usa Cérebro de Persuasão + ideia base.

const AgenteBase = require('./base');

class VideoPrototyper extends AgenteBase {
  constructor(db) {
    super(db, 'video_prototyper');
    this.timeoutMs = 30000;
  }

  async execute(input = {}) {
    // Callback
    if (input.tarefa_id && input.resultado) {
      return this._processarCallback(input);
    }

    const redes = input.redes || ['reels', 'shorts'];
    const ideias = this.db.prepare(`
      SELECT * FROM ideias WHERE status IN ('nova', 'em_uso')
      ORDER BY created_at DESC LIMIT 5
    `).all();

    if (ideias.length === 0) return { mensagem: 'Sem ideias pra criar roteiros.' };

    const cerebro = this.db.prepare(`
      SELECT slug, titulo, resumo_curto FROM cerebro_arquivos WHERE resumo_curto IS NOT NULL LIMIT 4
    `).all();

    const cliente = this.db.prepare(`SELECT * FROM clientes WHERE slug = 'l2-automation'`).get() || {};
    const stats = { tarefas_criadas: 0 };

    for (const ideia of ideias.slice(0, 2)) {
      for (const rede of redes) {
        const prompt = this._montarPrompt({ ideia, rede, cliente, cerebro });
        this.db.prepare(`
          INSERT INTO tarefas_ia (tipo, prompt, contexto, prioridade, agente_origem, callback_agente, callback_payload, expires_at)
          VALUES (?, ?, ?, 6, 'video_prototyper', 'video_prototyper', ?, datetime('now', '+24 hours'))
        `).run(
          `roteiro_${rede}`, prompt,
          JSON.stringify({ ideia_id: ideia.id, rede }),
          JSON.stringify({ ideia_id: ideia.id, rede }),
        );
        stats.tarefas_criadas++;
      }
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
      parsed = match ? JSON.parse(match[0]) : { roteiro_completo: resultado };
    } catch {
      parsed = { roteiro_completo: resultado };
    }

    const r = this.db.prepare(`
      INSERT INTO roteiros (titulo, rede, duracao_estimada_s, gancho, estrutura, roteiro_completo, cta, ideia_origem_id, agente_origem, framework_usado, status, thumbnail_sugestao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'video_prototyper', ?, 'rascunho', ?)
    `).run(
      parsed.titulo || 'Sem título',
      ctx.rede || 'reels',
      parsed.duracao_estimada_s || 60,
      parsed.gancho || null,
      parsed.estrutura ? JSON.stringify(parsed.estrutura) : null,
      parsed.roteiro_completo || resultado,
      parsed.cta || null,
      ctx.ideia_id || null,
      parsed.framework_usado || 'misto',
      parsed.thumbnail_sugestao || null,
    );

    return { roteiro_id: r.lastInsertRowid };
  }

  _montarPrompt({ ideia, rede, cliente, cerebro }) {
    const frameworks = cerebro.map(c => `[${c.slug}] ${c.resumo_curto.slice(0, 250)}`).join('\n');
    const limites = {
      reels: '30-60 segundos. Gancho nos 1-3s. Pacing rápido. Texto na tela essencial.',
      shorts: '30-60s. Mesmo formato Reels.',
      youtube: '5-12 minutos. Estrutura: gancho (15s), promessa, conteúdo em blocos, CTA.',
      tiktok: '15-30s. Mais cru, menos polido.',
    };

    return `Você é roteirista brasileiro escrevendo ROTEIRO PARA ${rede.toUpperCase()}.

=== CÉREBRO DE PERSUASÃO ===
${frameworks}

=== EMPRESA ===
${cliente.dna_resumo || 'L2 Automation — sistema autônomo B2B'}

=== IDEIA ===
Título: ${ideia.titulo}
${ideia.descricao ? 'Descrição: ' + ideia.descricao : ''}
${ideia.resumo ? 'Resumo: ' + ideia.resumo.slice(0, 1000) : ideia.conteudo_raw ? 'Contexto: ' + ideia.conteudo_raw.slice(0, 1000) : ''}

=== FORMATO ===
${limites[rede] || 'formato padrão'}

=== INSTRUÇÕES ===
- Gancho nos primeiros segundos parando dedo (loop aberto + concretude específica)
- Estrutura em CENAS numeradas com [cue visual] e narração
- CTA final claro e simples
- Sem chavão de coach, sem "fala galera"
- Pacing brasileiro descomplicado mas afiado

Devolva APENAS JSON:
{
  "titulo": "...",
  "duracao_estimada_s": 45,
  "gancho": "primeiros 3 segundos — frase exata",
  "estrutura": [
    {"cena": 1, "tempo_s": "0-3", "visual": "...", "narracao": "..."},
    {"cena": 2, "tempo_s": "3-15", "visual": "...", "narracao": "..."}
  ],
  "roteiro_completo": "texto narrado contínuo pra leitura",
  "cta": "...",
  "thumbnail_sugestao": "descrição da imagem de capa",
  "framework_usado": "slug"
}`;
  }
}

module.exports = VideoPrototyper;
