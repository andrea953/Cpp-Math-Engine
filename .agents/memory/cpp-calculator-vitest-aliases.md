---
name: cpp-calculator vitest alias limitation
description: Why unit tests can't import React component modules that use @/ value imports, and the workaround.
---

In `artifacts/cpp-calculator`, the vitest config (`vitest.config.ts`, env `node`) does NOT resolve the `@/` path alias for **runtime/value** imports. Type-only imports (`import type { X } from "@/cpp"`) are fine because esbuild erases them before resolution.

**Symptom:** a `.test.ts` that imports a component module fails at collection with `Cannot find package '@/components/ui/card'` (a value import of a UI component), and the run reports "no tests".

**Why:** tests here use relative imports by convention; the alias is only wired in the Vite app build / tsconfig, not in vitest's resolver.

**How to apply:** to unit-test logic that lives next to React UI, extract the pure logic + copy into a React-free sibling module (e.g. `*-content.ts`) that has only type-only `@/` imports, keep the presentational component in the `.tsx`, and point the test at the content module. Don't try to import the `.tsx` from a test.
