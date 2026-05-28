// Self-Debugger — agente que lê erros recentes e tenta classificar/sugerir fix.
//
// Por padrão usa Gemini API (GEMINI_API_KEY env). Se não houver chave, faz
// classificação heurística local (sem chamada externa).
//
// Roda via cron (ex: a cada 15min) ou manualmente.
//
// Output: { analisados, classificados, sugestoes:[{failure_id, padrao, categoria, sugestao}] }

const AgenteBase = require('./base');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

class SelfDebugger extends AgenteBase {
  constructor(db) {
    super(db, 'self_debugger');
    this.timeoutMs = 120000;
  }

  async execute(input = {}) {
    const limite = input.limite || 10;

    // Pega failures sem resolução tentada, ordem de prioridade: mais ocorrências
    const pendentes = this.db.prepare(`
      SELECT * FROM failures
      WHERE resolucao_tentada IS NULL OR resolucao_funcionou IS NULL
      ORDER BY ocorrencias DESC, ultimo_caso DESC
      LIMIT ?
    `).all(limite);

    if (pendentes.length === 0) {
      return { analisados: 0, mensagem: 'Nenhuma falha pendente — sistema saudável.' };
    }

    const sugestoes = [];

    for (const f of pendentes) {
      let analise;
      if (process.env.GEMINI_API_KEY) {
        try {
          analise = await this._analisarComGemini(f);
        } catch (e) {
          console.warn(`[self_debugger] Gemini falhou pra failure ${f.id}: ${e.message}`);
          analise = this._analiseHeuristica(f);
        }
      } else {
        analise = this._analiseHeuristica(f);
      }

      // Salva resolução tentada (apenas texto — humano valida antes de aplicar código)
      this.db.prepare(`
        UPDATE failures SET
          resolucao_tentada = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(analise.sugestao.slice(0, 2000), f.id);

      sugestoes.push({
        failure_id: f.id,
        agente: f.agente,
        padrao: f.padrao_erro,
        categoria: analise.categoria,
        sugestao: analise.sugestao,
      });
    }

    // Emite evento pra Maestro/UI notificar sócios em produção
    this.emitirEvento('debug_concluido', { total: sugestoes.length, sugestoes: sugestoes.slice(0, 3) });

    return { analisados: pendentes.length, sugestoes };
  }

  async _analisarComGemini(failure) {
    const prompt = `Você é um diagnosticador de falhas de software. Analise a falha abaixo e responda em JSON {"categoria":"...","sugestao":"..."} em até 200 palavras.

Agente: ${failure.agente}
Padrão de erro: ${failure.padrao_erro}
Erro completo: ${failure.erro_completo || '(sem detalhe)'}
Contexto (input): ${failure.contexto || '(sem contexto)'}
Ocorrências: ${failure.ocorrencias}

Categorias possíveis: "rate_limit","credencial_invalida","timeout","schema_db","dependencia_externa","logica_codigo","input_invalido","desconhecido".

Sugestão deve ser AÇÃO concreta (não filosofia). Exemplo: "Aumentar timeout pra 120s e adicionar retry com backoff", "Trocar chave GEMINI_API_KEY no env do Coolify".`;

    const res = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`);

    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Tenta extrair JSON
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          categoria: parsed.categoria || 'desconhecido',
          sugestao: parsed.sugestao || texto.slice(0, 500),
        };
      } catch (_) {}
    }

    return { categoria: 'desconhecido', sugestao: texto.slice(0, 500) || 'Gemini não retornou análise.' };
  }

  _analiseHeuristica(failure) {
    const erro = (failure.erro_completo || failure.padrao_erro || '').toLowerCase();

    if (/timeout|timed out|etimedout/.test(erro)) {
      return { categoria: 'timeout', sugestao: 'Aumentar timeoutMs do agente ou reduzir tamanho do batch.' };
    }
    if (/429|rate limit|too many/.test(erro)) {
      return { categoria: 'rate_limit', sugestao: 'Aumentar DELAY_BETWEEN_REQ_MS ou trocar pra outra API.' };
    }
    if (/401|403|unauthorized|forbidden|invalid.{0,20}key|invalid.{0,20}token/.test(erro)) {
      return { categoria: 'credencial_invalida', sugestao: 'Verificar/rotacionar chave de API no env do Coolify.' };
    }
    if (/sqlite|database|no such (table|column)|constraint/.test(erro)) {
      return { categoria: 'schema_db', sugestao: 'Conferir db/schema.sql — possível coluna faltando ou migration pendente.' };
    }
    if (/enotfound|econnrefused|dns|getaddrinfo/.test(erro)) {
      return { categoria: 'dependencia_externa', sugestao: 'API externa fora do ar ou DNS errado. Retry após uns minutos.' };
    }
    if (/cannot read|undefined|null|typeerror/.test(erro)) {
      return { categoria: 'logica_codigo', sugestao: 'Bug no agente — defensive coding faltando. Adicionar guards.' };
    }

    return { categoria: 'desconhecido', sugestao: `Investigar manualmente. Erro: "${failure.padrao_erro}".` };
  }
}

module.exports = SelfDebugger;
