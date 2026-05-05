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
