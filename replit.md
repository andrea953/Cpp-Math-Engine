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

### Plannerly CPP — `artifacts/cpp-calculator`
A planner-grade Canada Pension Plan calculator for financial advisors.
- **Routes**: `/` (marketing/redirect), `/sign-in`, `/sign-up`, `/scenarios` (dashboard), `/scenarios/new`, `/scenarios/:id` (editor), `/compare?ids=...`
- **Auth**: Clerk (cookie-based; api-server proxies to Clerk middleware)
- **Engine**: Pure-client TypeScript CPP engine in `src/cpp/` — base + Tier 1 + Tier 2 enhancement, CRDO, disability dropout, general 17% dropout, AMPE/AYMPE, breakeven projection, PRB. Constants tables for YMPE 1966–2026 and YAMPE 2024–2026.
- **Persistence**: scenarios stored as JSONB in PostgreSQL (`scenariosTable`, see `lib/db/src/schema.ts`); CRUD + duplicate via `/api/scenarios` exposed in OpenAPI spec.
- **API hooks**: `useListScenarios`, `useGetScenario`, `useCreateScenario`, `useUpdateScenario`, `useDeleteScenario`, `useDuplicateScenario` from `@workspace/api-client-react`.

### API Server — `artifacts/api-server`
Express 5 backend serving `/api/*`. Wires Clerk middleware, exposes scenarios CRUD.
