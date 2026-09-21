---
name: cpp-calculator vitest component setup
description: Vitest component tests need the app alias and classic JSX runtime made explicit.
---

In `artifacts/cpp-calculator`, Vitest runs in the `node` environment and needs its own `@/` resolver for runtime/value imports; the app's Vite alias is not inherited automatically. Component modules rendered through `react-dom/server` also need React in scope because this test path uses the classic JSX runtime.

**Symptom:** importing a component from a test fails at collection with `Cannot find package '@/components/ui/card'`, or server-rendering JSX fails with `React is not defined`.

**Why:** Vitest and the Vite app have separate config loading paths, and the TypeScript JSX setting is preserved for the app's Vite transform rather than selecting the automatic runtime for server-rendered tests.

**How to apply:** keep the alias in `vitest.config.ts`, import React explicitly in TSX modules exercised by SSR tests, and use `renderToStaticMarkup` for focused component output checks when a DOM runner is unnecessary.
