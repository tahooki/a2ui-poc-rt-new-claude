# CLAUDE.md — DevOps Ops Console

## Project Overview

DevOps Ops Console: a 3-layer demo application (Admin UI + AI Copilot + Google A2UI cards).
Next.js App Router with SQLite (better-sqlite3), Vercel AI SDK, and shadcn/ui.
Korean-language UI for operator-facing devops console. Demonstrates AI-assisted incident management,
deployment rollback workflows, batch job execution, and report generation — all rendered with
Google A2UI interactive cards.

## Tech Stack

| Dependency | Purpose |
|---|---|
| next 16 | App Router framework |
| react 19 | UI rendering |
| better-sqlite3 | Single-file SQLite DB (`data/ops-console.db`) |
| ai / @ai-sdk/openai / @ai-sdk/react | Vercel AI SDK for chat streaming + tool calling |
| @a2ui/react, @a2ui/web_core | Google A2UI card renderer (vendored at `vendor/google-a2ui/`) |
| shadcn/ui + tailwindcss 4 | Component library (components in `src/components/ui/`) |
| zod 4 | Schema validation for AI tool inputs |
| recharts | Dashboard charts |
| date-fns | Date formatting |
| lucide-react | Icons |

## Project Structure

```
src/
  app/
    page.tsx                  # Landing / redirect
    layout.tsx                # Root layout
    (admin)/                  # Admin pages (dashboard, incidents, deployments, jobs, reports, audit)
      layout.tsx              # Sidebar + header shell
    api/
      chat/route.ts           # AI chat endpoint (OpenAI streaming, local fallback)
      a2ui-action/route.ts    # A2UI button action handler
      incidents/              # CRUD + status transitions
      deployments/            # CRUD + rollback trigger
      jobs/                   # Job runs CRUD
      reports/                # Reports CRUD
      operators/              # Operator listing
      services/               # Service listing
      audit-logs/             # Audit log queries
      admin/                  # Scenario load/reset endpoint
  components/
    a2ui/a2ui-card-renderer.tsx  # Bridges AI tool results → A2UIViewer
    chat/chat-panel.tsx          # Copilot chat drawer
    admin/                       # Sidebar, header, operator-switcher
    ui/                          # shadcn/ui primitives
  server/
    db.ts                     # SQLite schema init + all query helpers
    ai/system-prompt.ts       # Context-aware system prompt builder
    ai/tools.ts               # 14 Vercel AI SDK tools (query + render)
    scenarios/                # 4 seed scenarios + verify logic
    mappers/                  # DB row → domain object mappers
  lib/
    a2ui-bridge.ts            # Pure JSON builders for 6 A2UI card types
    operators.ts              # Operator constants
    utils.ts                  # cn() helper
  types/domain.ts             # TypeScript interfaces for all domain entities
  hooks/use-mobile.ts         # Responsive hook
scripts/
  scenario-cli.mjs            # CLI: load/reset/verify/list scenarios
  playwright-smoke.mjs         # Smoke test runner
vendor/google-a2ui/           # Vendored A2UI packages (react, web_core, specification)
data/ops-console.db           # SQLite database file (gitignored contents)
```

## Key Commands

```bash
npm run dev                  # Start dev server (localhost:3000)
npm run build                # Production build
npm run scenario:load -- checkout-5xx   # Load a specific scenario
npm run scenario:load -- --all          # Load all 4 scenarios
npm run scenario:reset                  # Wipe DB and reload all scenarios
npm run scenario:verify                 # Verify scenario data integrity
npm run scenario:list                   # List available scenarios
npm run test:smoke                      # Playwright smoke tests
```

## Architecture

### 3 Layers
1. **Admin Pages** (`src/app/(admin)/`) — table views for incidents, deployments, jobs, reports, audit logs
2. **AI Copilot** (`src/components/chat/`) — context-aware chat panel using Vercel AI SDK with 14 tools
3. **A2UI Cards** (`src/lib/a2ui-bridge.ts` + `src/components/a2ui/`) — interactive Google A2UI cards for rollback summaries, evidence comparison, dry-run steppers, confirm dialogs, job reviews, report templates

### Data Flow
- SQLite single-file DB at `data/ops-console.db` with WAL mode
- Schema auto-created on first access (`src/server/db.ts`)
- 4 test scenarios seeded via `scripts/scenario-cli.mjs`: `checkout-5xx`, `billing-backfill`, `healthy-rollout`, `incident-handover`
- Chat API (`/api/chat`) streams via OpenAI gpt-4o-mini; falls back to local DB summary when no API key

### A2UI Card Pipeline
`AI tool execute()` returns `{ type: 'a2ui_render', cardType, cardData }` → `a2ui-card-renderer.tsx` calls the matching `build*Card()` from `a2ui-bridge.ts` → produces `{ root, components, data }` → passed to `<A2UIViewer />` (dynamically imported, client-only)

### 6 Card Types
- `buildRollbackSummaryCard` — deployment info + risk checks + rollback plan (tabbed)
- `buildEvidenceComparisonCard` — incident evidence grouped by type
- `buildDryRunStepperCard` — step-by-step rollback dry-run progress
- `buildConfirmActionCard` — checklist confirmation before dangerous ops
- `buildJobSpecReviewCard` — job spec + params + dry-run results
- `buildReportTemplateCard` — report section picker with checkboxes

## Development Patterns

- **API routes**: NextRequest/NextResponse in `src/app/api/`. All mutations log to `audit_logs` table.
- **State machines**: incidents (`open→investigating→mitigated→resolved→closed`), deployments (`pending→running→succeeded/failed→rolled_back`), rollback plans (`draft→dry_run_ready→approved→executed`), jobs (`draft→dry_run_ready→approved→running→done`)
- **Role-based access**: 4 roles (`oncall_engineer`, `release_manager`, `ops_engineer`, `support_lead`). Operator switcher in header; role checked on mutations.
- **AI tools** (`src/server/ai/tools.ts`): 8 query tools + 6 render tools. Render tools return card definitions that the client interprets.
- **System prompt**: dynamically built per page context with Korean-language guidance and suggested questions.
- **A2UI bridge**: pure data functions (no React imports) that build component trees as JSON following Google A2UI web_core schema (StringValue, Children, Button with actions, CheckBox, Tabs).

## Important Files

| File | Description |
|---|---|
| `src/server/db.ts` | SQLite schema (20+ tables), all query/mutation helpers |
| `src/server/ai/tools.ts` | 14 AI tools: incident/deployment/job queries + 6 A2UI card renderers |
| `src/server/ai/system-prompt.ts` | Context-aware Korean system prompt builder |
| `src/lib/a2ui-bridge.ts` | 6 A2UI card builder functions (pure JSON, no React) |
| `src/components/a2ui/a2ui-card-renderer.tsx` | Client component bridging tool results → `<A2UIViewer />` |
| `src/components/chat/chat-panel.tsx` | AI Copilot chat drawer with useChat hook |
| `src/app/api/chat/route.ts` | Chat streaming endpoint with OpenAI fallback |
| `src/app/api/a2ui-action/route.ts` | Handler for A2UI button actions (rollback, approve, etc.) |
| `src/server/scenarios/index.ts` | Scenario registry and load/verify orchestration |
| `src/types/domain.ts` | All TypeScript domain interfaces |
| `scripts/scenario-cli.mjs` | CLI for DB scenario management |
| `src/app/(admin)/layout.tsx` | Admin shell with sidebar + chat panel |
