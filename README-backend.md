# L2 Automation — Sistema Autônomo

Backend Node.js que orquestra agentes para prospecção, qualificação e venda B2B autônoma.

## Stack
- Node 22 + Express
- SQLite (better-sqlite3)
- Sem framework frontend (HTML/JS vanilla no `/public`)
- Docker pra Coolify

## Estrutura
```
.
├── server.js              # Express + APIs
├── Dockerfile             # build pro Coolify
├── package.json
├── db/
│   └── schema.sql         # tabelas SQLite
├── scripts/
│   └── init-db.js         # cria DB + popula agentes
├── agents/
│   ├── base.js            # classe base com auto-healing
│   └── prospector.js      # busca CNPJs via BrasilAPI
└── public/
    └── index.html         # painel admin
```

## Rotas
- `GET /api/saude` — healthcheck
- `GET /api/agentes/status` — lista agentes (compatível com escritório 3D)
- `POST /api/agentes/:nome/run` — dispara agente
- `GET /api/leads` — lista leads
- `GET /api/runs?agente=X` — logs de execução
- `GET /api/failures` — padrões de erro aprendidos
- `POST /api/maestro` — terminal interativo

## Auto-healing
Todo agente herda de `AgenteBase` que provê automaticamente:
- Logs estruturados em `runs`
- Retry com backoff exponencial (3 tentativas)
- Registro de padrões de falha em `failures` (memória pra autoaprendizado)
- Update de status em `agentes`

## Local
```
npm install
node server.js
# http://localhost:3004/
```

## Deploy
Coolify v4 — push pra main dispara build via Dockerfile.
