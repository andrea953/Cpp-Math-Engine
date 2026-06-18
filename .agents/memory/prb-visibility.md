---
name: PRB effect visibility
description: Why the Post-Retirement Benefit looks like "nothing changed" and where its effect actually shows.
---

# PRB (Post-Retirement Benefit) effect is easy to miss

The PRB **never** changes the headline monthly benefit AT START — it accrues
year by year only AFTER CPP starts and plateaus at the stop age. So toggling it
on leaves the big "$/mo" number unchanged, which reads as "nothing happened."

**Why:** users (and the planner) repeatedly assumed the toggle was broken. Two
real but quiet effects:
- Lifetime/cumulative totals move a lot (~6–13% at start age 60 in realistic
  scenarios) — visible on the breakeven chart's line heights.
- The breakeven **crossover age** moves only ~1–2 years (e.g. 60→65 crossover
  71→72, 65→70 crossover 78→80), which is hard to eyeball on the chart.

**How to apply:** when working on PRB UX, surface the effect numerically rather
than relying on the chart. The StartAgeCard renders an "Incl. PRB at age N" line
(projected fully-accrued monthly + delta) via `projectedMonthlyInclPrbAtStop`
(in `src/cpp/calculate.ts`). Keep that helper's stop-age default (`?? 65`) in
lockstep with the engine accrual gate in `projectCumulative`, or the UI line and
the engine math diverge for scenarios with an undefined stop age.

Also: the PRB toggle must seed `annualEarningsAfterStart` + `stopAge` into state
when enabled — the engine gates on `(annualEarningsAfterStart ?? 0) > 0`, so a
toggle that only sets the boolean produces zero PRB.
