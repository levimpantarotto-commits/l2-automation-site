// SDR Neural — agente que conversa com leads no WhatsApp/Email pra qualificar.
// Por padrão: gera resposta via Gemini (se GEMINI_API_KEY) ou template fixo.
// Canais reais (WhatsApp Baileys / Evolution API): integração na próxima iteração.
//
// Modos: 'followup' (lead parou de responder) | 'resposta' (lead respondeu, gerar próxima msg)
//
// Por enquanto: trabalha em dry-run sempre — registra a mensagem em `conversas` mas não envia.

const AgenteBase = require('./base');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const TEMPLATE_FOLLOWUP = [
  'Oi, só fazendo follow-up rápido — meu email anterior chegou aí?',
  'Bom dia! Vi que talvez tenha passado batido — posso mandar o print do painel rodando?',
  'Última tentativa pra não virar spam: querendo ver os primeiros leads qualificados, me responde aqui.',
];

class SdrNeural extends AgenteBase {
  constructor(db) {
    super(db, 'sdr_neural');
    this.timeoutMs = 60000;
  }

  async execute(input = {}) {
    const modo = input.modo || 'followup';
    let conversas;

    if (input.conversa_ids && input.conversa_ids.length) {
      const placeholders = input.conversa_ids.map(() => '?').join(',');
      conversas = this.db.prepare(`
        SELECT c.*, l.razao_social, l.nicho FROM conversas c
        JOIN leads l ON l.id = c.lead_id
        WHERE c.id IN (${placeholders})
      `).all(...input.conversa_ids);
    } else if (modo === 'followup') {
      conversas = this.db.prepare(`
        SELECT c.*, l.razao_social, l.nicho FROM conversas c
        JOIN leads l ON l.id = c.lead_id
        WHERE c.status = 'aguardando_resposta'
          AND c.ultimo_msg < datetime('now', '-1 day')
          AND c.followups_count < 3
        LIMIT 10
      `).all();
    } else {
      conversas = [];
    }

    if (conversas.length === 0) return { processadas: 0, mensagem: 'Nada pendente pra SDR.' };

    const stats = { processadas: 0, geradas: 0, dryrun: 0 };

    for (const c of conversas) {
      const tentativaN = c.followups_count || 0;
      let mensagem;

      if (process.env.GEMINI_API_KEY) {
        try {
          mensagem = await this._gerarComGemini(c, tentativaN);
          stats.geradas++;
        } catch (e) {
          console.warn(`[sdr_neural] Gemini falhou: ${e.message}`);
          mensagem = TEMPLATE_FOLLOWUP[Math.min(tentativaN, TEMPLATE_FOLLOWUP.length - 1)];
        }
      } else {
        mensagem = TEMPLATE_FOLLOWUP[Math.min(tentativaN, TEMPLATE_FOLLOWUP.length - 1)];
      }

      // Registra em conversas (dry-run — envio real depende de integração WhatsApp/Email)
      this.db.prepare(`
        INSERT INTO conversas (lead_id, canal, direcao, mensagem, agente_origem, status, ultimo_msg)
        VALUES (?, ?, 'enviada', ?, 'sdr_neural_dryrun', 'aguardando_resposta', CURRENT_TIMESTAMP)
      `).run(c.lead_id, c.canal || 'email', mensagem);

      // Atualiza contador da conversa original
      this.db.prepare(`
        UPDATE conversas SET followups_count = followups_count + 1, ultimo_msg = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(c.id);

      stats.processadas++;
      stats.dryrun++;
    }

    stats.aviso = 'Mensagens em dry-run — integração WhatsApp/Email send precisa de chave configurada.';
    return stats;
  }

  async _gerarComGemini(conversa, tentativaN) {
    const prompt = `Você é SDR enxuto, brasileiro, tom executivo e direto (sem chavão, sem emoji).
Lead: ${conversa.razao_social || 'empresa'} (${conversa.nicho || 'segmento não classificado'})
Mensagem original enviada: "${conversa.mensagem.slice(0, 400)}"
Follow-up número ${tentativaN + 1} de 3. Não soar desesperado, não repetir o pitch — só puxar resposta.
Máximo 3 linhas. Devolva APENAS o texto da mensagem, sem comentários.`;

    const res = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      }),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return texto.trim().replace(/^"|"$/g, '') || TEMPLATE_FOLLOWUP[tentativaN];
  }
}

module.exports = SdrNeural;
