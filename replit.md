# Protocolo de Estabilidade — Alphafitus

Full-stack web application for managing stability protocols (Protocolo de Estabilidade) for Brazilian nutraceutical dietary supplement capsules.

## Architecture

**Monorepo** managed by pnpm workspaces.

| Layer | Package | Path | Port |
|-------|---------|------|------|
| Frontend | `@workspace/protocolo-estabilidade` | `artifacts/protocolo-estabilidade` | $PORT (21362 dev) |
| Backend API | `@workspace/api-server` | `artifacts/api-server` | 8080 |
| DB lib | `@workspace/db` | `lib/db` | — |
| Zod schemas | `@workspace/api-zod` | `lib/api-zod` | — |
| React Query hooks | `@workspace/api-client-react` | `lib/api-client-react` | — |
| OpenAPI spec | `@workspace/api-spec` | `lib/api-spec` | — |

All traffic routes through the shared reverse proxy on port 80:
- `/api/*` → API server
- `/*` → Frontend (Vite)

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui components
- **Backend**: Express 5 + TypeScript + Drizzle ORM
- **Database**: PostgreSQL (via `DATABASE_URL` env var)
- **API contract**: OpenAPI 3.0 spec → Orval codegen (Zod schemas + React Query hooks)
- **Theme**: Deep navy (`--primary: 215 40% 25%`)

## Database Schema

Three tables in PostgreSQL:

- `protocols` — main protocol record (company info, product info, study parameters, status, conclusion)
- `lots` — pilot lots associated with a protocol
- `analysis_results` — analysis results per lot × time period × parameter

Run `pnpm --filter @workspace/db run push` to apply schema changes.

## API Endpoints

All prefixed with `/api`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/protocols` | List all protocols |
| GET | `/protocols/stats` | Dashboard statistics |
| POST | `/protocols` | Create protocol |
| GET | `/protocols/:id` | Get protocol with lots + results |
| PUT | `/protocols/:id` | Update protocol |
| DELETE | `/protocols/:id` | Delete protocol |
| POST | `/protocols/:id/finalize` | Set final status + conclusion |
| GET | `/protocols/:id/lots` | List lots |
| POST | `/protocols/:id/lots` | Create lot |
| PUT | `/protocols/:id/lots/:lotId` | Update lot |
| DELETE | `/protocols/:id/lots/:lotId` | Delete lot |
| GET | `/protocols/:id/results` | List analysis results |
| POST | `/protocols/:id/results` | Upsert result |
| DELETE | `/protocols/:id/results/:resultId` | Delete result |
| GET | `/protocols/:id/kinetics` | Kinetic modeling + shelf-life estimation |
| GET | `/protocols/:id/certificate` | Certificate assembly |

## Analysis Parameters (21 total)

**Fisico-Quimica**: pH, Perda por dessecação, Cor, Odor, Aparência, Cinzas totais, Dissolução, Massa média, Kcal, Sódio

**Microbiológica**: Coliformes totais, Salmonella spp., Estafilococos coagulase+, Bolores e leveduras, Escherichia coli, Enterobacteriaceae

**Teor do Ativo**: Cálcio (80% threshold), Vitamina D (80% threshold)

**Embalagem**: Torque de tampa, Selagem por indução, Integridade selagem

## Kinetic Model

First-order kinetics per ICH Q1A(R2):
- `k = -ln(C₆/C₃) / (6-3)`
- `t_validity = -ln(C_min / C₀) / k` (C_min = 80%)

## Certificate

Assembles an official Certificado de Análise with:
- Company/product identification, lot numbers
- Full analysis table with results, specifications, official reference methods
- Approval/rejection checkboxes, signatures section
- Print-ready via `window.print()` / CSS @media print

## Regenerating API Client

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck:libs
```

## Status Workflow

`rascunho` → `em_andamento` → (finalize) → `aprovado` | `reprovado`

## Backup e Restauração

Sistema de backup automático diário (protocolos, lotes e resultados de análise), acessível na página "Backup de Dados":

- **Ativado por padrão** — roda sozinho todo dia em 2 horários configuráveis (padrão 08:00 e 20:00), sem precisar solicitar manualmente. Ao subir o servidor pela primeira vez, já roda um backup imediato se nunca houve um.
- **Dupla cópia**: cada backup é salvo em `backups/` no servidor (local) **e** enviado automaticamente para o Object Storage (nuvem, fora do banco de dados) — garante recuperação mesmo em caso de invasão/perda de dados no servidor.
- **Rotação automática**: mantém os últimos 60 backups (local e nuvem), apagando os mais antigos.
- **Restauração com 1 clique** direto da nuvem (`/api/backup/cloud-restore/:filename`), sem precisar baixar/subir arquivo manualmente — ideal para recuperação rápida após um ataque.
- Também é possível baixar um backup local (.json) e restaurá-lo manualmente por upload, como alternativa.
- Implementação: `artifacts/api-server/src/lib/backup-scheduler.ts` (agendamento + cópia em nuvem), `backup-restore.ts` (lógica de restore), `routes/backup.ts` (API), `pages/backup.tsx` (UI).
