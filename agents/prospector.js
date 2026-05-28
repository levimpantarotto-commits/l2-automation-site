// Prospector — enriquece CNPJs via BrasilAPI (gratuita)
// Input: { cnpjs: ['12345678000190', ...] } OU { cnpjs_brutos: 'string com cnpjs separados por \\n' }
// Output: { coletados, novos, atualizados, erros }
const AgenteBase = require('./base');

const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';
const DELAY_BETWEEN_REQ_MS = 1500; // rate limit gentil (~40 req/min)

class Prospector extends AgenteBase {
  constructor(db) {
    super(db, 'prospector');
    this.timeoutMs = 300000; // 5 min — pode processar muitos CNPJs
  }

  async execute(input = {}) {
    let cnpjs = input.cnpjs || [];

    // Aceita string solta com CNPJs separados por linha/vírgula/espaço
    if (input.cnpjs_brutos) {
      cnpjs = input.cnpjs_brutos
        .split(/[\s,;\n]+/)
        .map(c => c.replace(/\D/g, ''))
        .filter(c => c.length === 14);
    }

    // Sanitiza
    cnpjs = cnpjs.map(c => String(c).replace(/\D/g, '')).filter(c => c.length === 14);
    cnpjs = [...new Set(cnpjs)]; // dedupe

    if (cnpjs.length === 0) {
      return { erro: 'nenhum CNPJ valido recebido', exemplo_input: { cnpjs: ['12345678000190'] } };
    }

    const stats = { total: cnpjs.length, novos: 0, atualizados: 0, erros: 0, detalhes: [] };

    for (const cnpj of cnpjs) {
      try {
        const data = await this._buscarCNPJ(cnpj);
        const saved = this._salvarLead(cnpj, data);
        if (saved.novo) stats.novos++; else stats.atualizados++;
        stats.detalhes.push({ cnpj, razao: data.razao_social, status: saved.novo ? 'novo' : 'atualizado' });

        // Rate limit
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQ_MS));
      } catch (e) {
        stats.erros++;
        stats.detalhes.push({ cnpj, erro: e.message });
        console.warn(`[prospector] CNPJ ${cnpj} falhou:`, e.message);
      }
    }

    return stats;
  }

  async _buscarCNPJ(cnpj) {
    const url = `${BRASIL_API_BASE}/${cnpj}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'L2-Automation/0.1' }
    });
    if (!res.ok) throw new Error(`BrasilAPI ${res.status}: ${await res.text().catch(() => '')}`);
    return await res.json();
  }

  _salvarLead(cnpj, data) {
    const existing = this.db.prepare('SELECT id FROM leads WHERE cnpj = ?').get(cnpj);

    const lead = {
      cnpj,
      razao_social: data.razao_social || null,
      nome_fantasia: data.nome_fantasia || null,
      email: data.email || null,
      telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1})` : null,
      cidade: data.municipio || null,
      uf: data.uf || null,
      cep: data.cep ? String(data.cep).replace(/\D/g, '') : null,
      cnae_principal: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
      cnae_descricao: data.cnae_fiscal_descricao || null,
      porte: data.porte || null,
      capital_social: data.capital_social || null,
      data_abertura: data.data_inicio_atividade || null,
      origem: 'prospector',
      nicho: this._inferirNicho(data.cnae_fiscal, data.cnae_fiscal_descricao),
      metadata: JSON.stringify({
        situacao_cadastral: data.descricao_situacao_cadastral,
        natureza_juridica: data.natureza_juridica,
        opcao_simples: data.opcao_pelo_simples,
        socios: (data.qsa || []).slice(0, 3).map(s => s.nome_socio),
      }),
    };

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE leads SET
          razao_social = COALESCE(@razao_social, razao_social),
          nome_fantasia = COALESCE(@nome_fantasia, nome_fantasia),
          email = COALESCE(@email, email),
          telefone = COALESCE(@telefone, telefone),
          cidade = COALESCE(@cidade, cidade),
          uf = COALESCE(@uf, uf),
          cep = COALESCE(@cep, cep),
          cnae_principal = COALESCE(@cnae_principal, cnae_principal),
          cnae_descricao = COALESCE(@cnae_descricao, cnae_descricao),
          porte = COALESCE(@porte, porte),
          capital_social = COALESCE(@capital_social, capital_social),
          data_abertura = COALESCE(@data_abertura, data_abertura),
          nicho = COALESCE(@nicho, nicho),
          metadata = @metadata
        WHERE cnpj = @cnpj
      `);
      stmt.run(lead);
      return { novo: false, id: existing.id };
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO leads (
          cnpj, razao_social, nome_fantasia, email, telefone,
          cidade, uf, cep, cnae_principal, cnae_descricao, porte,
          capital_social, data_abertura, origem, nicho, metadata
        ) VALUES (
          @cnpj, @razao_social, @nome_fantasia, @email, @telefone,
          @cidade, @uf, @cep, @cnae_principal, @cnae_descricao, @porte,
          @capital_social, @data_abertura, @origem, @nicho, @metadata
        )
      `);
      const result = stmt.run(lead);
      // Emite evento pra Maestro processar
      this.emitirEvento('lead_novo', { lead_id: result.lastInsertRowid, cnpj });
      return { novo: true, id: result.lastInsertRowid };
    }
  }

  _inferirNicho(cnae, descricao) {
    if (!cnae) return null;
    const c = String(cnae);
    const desc = (descricao || '').toLowerCase();

    // Mapeamento CNAE → nicho (apenas os principais pro L2)
    if (c.startsWith('6810') || desc.includes('imobili')) return 'imobiliaria';
    if (c.startsWith('86') || desc.includes('clinic') || desc.includes('saude')) return 'saude';
    if (c.startsWith('69') || desc.includes('advocac') || desc.includes('jurid')) return 'advocacia';
    if (c.startsWith('70') || desc.includes('consultor')) return 'consultoria';
    if (c.startsWith('471') || c.startsWith('472') || c.startsWith('473')) return 'varejo';

    return 'outro';
  }
}

module.exports = Prospector;
