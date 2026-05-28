-- L2 Automation — Schema inicial
-- Stack: SQLite (better-sqlite3)
-- Convenções: snake_case, TEXT pra IDs, TIMESTAMP em UTC

-- ============================================================
-- AGENTES — registro dos agentes do sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS agentes (
  nome TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'aguardando', -- aguardando | rodando | recente | pronto | degradado
  ultimo_run TIMESTAMP,
  proximo_run TIMESTAMP,
  cron_ativo INTEGER DEFAULT 0,
  cron_expr TEXT,                    -- ex: '0 8 * * *'
  runs_24h INTEGER DEFAULT 0,
  erros_24h INTEGER DEFAULT 0,
  ultimo_erro TEXT,
  ultimo_modo TEXT,                  -- modo da última execução (ex: 'manual', 'cron', 'evento')
  ultimo_cliente TEXT,               -- pra futuro multi-tenant
  segundos_desde_ultimo INTEGER,
  config TEXT,                       -- JSON com config específica
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- RUNS — logs estruturados de cada execução
-- ============================================================
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agente TEXT NOT NULL,
  inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fim TIMESTAMP,
  duracao_ms INTEGER,
  status TEXT,                       -- sucesso | erro | timeout | cancelado
  input TEXT,                        -- JSON
  output TEXT,                       -- JSON
  erro TEXT,
  stack_trace TEXT,
  retry_count INTEGER DEFAULT 0,
  modo TEXT,                         -- manual | cron | evento | recovery
  FOREIGN KEY (agente) REFERENCES agentes(nome)
);

CREATE INDEX IF NOT EXISTS idx_runs_agente_inicio ON runs(agente, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

-- ============================================================
-- LEADS — empresas prospectadas
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj TEXT UNIQUE,
  razao_social TEXT,
  nome_fantasia TEXT,
  email TEXT,
  email_decision_maker TEXT,
  telefone TEXT,
  whatsapp TEXT,
  linkedin_url TEXT,
  site TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  cnae_principal TEXT,
  cnae_descricao TEXT,
  porte TEXT,                        -- MEI | EPP | ME | DEMAIS
  capital_social REAL,
  data_abertura TEXT,
  data_coleta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_enrichment TIMESTAMP,
  data_primeiro_contato TIMESTAMP,
  data_resposta TIMESTAMP,
  status TEXT DEFAULT 'novo',        -- novo | enriquecido | contatado | respondeu | qualificado | reuniao | cliente | descartado | negado
  score INTEGER,                     -- 0-100 (BANT score)
  origem TEXT,                       -- prospector | manual | integracao | indicacao
  nicho TEXT,                        -- imobiliaria | clinica | etc
  metadata TEXT                      -- JSON
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_nicho ON leads(nicho);
CREATE INDEX IF NOT EXISTS idx_leads_uf ON leads(uf);

-- ============================================================
-- CONVERSAS — mensagens trocadas com leads (LinkedIn, Email, WhatsApp)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  canal TEXT NOT NULL,               -- linkedin | email | whatsapp | sms
  direcao TEXT NOT NULL,             -- enviada | recebida
  mensagem TEXT NOT NULL,
  assunto TEXT,                      -- pra email
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  agente_origem TEXT,                -- qual agente mandou (se enviada)
  resposta_em_segundos INTEGER,
  template_id TEXT,
  abertura INTEGER DEFAULT 0,        -- pra email (1 se foi aberto)
  clique INTEGER DEFAULT 0,          -- pra email/linkedin (1 se clicou link)
  metadata TEXT,                     -- JSON
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_conversas_lead ON conversas(lead_id, timestamp DESC);

-- ============================================================
-- FAILURES — memória de padrões de erro pra autoaprendizado
-- ============================================================
CREATE TABLE IF NOT EXISTS failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agente TEXT NOT NULL,
  padrao_erro TEXT,                  -- hash ou descrição normalizada do erro
  erro_completo TEXT,                -- mensagem original
  contexto TEXT,                     -- JSON do input que gerou o erro
  resolucao_tentada TEXT,            -- o que o sistema fez pra resolver
  resolucao_funcionou INTEGER,       -- 0 ou 1
  ocorrencias INTEGER DEFAULT 1,
  primeiro_caso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_caso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolvido_em TIMESTAMP,
  diagnostico_ia TEXT,               -- análise do Gemini/Claude
  FOREIGN KEY (agente) REFERENCES agentes(nome)
);

CREATE INDEX IF NOT EXISTS idx_failures_agente ON failures(agente);
CREATE INDEX IF NOT EXISTS idx_failures_padrao ON failures(padrao_erro);

-- ============================================================
-- EVENTOS — fila de eventos pra trigger de agentes
-- ============================================================
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                -- lead_novo | mensagem_recebida | timeout | erro_agente | etc
  origem TEXT,                       -- agente ou sistema que emitiu
  payload TEXT,                      -- JSON
  processado INTEGER DEFAULT 0,
  agente_responsavel TEXT,           -- qual agente deve processar
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processado_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventos_pendentes ON eventos(processado, created_at) WHERE processado = 0;
