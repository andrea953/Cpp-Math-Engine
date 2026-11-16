# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Modern Cents CPP Calculator — `artifacts/cpp-calculator`
A planner-grade Canada Pension Plan calculator for financial advisors.
- **Routes**: `/` (marketing + white paper / redirect), `/sign-in`, `/sign-up`, `/scenarios` (client index), `/clients/:id` (client workspace anchored by a scenario ID), `/scenarios/new`, `/scenarios/:id` (editor), `/compare?ids=...`, `/shared/:token` (public read-only client view, no auth)
- **Client meetings**: the workspace lists only the anchor's client scenarios, matching trimmed, case-insensitive client names; unnamed scenarios are isolated. Editor/header/comparison return links stay with the client. Showing all clients requires explicit confirmation; a tab-session anchor-ID guard prevents the index mounting after Back or reload. Unsaved editor changes are guarded during in-app navigation and browser history changes. This is a screen-sharing safeguard, not an authorization boundary.
- **Home page**: hero + 3 feature cards above the fold, followed by an in-page white paper (Part 1 — positioning, Part 2 — methodology) with a sticky table of contents and closing CTA band. Component lives at `src/components/white-paper.tsx`.
- **Auth**: Clerk (cookie-based; api-server proxies to Clerk middleware)
- **Engine**: Pure-client TypeScript CPP engine in `src/cpp/` — base + Tier 1 + Tier 2 enhancement, CRDO, disability dropout, general 17% dropout, AMPE/AYMPE, breakeven projection, PRB, and full survivor-side benefits (survivor's pension with combined-benefit cap, $2,500 death benefit, children's benefit). Constants tables for YMPE 1966–2026, YAMPE 2024–2026, survivor flat rate and children's benefit 2019–2026.
- **Persistence**: scenarios stored as JSONB in PostgreSQL (`scenariosTable`, see `lib/db/src/schema/scenarios.ts`); CRUD + duplicate + share via `/api/scenarios` exposed in OpenAPI spec. Share state lives on the row as a unique `share_token` column; planners can issue or revoke a public share link from the editor toolbar.
- **Annual update**: every January the CPP figures change (benefits indexed to CPI; YMPE/YAMPE ceilings rise with wage growth). Follow `artifacts/cpp-calculator/RUNBOOK.md` to update the constants tables, white paper, and locked tests.
- **API hooks**: `useListScenarios`, `useGetScenario`, `useCreateScenario`, `useUpdateScenario`, `useDeleteScenario`, `useDuplicateScenario` from `@workspace/api-client-react`.

### API Server — `artifacts/api-server`
Express 5 backend serving `/api/*`. Wires Clerk middleware, exposes scenarios CRUD.
