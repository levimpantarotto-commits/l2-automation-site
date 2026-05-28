// Post Generator — gera posts pra LinkedIn / Instagram / X usando:
//   - Ideias pendentes (banco ideias)
//   - Cérebro de Persuasão (frameworks)
//   - DNA do cliente
// Posts vão pra fila tarefas_ia (Claude Max processa) e quando voltam,
// são registrados em `posts` com status='rascunho'.
//
// Roda manualmente OU via cron diário (8h).

const AgenteBase = require('./base');

class PostGenerator extends AgenteBase {
  constructor(db) {
    super(db, 'post_generator');
    this.timeoutMs = 30000;
  }

  async execute(input = {}) {
    // Modo callback: recebeu resposta da fila e precisa salvar como post
    if (input.tarefa_id && input.resultado) {
      return this._processarCallback(input);
    }

    // Modo geração: cria N tarefas na fila pro Claude processar
    const redes = input.redes || ['linkedin', 'instagram'];
    const porRede = input.por_rede || 2;

    const ideias = this.db.prepare(`
      SELECT * FROM ideias WHERE status = 'nova'
      ORDER BY created_at DESC LIMIT 5
    `).all();

    if (ideias.length === 0) {
      return { mensagem: 'Sem ideias novas pra gerar posts. Adicione em /api/ideias ou sincronize do Drive.' };
    }

    const cerebroResumos = this.db.prepare(`
      SELECT slug, titulo, resumo_curto FROM cerebro_arquivos
      WHERE resumo_curto IS NOT NULL LIMIT 5
    `).all();

    const cliente = this.db.prepare(`SELECT * FROM clientes WHERE slug = 'l2-automation'`).get() || {};
    const stats = { tarefas_criadas: 0, por_rede: {} };

    for (const ideia of ideias.slice(0, 3)) {
      for (const rede of redes) {
        for (let i = 0; i < porRede; i++) {
          const prompt = this._montarPrompt({ ideia, rede, cliente, cerebro: cerebroResumos, variacao: i + 1 });
          const r = this.db.prepare(`
            INSERT INTO tarefas_ia (tipo, prompt, contexto, prioridade, agente_origem, callback_agente, callback_payload, expires_at)
            VALUES (?, ?, ?, 5, 'post_generator', 'post_generator', ?, datetime('now', '+24 hours'))
          `).run(
            `post_${rede}`, prompt,
            JSON.stringify({ ideia_id: ideia.id, rede, variacao: i + 1 }),
            JSON.stringify({ ideia_id: ideia.id, rede }),
          );
          stats.tarefas_criadas++;
          stats.por_rede[rede] = (stats.por_rede[rede] || 0) + 1;
        }
      }
      // Marca ideia como em_uso
      this.db.prepare(`UPDATE ideias SET status='em_uso' WHERE id=?`).run(ideia.id);
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
      parsed = match ? JSON.parse(match[0]) : { conteudo: resultado };
    } catch {
      parsed = { conteudo: resultado };
    }

    const r = this.db.prepare(`
      INSERT INTO posts (rede, tipo, titulo, conteudo, hashtags, cta, ideia_origem_id, agente_origem, framework_usado, confianca, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'post_generator', ?, ?, 'pendente_aprovacao')
    `).run(
      ctx.rede || 'linkedin',
      parsed.tipo || 'feed',
      parsed.titulo || null,
      parsed.conteudo || resultado,
      parsed.hashtags ? JSON.stringify(parsed.hashtags) : null,
      parsed.cta || null,
      ctx.ideia_id || null,
      parsed.framework_usado || 'misto',
      parsed.confianca || 0.7,
    );

    return { post_id: r.lastInsertRowid, ideia_id: ctx.ideia_id, rede: ctx.rede };
  }

  _montarPrompt({ ideia, rede, cliente, cerebro, variacao }) {
    const frameworks = cerebro.map(c => `[${c.slug}] ${c.resumo_curto.slice(0, 300)}`).join('\n');
    const limitesRede = {
      linkedin: '1300-2000 caracteres, primeiro parágrafo é o gancho (3 linhas máx), use quebras de linha generosas',
      instagram: 'feed: 250-400 chars + 8 hashtags. Carrossel: 5-7 slides estruturados',
      x: '280 chars OU thread de 5 tweets numerados',
      tiktok: 'caption curta + 3 hashtags',
    };

    return `Você é estrategista de conteúdo brasileiro escrevendo POST PRA ${rede.toUpperCase()}.

=== CÉREBRO DE PERSUASÃO (use 1-2 frameworks abaixo) ===
${frameworks}

=== EMPRESA ===
${cliente.dna_resumo || 'L2 Automation — sistema autônomo de prospecção B2B'}

=== IDEIA BASE ===
Título: ${ideia.titulo}
${ideia.descricao ? 'Descrição: ' + ideia.descricao : ''}
${ideia.resumo ? 'Resumo: ' + ideia.resumo.slice(0, 800) : ideia.conteudo_raw ? 'Contexto: ' + ideia.conteudo_raw.slice(0, 800) : ''}

=== FORMATO ${rede.toUpperCase()} ===
${limitesRede[rede] || 'formato padrão da rede'}

=== INSTRUÇÕES ===
Variação ${variacao} — ângulo único, não repete pitch.
- Gancho concreto nos primeiros 3 segundos (Kahneman: Sistema 1)
- Storytelling > listagem (Damásio: emoção decide)
- Abre loop no início, fecha no final
- Sem chavão, sem "hoje vou compartilhar com vocês"
- ${rede === 'linkedin' ? 'Sem emoji executivo. Quebras de linha. Bullets quando faz sentido' : ''}
- ${rede === 'instagram' ? 'Tom mais humano, pode usar emoji moderado' : ''}
- CTA final claro (1 linha)

Devolva APENAS JSON:
{"tipo":"feed|carrossel|reels","titulo":"...","conteudo":"texto completo do post","hashtags":["#tag1","#tag2"],"cta":"...","framework_usado":"slug","confianca":0.0-1.0}`;
  }
}

module.exports = PostGenerator;
