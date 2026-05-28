// CNPJ Finder — busca CNPJs novos por filtros ICP (CNAE+UF+porte+capital).
// Fontes (em ordem):
//   1. Dump Receita local (SQLite separado em /data/receita-cnpj.db) — GRATUITO, sem bloqueio
//   2. Casa dos Dados API (gratuita) — frequentemente bloqueada por Cloudflare
//
// Configura RECEITA_DB_PATH=/data/receita-cnpj.db no env do Coolify
// pra ativar dump local.

const AgenteBase = require('./base');
const path = require('path');
const fs = require('fs');

const CASA_DOS_DADOS = 'https://api.casadosdados.com.br/v2/public/cnpj/search';

class CnpjFinder extends AgenteBase {
  constructor(db) {
    super(db, 'cnpj_finder');
    this.timeoutMs = 300000;
    this._receitaDb = null;
  }

  _getReceitaDb() {
    if (this._receitaDb !== null) return this._receitaDb;
    const dbPath = process.env.RECEITA_DB_PATH || path.join(__dirname, '..', 'data', 'receita-cnpj.db');
    if (!fs.existsSync(dbPath)) { this._receitaDb = false; return false; }
    try {
      const Database = require('better-sqlite3');
      this._receitaDb = new Database(dbPath, { readonly: true, fileMustExist: true });
      this._receitaDb.pragma('cache_size = -32000');
      console.log(`[cnpj_finder] dump Receita conectado: ${dbPath}`);
      return this._receitaDb;
    } catch (e) {
      console.warn(`[cnpj_finder] erro abrindo dump: ${e.message}`);
      this._receitaDb = false;
      return false;
    }
  }

  async execute(input = {}) {
    const clienteSlug = input.cliente_slug || 'l2-automation';
    const limite = input.limite || 50;

    let nichos;
    if (input.nicho_alvo_id) {
      nichos = this.db.prepare('SELECT * FROM nichos_alvo WHERE id = ?').all(input.nicho_alvo_id);
    } else {
      nichos = this.db.prepare(`SELECT * FROM nichos_alvo WHERE cliente_slug = ? AND ativo = 1`).all(clienteSlug);
    }

    if (nichos.length === 0) {
      return { encontrados: 0, mensagem: `Sem nichos ICP cadastrados pra ${clienteSlug}. Use /admin/config.` };
    }

    const receita = this._getReceitaDb();
    const stats = { fonte: receita ? 'receita_dump' : 'casa_dos_dados', encontrados: 0, novos: 0, ja_existiam: 0, por_nicho: [] };
    const Prospector = require(path.join(__dirname, 'prospector.js'));
    const prospector = new Prospector(this.db);

    for (const n of nichos) {
      const cnaes = this._parse(n.cnae_filtros);
      const ufs = this._parse(n.uf_filtros);
      const portes = this._parse(n.porte_filtros);

      let cnpjsBrutos = [];

      if (receita) {
        cnpjsBrutos = this._buscarDumpReceita(receita, { cnaes, ufs, portes, capital_min: n.capital_min, limite });
      } else {
        // Fallback Casa dos Dados
        const combos = this._cartesiano(cnaes.length ? cnaes : [null], ufs.length ? ufs : [null]);
        for (const [cnae, uf] of combos.slice(0, 6)) {
          try {
            const list = await this._buscarCasaDosDados({ cnae, uf, porte: portes[0] }, Math.ceil(limite / combos.length));
            cnpjsBrutos.push(...list);
          } catch (e) {
            console.warn(`[cnpj_finder] CDD falhou pra ${cnae}/${uf}: ${e.message}`);
          }
        }
      }

      const unicos = [...new Set(cnpjsBrutos)].slice(0, limite);
      if (unicos.length === 0) {
        stats.por_nicho.push({ nicho: n.nome, encontrados: 0 });
        continue;
      }

      const placeholders = unicos.map(() => '?').join(',');
      const existentes = new Set(
        this.db.prepare(`SELECT cnpj FROM leads WHERE cnpj IN (${placeholders})`).all(...unicos).map(r => r.cnpj)
      );
      const novos = unicos.filter(c => !existentes.has(c));
      stats.ja_existiam += existentes.size;

      if (novos.length > 0) {
        // Se temos dump Receita, JÁ TEMOS os dados completos — não precisa chamar BrasilAPI
        if (receita) {
          this._inserirDireto(receita, novos, n);
          stats.novos += novos.length;
        } else {
          prospector.run({ cnpjs: novos }, 'cnpj_finder').catch(e =>
            console.error(`[cnpj_finder -> prospector]`, e.message)
          );
          stats.novos += novos.length;
        }
      }
      stats.encontrados += unicos.length;
      stats.por_nicho.push({ nicho: n.nome, total: unicos.length, novos: novos.length });
    }
    return stats;
  }

  _buscarDumpReceita(receita, { cnaes, ufs, portes, capital_min, limite }) {
    const where = ['e.situacao_cadastral = "02"']; // ativa
    const params = [];

    if (cnaes.length) {
      where.push(`(${cnaes.map(() => 'e.cnae_principal LIKE ?').join(' OR ')})`);
      cnaes.forEach(c => params.push(c.replace('%', '') + '%'));
    }
    if (ufs.length) {
      where.push(`e.uf IN (${ufs.map(() => '?').join(',')})`);
      params.push(...ufs);
    }
    if (portes.length) {
      where.push(`emp.porte IN (${portes.map(() => '?').join(',')})`);
      params.push(...portes);
    }
    if (capital_min) {
      where.push('emp.capital_social >= ?');
      params.push(capital_min);
    }

    const sql = `
      SELECT e.cnpj_base || e.cnpj_ordem || e.cnpj_dv AS cnpj
      FROM receita_estabelecimento e
      LEFT JOIN receita_empresa emp ON emp.cnpj_base = e.cnpj_base
      WHERE ${where.join(' AND ')}
      ORDER BY RANDOM()
      LIMIT ?
    `;
    params.push(limite * 3); // pega mais pra filtrar duplicatas

    try {
      return receita.prepare(sql).all(...params).map(r => r.cnpj).filter(c => c && c.length === 14);
    } catch (e) {
      console.warn(`[cnpj_finder] query dump falhou: ${e.message}`);
      return [];
    }
  }

  _inserirDireto(receita, cnpjs, nicho) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO leads (cnpj, razao_social, nome_fantasia, email, telefone, cidade, uf, cep,
        cnae_principal, cnae_descricao, porte, capital_social, data_abertura, origem, nicho, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cnpj_finder', ?, ?)
    `);

    for (const cnpj of cnpjs) {
      const base = cnpj.slice(0, 8);
      const ordem = cnpj.slice(8, 12);
      const dv = cnpj.slice(12);
      try {
        const e = receita.prepare(`SELECT * FROM receita_estabelecimento WHERE cnpj_base=? AND cnpj_ordem=? AND cnpj_dv=?`).get(base, ordem, dv);
        const emp = receita.prepare(`SELECT * FROM receita_empresa WHERE cnpj_base=?`).get(base);
        if (!e) continue;
        const telefone = e.ddd_1 && e.telefone_1 ? `(${e.ddd_1}) ${e.telefone_1}` : null;
        insert.run(
          cnpj,
          emp?.razao_social || null,
          e.nome_fantasia || null,
          e.email || null,
          telefone,
          e.municipio || null,
          e.uf || null,
          e.cep || null,
          e.cnae_principal || null,
          null, // descricao CNAE precisaria tabela auxiliar
          emp?.porte || null,
          emp?.capital_social || null,
          e.data_inicio_atividade || null,
          this._inferirNicho(e.cnae_principal),
          JSON.stringify({ fonte: 'receita_dump', nicho_alvo_id: nicho.id }),
        );
      } catch (err) {
        console.warn(`[cnpj_finder] inserir ${cnpj} falhou: ${err.message}`);
      }
    }
  }

  _inferirNicho(cnae) {
    if (!cnae) return null;
    const c = String(cnae);
    if (c.startsWith('6810') || c.startsWith('6822')) return 'imobiliaria';
    if (c.startsWith('86')) return 'saude';
    if (c.startsWith('69')) return 'advocacia';
    if (c.startsWith('70')) return 'consultoria';
    if (c.startsWith('471') || c.startsWith('472') || c.startsWith('473')) return 'varejo';
    return 'outro';
  }

  async _buscarCasaDosDados({ cnae, uf, porte }, limite = 30) {
    const body = {
      query: {
        ...(cnae && { atividade_principal: [String(cnae).replace(/\D/g, '').slice(0, 7)] }),
        ...(uf && { uf: [uf] }),
        ...(porte && { porte: [porte] }),
        situacao_cadastral: ['ATIVA'],
      },
      page: 1,
    };
    const res = await fetch(CASA_DOS_DADOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'L2-Automation/0.1' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`CDD ${res.status}`);
    const data = await res.json();
    const docs = data?.data?.docs || data?.docs || [];
    return docs.map(d => (d.cnpj || '').replace(/\D/g, '')).filter(c => c.length === 14).slice(0, limite);
  }

  _parse(s) { if (!s) return []; try { return JSON.parse(s); } catch { return []; } }
  _cartesiano(a, b) { const o = []; for (const x of a) for (const y of b) o.push([x, y]); return o; }
}

module.exports = CnpjFinder;
