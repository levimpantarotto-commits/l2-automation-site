// Agente base — wrapper de auto-healing
// Todo agente herda dessa classe pra ter automaticamente:
// - logs estruturados em runs
// - retry com backoff exponencial
// - registro de falhas em failures (pra autoaprendizado)
// - update de status na tabela agentes

class AgenteBase {
  constructor(db, nome) {
    if (new.target === AgenteBase) throw new Error('AgenteBase é abstrata');
    this.db = db;
    this.nome = nome || this.constructor.name.toLowerCase();
    this.maxRetries = 3;
    this.timeoutMs = 60000; // 60s default
  }

  // === MÉTODO PRINCIPAL — sobrescrever em cada agente ===
  // Recebe input (objeto qualquer) e retorna output (objeto qualquer).
  // Throw em erro pra acionar retry/learn.
  async execute(input) {
    throw new Error(`Agente ${this.nome} não implementou execute()`);
  }

  // === RUN — wrapper que faz auto-healing em volta do execute() ===
  async run(input = {}, modo = 'manual') {
    const runId = this._iniciarRun(input, modo);
    this._setStatus('rodando');

    let attempt = 0;
    let lastError = null;
    let output = null;

    while (attempt < this.maxRetries) {
      try {
        // Consulta memória de falhas — esse input já quebrou antes?
        const failureKnown = this._buscarFalhaConhecida(input);
        if (failureKnown && failureKnown.resolucao_funcionou) {
          console.log(`[${this.nome}] padrão de falha conhecido com resolução: ${failureKnown.resolucao_tentada}`);
        }

        const startMs = Date.now();
        output = await this._executeWithTimeout(input);
        const duracaoMs = Date.now() - startMs;

        this._finalizarRun(runId, 'sucesso', output, null, attempt, duracaoMs);
        this._setStatus('recente');
        console.log(`[${this.nome}] OK em ${duracaoMs}ms (tentativa ${attempt + 1})`);
        return output;
      } catch (err) {
        lastError = err;
        attempt++;
        console.warn(`[${this.nome}] tentativa ${attempt}/${this.maxRetries} falhou: ${err.message}`);

        if (attempt < this.maxRetries) {
          // Backoff exponencial: 2s, 4s, 8s
          const backoffMs = 2000 * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }
    }

    // Esgotou retries — registra falha
    this._finalizarRun(runId, 'erro', null, lastError, attempt - 1);
    this._registrarFalha(input, lastError);
    this._setStatus('degradado', lastError.message);
    console.error(`[${this.nome}] FALHOU após ${attempt} tentativas: ${lastError.message}`);

    throw lastError;
  }

  // === Execute com timeout ===
  async _executeWithTimeout(input) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout ${this.timeoutMs}ms excedido`)), this.timeoutMs);
      this.execute(input)
        .then(out => { clearTimeout(timer); resolve(out); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  // === Inicia registro de run ===
  _iniciarRun(input, modo) {
    const stmt = this.db.prepare(`
      INSERT INTO runs (agente, status, input, modo)
      VALUES (?, 'rodando', ?, ?)
    `);
    const result = stmt.run(this.nome, JSON.stringify(input).slice(0, 5000), modo);
    return result.lastInsertRowid;
  }

  // === Finaliza registro de run ===
  _finalizarRun(runId, status, output, erro, retryCount, duracaoMs) {
    const stmt = this.db.prepare(`
      UPDATE runs SET
        fim = CURRENT_TIMESTAMP,
        duracao_ms = ?,
        status = ?,
        output = ?,
        erro = ?,
        stack_trace = ?,
        retry_count = ?
      WHERE id = ?
    `);
    stmt.run(
      duracaoMs || null,
      status,
      output ? JSON.stringify(output).slice(0, 5000) : null,
      erro ? erro.message : null,
      erro ? (erro.stack || '').slice(0, 3000) : null,
      retryCount || 0,
      runId
    );
  }

  // === Atualiza status do agente ===
  _setStatus(status, erro = null) {
    const stmt = this.db.prepare(`
      UPDATE agentes SET
        status = ?,
        ultimo_run = CURRENT_TIMESTAMP,
        ultimo_erro = COALESCE(?, ultimo_erro),
        runs_24h = (SELECT COUNT(*) FROM runs WHERE agente = ? AND inicio > datetime('now', '-1 day')),
        erros_24h = (SELECT COUNT(*) FROM runs WHERE agente = ? AND status = 'erro' AND inicio > datetime('now', '-1 day')),
        updated_at = CURRENT_TIMESTAMP
      WHERE nome = ?
    `);
    stmt.run(status, erro, this.nome, this.nome, this.nome);
  }

  // === Registra padrão de falha (auto-aprendizado) ===
  _registrarFalha(input, erro) {
    // Padrão = primeira linha da mensagem de erro, sem detalhes específicos
    const padrao = (erro.message || 'erro desconhecido').split(':')[0].slice(0, 200);

    const existing = this.db.prepare('SELECT id, ocorrencias FROM failures WHERE agente = ? AND padrao_erro = ?').get(this.nome, padrao);

    if (existing) {
      this.db.prepare(`
        UPDATE failures SET
          ocorrencias = ocorrencias + 1,
          ultimo_caso = CURRENT_TIMESTAMP,
          erro_completo = ?
        WHERE id = ?
      `).run(erro.message, existing.id);
    } else {
      this.db.prepare(`
        INSERT INTO failures (agente, padrao_erro, erro_completo, contexto)
        VALUES (?, ?, ?, ?)
      `).run(this.nome, padrao, erro.message, JSON.stringify(input).slice(0, 2000));
    }
  }

  // === Busca padrão de falha conhecido ===
  _buscarFalhaConhecida(input) {
    // Versão simples: por agente. Próxima versão usa similaridade no input.
    return this.db.prepare(`
      SELECT * FROM failures
      WHERE agente = ? AND resolucao_tentada IS NOT NULL
      ORDER BY ultimo_caso DESC LIMIT 1
    `).get(this.nome);
  }

  // === Helper pra emitir evento ===
  emitirEvento(tipo, payload, agenteResponsavel = null) {
    this.db.prepare(`
      INSERT INTO eventos (tipo, origem, payload, agente_responsavel)
      VALUES (?, ?, ?, ?)
    `).run(tipo, this.nome, JSON.stringify(payload), agenteResponsavel);
  }
}

module.exports = AgenteBase;
