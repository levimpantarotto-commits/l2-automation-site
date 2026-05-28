// Copywriter — gera copy personalizada por lead usando:
//   - Persona do nicho (dor, ganho, tom, ganchos)
//   - DNA do cliente (slug)
//   - Cérebro de Persuasão (frameworks Kahneman/Damásio/Sobral/Clássicos)
//   - Dados do lead (razão, sócios, CNAE, cidade)
//
// Saída: { assunto, corpo, framework_usado, confianca }
//
// Sem GEMINI_API_KEY → fallback pra template estruturado (Sobral 4 camadas)

const AgenteBase = require('./base');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

class Copywriter extends AgenteBase {
  constructor(db) {
    super(db, 'copywriter');
    this.timeoutMs = 60000;
  }

  async execute(input = {}) {
    const lead = input.lead || (input.lead_id ?
      this.db.prepare('SELECT * FROM leads WHERE id = ?').get(input.lead_id) : null);
    if (!lead) throw new Error('lead obrigatório');

    const canal = input.canal || 'email';
    const tentativa = input.tentativa || 1;

    const persona = lead.nicho ? this.db.prepare('SELECT * FROM personas WHERE nicho = ?').get(lead.nicho) : null;
    const cliente = lead.cliente_slug ? this.db.prepare('SELECT * FROM clientes WHERE slug = ?').get(lead.cliente_slug)
                                       : this.db.prepare('SELECT * FROM clientes WHERE slug = ?').get('l2-automation');

    // Carrega Cérebro de Persuasão (resumos curtos pra caber no prompt)
    const cerebro = this.db.prepare(`
      SELECT slug, titulo, resumo_curto FROM cerebro_arquivos
      WHERE resumo_curto IS NOT NULL AND resumo_curto != ''
    `).all();

    if (process.env.GEMINI_API_KEY && cerebro.length > 0) {
      try {
        return await this._gerarComGemini({ lead, canal, tentativa, persona, cliente, cerebro });
      } catch (e) {
        console.warn(`[copywriter] Gemini falhou: ${e.message} — fallback`);
      }
    }

    return this._fallbackTemplate({ lead, canal, tentativa, persona, cliente });
  }

  async _gerarComGemini({ lead, canal, tentativa, persona, cliente, cerebro }) {
    const frameworks = cerebro.map(c => `[${c.slug}] ${c.titulo}: ${c.resumo_curto}`).join('\n');

    const dnaCliente = cliente?.dna_resumo || 'L2 Automation — sistema autônomo de prospecção e venda B2B.';
    const ganho = persona?.ganho_prometido || 'rodar prospecção comercial no piloto automático sem precisar de mais um SDR humano';
    const dor = persona?.dor_principal || 'depende de SDR caro pra abrir conversas';
    const tom = persona?.tom || 'executivo, direto, sem chavão';

    const isFollowup = tentativa > 1;

    const prompt = `Você é copywriter sênior brasileiro escrevendo ${canal === 'email' ? 'EMAIL FRIO' : 'MENSAGEM ' + canal.toUpperCase()} pra prospecção B2B.

=== CÉREBRO DE PERSUASÃO (frameworks disponíveis) ===
${frameworks}

=== EMPRESA QUE VENDE ===
${dnaCliente}

=== PERSONA ALVO ===
Nicho: ${lead.nicho || 'não classificado'}
Dor principal: ${dor}
Ganho prometido: ${ganho}
Tom: ${tom}

=== LEAD ESPECÍFICO ===
Razão social: ${lead.razao_social || 'empresa'}
Nome fantasia: ${lead.nome_fantasia || ''}
Cidade/UF: ${lead.cidade || ''}/${lead.uf || ''}
CNAE: ${lead.cnae_descricao || ''}
Porte: ${lead.porte || ''}
${(() => { try { const m = JSON.parse(lead.metadata || '{}'); return m.socios ? 'Sócios: ' + m.socios.join(', ') : ''; } catch { return ''; } })()}

=== INSTRUÇÕES ===
${isFollowup
  ? `Esta é tentativa ${tentativa} de 3. Lead não respondeu mensagem anterior. Mude o ângulo (não repita pitch). Tom mais curto e direto. Não soar desesperado.`
  : `Primeira abordagem. Gancho deve parar o dedo nos 2 primeiros segundos. Headline concreta com situação específica (não abstração).`}

REGRAS:
1. Use Sistema 1 (Kahneman): apele a emoção primeiro, lógica blinda depois.
2. Concretude > abstração (situação específica do nicho).
3. Abra loop no início, feche no final.
4. Sem emoji, sem "espero que esteja bem", sem "tudo bem?".
5. Máximo 4 linhas no corpo (email) ou 2 linhas (WhatsApp/LinkedIn).
6. ${canal === 'email' ? 'Inclua ASSUNTO curto (max 50 chars) — NÃO "Sobre..." NÃO "Oportunidade".' : ''}

Devolva JSON puro: {"assunto":"...","corpo":"...","framework_usado":"slug do cérebro mais aplicado","confianca":0.0-1.0}`;

    const res = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 600 },
      }),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = texto.match(/\{[\s\S]*\}/);

    if (!match) throw new Error('Gemini não retornou JSON');
    const parsed = JSON.parse(match[0]);

    return {
      assunto: parsed.assunto || '',
      corpo: parsed.corpo || texto,
      framework_usado: parsed.framework_usado || 'misto',
      confianca: parsed.confianca || 0.7,
      provedor: 'gemini',
    };
  }

  _fallbackTemplate({ lead, canal, tentativa, persona, cliente }) {
    const razao = lead.razao_social || lead.nome_fantasia || 'sua empresa';
    const ganho = persona?.ganho_prometido || 'automatizar prospecção comercial';
    const dor = persona?.dor_principal || 'depender de SDR pra abrir conversas';

    if (canal !== 'email') {
      const linhas = [
        `Oi! Vi que vocês atuam${lead.nicho ? ` em ${lead.nicho}` : ''} — quem hoje cuida da prospecção comercial aí em ${razao}?`,
        `Voltando aqui — quem cuida do comercial em ${razao}? Tenho um pitch de 60s.`,
        `Última tentativa pra não virar spam — me responde só "não" se não rolar, segue a vida.`,
      ];
      return {
        assunto: '',
        corpo: linhas[Math.min(tentativa - 1, 2)],
        framework_usado: 'template_fallback',
        confianca: 0.4,
        provedor: 'fallback',
      };
    }

    // Email com Sobral 4 camadas (gancho/quebra/dor/oferta)
    const assuntos = [
      `Como ${razao} resolve ${dor}?`,
      `Esqueci de te perguntar uma coisa, ${razao}`,
      `Última — vou parar de incomodar`,
    ];
    const corpos = [
      `Boa tarde,

${lead.cidade ? `${lead.cidade} tá cheia de empresas iguais à ${razao} ` : ''}gastando R$8-15k/mês com SDR humano que abre 10 conversas por dia se for bom.

L2 Automation faz isso em automático — agentes próprios prospectam, qualificam e abrem conversa com decisor. Sem CLT, sem treinamento, sem rotatividade.

60 segundos pra te mostrar o painel rodando?

Levi`,

      `Oi de novo,

Mandei um email semana passada e não voltou — assumindo que se perdeu.

Pergunta direta: vocês ${dor}? Se a resposta for sim, vale 10 minutos pra ver como o L2 muda isso.

Levi`,

      `Sem perseguir.

Se ${ganho} não é prioridade pra ${razao} esse trimestre, fecho aqui e não incomodo mais.

Se mudou de ideia depois, é só responder.

Levi`,
    ];

    return {
      assunto: assuntos[Math.min(tentativa - 1, 2)],
      corpo: corpos[Math.min(tentativa - 1, 2)],
      framework_usado: 'sobral_4_camadas',
      confianca: 0.5,
      provedor: 'fallback',
    };
  }
}

module.exports = Copywriter;
