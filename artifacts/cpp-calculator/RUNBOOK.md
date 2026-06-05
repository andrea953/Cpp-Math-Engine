# Annual Update Runbook — Modern Cents CPP Calculator

**When to run this:** every January, after the Government of Canada publishes the
new year's CPP figures (typically released in early November of the prior year and
effective January 1).

**Why January:** two separate things change at the start of each year:

1. **CPP benefits in payment are indexed to inflation.** Amounts already being
   paid (and the published maximums) rise by the CPP indexation rate, which is
   based on the Consumer Price Index. See the reference page:
   <https://www.canada.ca/en/services/benefits/publicpensions/cpp/receive-benefits/consumer-price-index.html>
2. **The earnings ceilings rise with average wage growth.** The YMPE and YAMPE
   (the income bands that contributions and benefits are calculated on) increase
   based on wage data, not CPI.

> **Important — what does NOT change annually.** The contribution *rates*
> (percentages) are fixed by statute now that the enhancement phase-in is
> complete: base 4.95%, Tier 1 1.00%, Tier 2 4.00% (employee shares; self-employed
> pay 2×). What rises each year is the maximum *dollar* contribution, because the
> YMPE/YAMPE ceilings the rates apply to go up. Only update a rate constant if
> Parliament actually legislates a rate change — that is rare and separate from the
> annual inflation/wage adjustment.

---

## Where to get the official numbers

| Figure | Source |
| --- | --- |
| YMPE, YAMPE (earnings ceilings), YBE | CRA — "CPP contribution rates, maximums and exemptions" <https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html> |
| Maximum monthly retirement pension at 65 | Service Canada — "CPP payment amounts" <https://www.canada.ca/en/services/benefits/publicpensions/cpp/payment-amounts.html> |
| Survivor's pension flat-rate component | Service Canada — CPP survivor's pension page (max amounts table) |
| Children's / orphan's benefit (flat monthly) | Service Canada — CPP children's benefit page |
| CPI indexation rate (for sanity-checking the indexed amounts) | <https://www.canada.ca/en/services/benefits/publicpensions/cpp/receive-benefits/consumer-price-index.html> |

Always copy figures from these primary government pages — do not estimate or
carry forward last year's value.

---

## Step-by-step

All edits below are in `src/cpp/constants.ts` unless noted. Replace `<YEAR>` with
the new year (e.g. `2027`) and use the official published values.

### 1. Add the new earnings ceilings

- **`YMPE_HISTORY`** — add `  <YEAR>: <new YMPE>,` (CPP Act s. 18).
- **`YAMPE_HISTORY`** — add `  <YEAR>: <new YAMPE>,` (CPP Act s. 17.1).
- **`YBE`** — confirm it is still `3500`. It has been fixed at $3,500; only change
  it if the government changes it (CPP Act s. 20).

### 2. Add the new indexed benefit amounts

- **`MAX_BENEFIT_AT_65`** — add `  <YEAR>: <new max monthly at 65>,` (reference /
  sanity-check value only; the engine computes benefits, it does not read this for
  the headline number).
- **`SURVIVOR_FLAT_RATE_HISTORY`** — add `  <YEAR>: <new flat rate>,` (CPP Act s. 58).
- **`CHILDREN_BENEFIT_HISTORY`** — add `  <YEAR>: <new children's amount>,` (CPP Act s. 59).
- **`DEATH_BENEFIT_AMOUNT`** — confirm it is still `2500` (fixed lump sum, CPP Act
  s. 57(1)(b); only change if legislated).

> The `getSurvivorFlatRate`, `getChildrensBenefit`, `getMaxBenefitAt65`, `getYmpe`,
> and `getYampe` helpers automatically use the newest table entry as the base for
> projecting future years, so once you add the new row, projections re-anchor on it.

### 3. Update the header comment ranges

At the top of `constants.ts`, update the documented year ranges so they stay
truthful:

- `Year's Maximum Pensionable Earnings (YMPE), 1966–<YEAR>`
- `Year's Additional Maximum Pensionable Earnings (YAMPE), 2024–<YEAR>`
- `Values past <YEAR> are projected by the engine using the user's YMPE growth rate.`

### 4. Only if a rate was legislated to change (uncommon)

Skip this section in a normal year. If Parliament changed a rate:

- `BASE_EMPLOYEE_CONTRIBUTION_RATE` (currently 0.0495)
- `TIER1_EMPLOYEE_CONTRIBUTION_RATE_FULL` (currently 0.01)
- `TIER2_EMPLOYEE_CONTRIBUTION_RATE` (currently 0.04)
- The benefit replacement rates (`TIER1_FULL_REPLACEMENT_RATE`,
  `TIER2_REPLACEMENT_RATE`) — these are 8⅓% / 33⅓% and only move with legislation.

### 5. Review the projection assumptions (optional, light touch)

These are long-run defaults in `src/cpp/defaults.ts`, not annual figures, but it is
worth a glance once a year:

- `ympeGrowthRate` / `yampeGrowthRate` — `0.031` (~3.1% wage growth).
- `indexingRate` — `0.021` (long-run CPI assumption for benefits in payment).

Only adjust if long-run consensus assumptions have meaningfully shifted; do not
chase a single year's CPI/wage print.

### 6. Update the white paper's year-specific content

In `src/components/white-paper.tsx`:

- The **"percent of maximum" reference table** (search for the `Take-up year`
  table). The first row is pinned to a specific year (e.g. `2026` — max earner,
  age 65) with Base/Tier 1/Tier 2/Total percentages. These numbers come from the
  engine; regenerate them by running the calculator for a same-year max earner at
  65, or by reading the values asserted in `src/cpp/__tests__/tierBreakdown.test.ts`.
- Prose mentions of the current ceilings/coverage (e.g. "Published values
  1966–2026 are stored", "today the CPP maximum is still ~96¢ on the dollar").
  Update the year ranges and the cents-on-the-dollar figure if it has shifted.

### 7. Update the locked tests

- **`src/cpp/__tests__/tierBreakdown.test.ts`** pins a year (e.g. `pinYear(2026, ...)`)
  and asserts the reference-table percentages. If you advanced the white-paper
  table to the new year, update the pinned year and expected percentages here so
  the two stay in sync.
- **`src/cpp/__tests__/whitePaperPrintEstimator.test.ts`** holds a snapshot that
  drifts whenever white-paper content changes. **Do not blindly run `-u`.** This
  snapshot guards the Safari/Firefox "Page N of M" print fallback, and the drift
  can be a *real* regression. The correct order is:

  1. Run the real-browser truth check first (boots Chromium and compares the JS
     estimator against an actual printed PDF; requires the system `chromium`
     binary):

     ```bash
     pnpm --filter @workspace/cpp-calculator test:e2e
     ```

  2. If `test:e2e` **passes**, the estimator is still accurate — just refresh the
     snapshot to absorb the content change:

     ```bash
     pnpm --filter @workspace/cpp-calculator exec vitest run -u src/cpp/__tests__/whitePaperPrintEstimator.test.ts
     ```

  3. If `test:e2e` **fails** (page-count delta ≥ 2), the estimator actually
     drifted. Tune `estimateWhitePaperPageCount` in
     `src/components/whitePaperPrintEstimator.ts` (or the `@page` geometry in
     `src/index.css`) until `test:e2e` passes again, *then* update the snapshot.

  See `TESTING.md` ("White-paper print page-count e2e") for the full rationale.

---

## Verify

Run from the workspace root:

```bash
# 1. Types are clean
pnpm --filter @workspace/cpp-calculator run typecheck

# 2. All engine + content tests pass (snapshot updated above).
#    Note: this default run EXCLUDES the *.e2e.test.ts files.
pnpm --filter @workspace/cpp-calculator test

# 3. If you touched the white paper, also run the real-browser print e2e
#    (separate config; requires the system `chromium` binary):
pnpm --filter @workspace/cpp-calculator test:e2e
```

Then a manual smoke check in the preview:

1. Open the calculator, create a scenario for a max earner taking CPP at 65 in the
   **new** year, and confirm the monthly amount lines up with the published maximum
   you entered in `MAX_BENEFIT_AT_65` (within rounding).
2. Confirm a survivor scenario shows the new flat-rate and children's amounts.
3. Open the home page white paper, print to PDF, and confirm the reference table and
   year ranges read correctly.

When all of the above pass, the calculator is current for the new year. Publish/
deploy as usual.

---

## Quick checklist

- [ ] `YMPE_HISTORY` — new year added
- [ ] `YAMPE_HISTORY` — new year added
- [ ] `MAX_BENEFIT_AT_65` — new year added
- [ ] `SURVIVOR_FLAT_RATE_HISTORY` — new year added
- [ ] `CHILDREN_BENEFIT_HISTORY` — new year added
- [ ] `YBE` and `DEATH_BENEFIT_AMOUNT` still correct
- [ ] Header comment year ranges updated
- [ ] Rates checked (change only if legislated)
- [ ] White-paper reference table + prose years updated
- [ ] `tierBreakdown.test.ts` pinned year/values updated
- [ ] `whitePaperPrintEstimator` snapshot refreshed (after `test:e2e` passes)
- [ ] `typecheck` clean, `pnpm test` passes, `pnpm test:e2e` passes (if white paper changed)
- [ ] Manual smoke check + PDF reviewed
- [ ] Deployed
