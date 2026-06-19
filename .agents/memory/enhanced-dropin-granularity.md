---
name: Enhanced drop-in granularity
description: Why CRDO/disability drop-ins in the enhanced component are year-granular, not month-granular.
---

The enhanced (Tier 1 / Tier 2) component drop-ins (child-rearing CRDO and disability) are applied at **annual** granularity: any calendar year a protected window touches gets the imputed value. Period start/end MONTHS are not prorated for the enhancement.

**Why:** the enhanced component is computed entirely from annual pensionable earnings (the only data the SOC/earnings input provides). There is no monthly earnings breakdown to prorate against, so month-level proration would add complexity without real precision. The base component DOES handle month-level exclusion separately (in buildMonthlyPoints). Service Canada defines the disability drop-in per-month ("for the months you received a CPP disability pension"), but our model intentionally approximates at year granularity, and both drop-ins behave identically for consistency.

**How to apply:** if asked to make the disability drop-in month-aware, do NOT do it in isolation — it would diverge from CRDO and from the annual nature of the whole enhanced calc. The white paper (wp-dropouts section) explicitly states the annual-granularity approximation; keep engine and white-paper wording in lockstep. A locked test ("applies the drop-in at annual granularity") in dropouts.test.ts pins this behavior.
