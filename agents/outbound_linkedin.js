// Outbound LinkedIn — stub: integração real depende de Playwright + sessão LinkedIn.
// Por enquanto: registra dry-run em conversas pra alimentar pipeline e gerar UI.
// Próxima iteração: subir worker Playwright separado, login com cookies salvos.

const AgenteBase = require('./base');

class OutboundLinkedin extends AgenteBase {
  constructor(db) {
    super(db, 'outbound_linkedin');
    this.timeoutMs = 30000;
  }

  async execute(input = {}) {
    const leads = this.db.prepare(`
      SELECT * FROM leads
      WHERE linkedin_url IS NOT NULL
        AND status IN ('enriquecido','contatado')
      ORDER BY data_enrichment DESC LIMIT 5
    `).all();

    if (leads.length === 0) {
      return { processados: 0, mensagem: 'Nenhum lead com linkedin_url. Stub não navega LinkedIn ainda.' };
    }

    let registrados = 0;
    for (const lead of leads) {
      const msg = `Olá ${lead.razao_social || ''}! Vi seu perfil e queria trocar uma ideia rápida sobre como automatizar prospecção no seu segmento. Faz sentido?`;
      this.db.prepare(`
        INSERT INTO conversas (lead_id, canal, direcao, mensagem, agente_origem, status, ultimo_msg)
        VALUES (?, 'linkedin', 'enviada', ?, 'outbound_linkedin_dryrun', 'aguardando_resposta', CURRENT_TIMESTAMP)
      `).run(lead.id, msg);
      registrados++;
    }

    return {
      processados: registrados,
      modo: 'dry_run',
      aviso: 'Integração Playwright LinkedIn pendente — mensagens registradas mas não enviadas.',
    };
  }
}

module.exports = OutboundLinkedin;
