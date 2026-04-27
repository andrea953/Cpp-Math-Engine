# Modern CENTS — CPP Engine Test Suite

A regression test suite for the Canada Pension Plan calculation engine. Each
test file maps 1:1 to a section of the engine's documented behaviour so a peer
reviewer can read the tests and the regulatory citations side by side.

## Running the tests

```sh
# One-shot run (CI mode)
pnpm --filter @workspace/cpp-calculator test

# Watch mode (re-runs on file change)
pnpm --filter @workspace/cpp-calculator test:watch

# Type-check (independent of the test runner)
pnpm --filter @workspace/cpp-calculator typecheck
```

The suite uses [Vitest](https://vitest.dev/) in `node` environment — no
browser, no DOM, no jsdom. Tests live in
`src/cpp/__tests__/*.test.ts`.

## Why we pin "today"

Two engine behaviours depend on the current calendar year:

1. `buildEffectiveEarnings` decides where the projection segment begins
   (`min(lastHistYear+1, currentYear)`).
2. `socParser.looksLikeYear` validates that a number could plausibly be a year
   (`year ≤ currentYear + 1`).

Without pinning, the suite would silently change behaviour every January 1.
All time-dependent tests pin the current date to **June 15, 2026** via the
helper in `src/cpp/__tests__/_time.ts`:

```ts
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());
```

If you bump this date, several golden numbers must move with it (anything
that depends on AYMPE in 2026, the published 2026 max benefit, or the 2026
flat / children's rates).

## Tolerance

Golden numerical comparisons use a tolerance of **±$1 per month**. The
engine's earnings model is monthly while the regulatory model is annualized,
and the AYMPE 5-year average introduces sub-dollar rounding. A $1 spread is
acceptable for a planner-grade calculator and meaningful enough to catch real
bugs in indexation, dropouts, or replacement rates.

## File-by-file map

| File | Citation / source |
|---|---|
| `constants.test.ts` | Service Canada / CRA — YMPE, YAMPE, max benefit at 65, survivor flat-rate, children's benefit |
| `adjustment.test.ts` | Service Canada — "When to start your retirement pension" (-0.6%/mo early, +0.7%/mo late) |
| `earningsProjection.test.ts` | Internal contract: `buildEffectiveEarnings` projects forward only, never overwrites history |
| `baseCpp.test.ts` | Service Canada — "How CPP retirement pension is calculated" (AMPE × 25%, capped at AYMPE/12) |
| `tier1.test.ts` | Service Canada — "Canada Pension Plan enhancement", phase-in 2019–2023 (15/30/50/75/100%) |
| `tier2.test.ts` | Service Canada — "Second additional CPP contribution" (2024+, 33⅓% on YMPE→YAMPE band) |
| `dropouts.test.ts` | Service Canada — CRDO, disability dropout, general 17% drop-out |
| `takeUp.test.ts` | Verifies the take-up factor multiplies through linearly |
| `prb.test.ts` | Engine PRB proxy: 0 when not working, monotonic while working, stops at `stopAge` |
| `survivor.test.ts` | Service Canada — survivor's, death and children's benefits (all branches) |
| `socParser.test.ts` | Production parser regressions: PDF column order, CSV, `$1,234,567`, `2023,999` |
| `invariants.test.ts` | Property tests: total = base + T1 + T2; benefit @60 < @65 < @70; T1/T2 zero before phase-in |
| `whitePaperPrintEstimator.test.ts` | Drift guard for the Safari/Firefox print "Page N of M" fallback in `useCrossBrowserPrintMargins`. Snapshots the white-paper structural block counts, bucketed body-text length, and the estimator's geometry constants + `@page` rules. **If this snapshot fails, do NOT just run `pnpm test -u`.** First print the white paper from BOTH Safari and Firefox and confirm the injected page-number footers still match the actual rendered page count and land on real (not phantom) pages. Tune `estimatePageCount` in `src/components/white-paper.tsx` if they drift, then update the snapshot. Chrome's printed output is unaffected — it uses native `@page counter(pages)`. |

## Known limitations explicitly tested as TODOs

These are documented behaviours, not bugs. Tests exist to surface them so a
reviewer doesn't have to discover them by reading code.

1. **Simplified PRB formula.** The engine's Post-Retirement Benefit is a 1/40
   proxy, not the regulatory formula. `prb.test.ts` only verifies structural
   properties (zero / monotonic / stops at `stopAge`), not absolute amounts.
   See the file header for details.
2. **Early-death contributory-period extension.** `survivor.ts` runs the
   deceased's calculated retirement pension through the standard age 18 → 65
   contributory period. Deaths before 60 will under-state the pension because
   years between the death year and 65 enter as zero-earning months.
   `survivor.test.ts` asserts that the engine attaches a warning note when
   `deathAge < 60` so advisors are alerted.
3. **Base CPP does not subtract YBE.** Only Tier 1 subtracts YBE from the
   in-band earnings. A YBE-only earner therefore produces a small but
   non-zero base benefit. `baseCpp.test.ts` verifies the proportionality.

## Adding a new golden case from a Service Canada worked example

1. Read the example end-to-end and identify the inputs: birth date, full
   earnings history, drop-out periods (if any), assumptions used.
2. In `baseCpp.test.ts` (or the relevant file) add a new `it(...)` block with
   a leading comment that cites the example (publication name, page, URL).
3. Construct a `ScenarioInputs` object with the example's exact inputs. Pin
   the relevant year via the existing `_time.ts` helper.
4. Assert the expected monthly benefit within ±$1. Also assert the diagnostic
   counters (`monthsRetained`, `crdoMonthsDropped`, `ampe`) so a future
   failure points to the right step rather than just "the number is wrong".
5. Run `pnpm --filter @workspace/cpp-calculator test` and confirm green.

## Out of scope

The suite covers engine math only. It does NOT cover:

- UI / component tests (Testing Library, Playwright)
- API / database integration tests on `@workspace/api-server`
- QPP, OAS, GIS, or income tax — these remain explicit non-goals of the
  calculator
- The simplified PRB proxy is verified for shape only, not for regulatory
  accuracy
