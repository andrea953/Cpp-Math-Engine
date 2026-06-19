---
name: CPP child-rearing drop-out vs drop-in
description: How one CRDO input drives BOTH the base drop-out and the enhanced drop-in, plus the Tier 2 test-harness gotcha.
---

# Child-rearing: base drop-out vs enhanced drop-in

A single `crdo` `DropoutPeriod` entry drives two different mechanisms:

- **Base CPP** — beneficial-only child-rearing DROP-OUT: months in the window are
  removed from the AMPE average only when their indexed earnings are below the
  running mean (greedy, mirrors the post-65 drop-out). Removing them never lowers
  the benefit. Fires regardless of prior-5-year income.
- **Enhanced CPP (Tier 1 s.53.3(1) + Tier 2 s.53.4(1))** — there is NO drop-out;
  instead a DROP-IN: imputed income = average pensionable earnings in the 5 years
  BEFORE the child's birth (sum / 5), and each window year uses `max(real, imputed)`.
  If the prior-5-year income is 0, imputed is 0 and the drop-in has no effect.

**Why:** Source is the Jason Yee / Finepoint paper + CPP Act s.53.3(1)/53.4(1). The
asymmetry is real: a parent with no pre-birth income still gets the base drop-out
but gets NO enhanced drop-in (Figure 2 of the paper).

**How to apply:** birth year is taken as the CRDO window's `startYear`; the drop-in
is applied across that same window. Overlapping windows take the `max` imputed per
year. Keep base + enhanced consistent off the one CRDO entry — don't add a separate
input for the drop-in.

## Test-harness gotcha (dropouts.test.ts)

`makeInputs` fills every year with YMPE-max earnings. YMPE-max produces **zero Tier 2
band earnings** (Tier 2 is the YMPE→YAMPE band), so Tier 2 never accrues in that
harness. To test any Tier 2 behavior you must set earnings ABOVE YMPE (e.g. 100000)
in the relevant years via the `setEarnings` helper.
