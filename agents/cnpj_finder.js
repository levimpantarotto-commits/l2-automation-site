// CNPJ Finder — busca CNPJs novos por filtros (CNAE, UF, porte, capital).
// Fonte primária: Casa dos Dados (API gratuita, sem chave).
// Fallback: deixa o canal explícito de "fonte não conectada".
//
// Roda por cliente: pra cada nicho_alvo ativo, busca N CNPJs novos e joga na fila do Prospector.
//
// Input: { cliente_slug?: string, limite?: number, nicho_alvo_id?: number }

const AgenteBase = require('./base');

const CASA_DOS_DADOS = 'https://api.casadosdados.com.br/v2/public/cnpj/search';

class CnpjFinder extends AgenteBase {
  constructor(db) {
    super(db, 'cnpj_finder');
    this.timeoutMs = 300000;
  }

  async execute(input = {}) {
    const clienteSlug = input.cliente_slug || 'l2-automation';
    const limite = input.limite || 50;

    let nichos;
    if (input.nicho_alvo_id) {
      nichos = this.db.prepare('SELECT * FROM nichos_alvo WHERE id = ?').all(input.nicho_alvo_id);
    } else {
      nichos = this.db.prepare(`
        SELECT * FROM nichos_alvo WHERE cliente_slug = ? AND ativo = 1
      `).all(clienteSlug);
    }

    if (nichos.length === 0) {
      return { encontrados: 0, mensagem: `Nenhum nicho_alvo cadastrado pra ${clienteSlug}. Cadastre via /api/nichos.` };
    }

    const stats = { encontrados: 0, novos: 0, ja_existiam: 0, por_nicho: [] };
    const prospectorPath = require('path').join(__dirname, 'prospector.js');
    const Prospector = require(prospectorPath);
    const prospector = new Prospector(this.db);

    for (const n of nichos) {
      const cnaes = this._parse(n.cnae_filtros);
      const ufs = this._parse(n.uf_filtros);
      const portes = this._parse(n.porte_filtros);

      const cnpjsBrutos = [];

      // Casa dos Dados aceita 1 CNAE + 1 UF por query. Itera combinações.
      const combos = this._cartesiano(cnaes.length ? cnaes : [null], ufs.length ? ufs : [null]);
      for (const [cnae, uf] of combos.slice(0, 6)) { // limita pra não floodar
        try {
          const list = await this._buscarCasaDosDados({ cnae, uf, porte: portes[0] }, Math.ceil(limite / combos.length));
          cnpjsBrutos.push(...list);
        } catch (e) {
          console.warn(`[cnpj_finder] Casa dos Dados falhou pra ${cnae}/${uf}: ${e.message}`);
        }
      }

      const unicos = [...new Set(cnpjsBrutos)].slice(0, limite);
      if (unicos.length === 0) {
        stats.por_nicho.push({ nicho: n.nome, encontrados: 0 });
        continue;
      }

      // Filtra os que já existem
      const placeholders = unicos.map(() => '?').join(',');
      const existentes = new Set(
        this.db.prepare(`SELECT cnpj FROM leads WHERE cnpj IN (${placeholders})`).all(...unicos).map(r => r.cnpj)
      );
      const novos = unicos.filter(c => !existentes.has(c));
      stats.ja_existiam += existentes.size;

      if (novos.length > 0) {
        // Dispara prospector pra enriquecer (em background pra não bloquear)
        prospector.run({ cnpjs: novos }, 'cnpj_finder').catch(e =>
          console.error(`[cnpj_finder -> prospector]`, e.message)
        );
        stats.novos += novos.length;
      }

      stats.encontrados += unicos.length;
      stats.por_nicho.push({ nicho: n.nome, total: unicos.length, novos: novos.length });
    }

    return stats;
  }

  async _buscarCasaDosDados({ cnae, uf, porte }, limite = 30) {
    const body = {
      query: {
        ...(cnae && { atividade_principal: [String(cnae).replace(/\D/g, '').slice(0, 7)] }),
        ...(uf && { uf: [uf] }),
        ...(porte && { porte: [porte] }),
        situacao_cadastral: ['ATIVA'],
        somente_mei: false,
        com_email: false,
      },
      page: 1,
      // Casa dos Dados não documenta limite mas geralmente respeita até ~30
    };

    const res = await fetch(CASA_DOS_DADOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'L2-Automation/0.1' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`CasaDosDados ${res.status}`);
    const data = await res.json();
    const docs = data?.data?.docs || data?.docs || [];
    return docs
      .map(d => (d.cnpj || '').replace(/\D/g, ''))
      .filter(c => c.length === 14)
      .slice(0, limite);
  }

  _parse(s) {
    if (!s) return [];
    try { return JSON.parse(s); } catch { return []; }
  }

  _cartesiano(a, b) {
    const out = [];
    for (const x of a) for (const y of b) out.push([x, y]);
    return out;
  }
}

module.exports = CnpjFinder;
