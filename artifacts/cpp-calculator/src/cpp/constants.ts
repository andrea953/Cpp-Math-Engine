/**
 * CPP reference data.
 *
 * Primary source for all benefit rules: the Canada Pension Plan Act, RSC 1985,
 * c. C-8 (https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html). Section
 * references are noted next to each constant below. Plain-language references
 * come from canada.ca (Service Canada / CRA).
 *
 * Published reference values (official annual figures from CRA/Service Canada):
 *  - Year's Maximum Pensionable Earnings (YMPE), 1966–2026 (CPP Act s. 18)
 *  - Year's Additional Maximum Pensionable Earnings (YAMPE), 2024–2026 (s. 17.1)
 *  - Year's Basic Exemption (YBE) is fixed at $3,500 (s. 20)
 *  - Maximum CPP retirement pension at 65 by year (used for sanity checks only)
 *    https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html
 *
 * Benefit formula (basic monthly amount), CPP Act s. 46(1):
 *  - (a) 25% of average monthly pensionable earnings (base)
 *  - (b) 8.33% of first additional monthly pensionable earnings (Tier 1)
 *  - (c) 33.33% of second additional monthly pensionable earnings (Tier 2)
 *
 * Values past 2026 are projected by the engine using the user's YMPE growth rate.
 */

export const YBE = 3500;

/**
 * The "first additional" replacement rate (Tier 1 enhancement) phases in 2019–2023.
 * For each year, this gives the additional replacement rate (above the 25% base rate)
 * that applies to that year's contributions.
 *
 * Year 2019 = 15% × 8.33%, 2020 = 30% × 8.33%, ..., 2023+ = 100% × 8.33%
 *
 * CPP Act s. 51: the phase-in proportions (2019 × 0.15, 2020 × 0.3, 2021 × 0.5,
 * 2022 × 0.75, 2023+ × 1.0).
 */
export const TIER1_PHASE_IN: Record<number, number> = {
  2019: 0.15,
  2020: 0.3,
  2021: 0.5,
  2022: 0.75,
  2023: 1.0,
};

/** Tier 1 fully accrued replacement rate (above the 25% base). CPP Act s. 46(1)(b); first additional MPE s. 48.1. */
export const TIER1_FULL_REPLACEMENT_RATE = 0.0833333; // 8 1/3 %

/** Tier 2 replacement rate on earnings between YMPE and YAMPE (full accrual). CPP Act s. 46(1)(c); second additional MPE s. 48.2. */
export const TIER2_REPLACEMENT_RATE = 0.3333333; // 33 1/3 %

/** Number of contribution years required to fully accrue the enhancement (40-year / 480-month basis, CPP Act s. 48.1, s. 48.2). */
export const ENHANCEMENT_FULL_YEARS = 40;

/**
 * Enhanced-CPP disability drop-in rate. The first and second additional
 * components have no drop-out; instead, for months a contributor received a CPP
 * disability pension, a proxy income is credited worth 70% of the contributor's
 * average pensionable earnings in the 6 years before disability onset.
 * CPP Act s. 53.3/53.4 (additional plan); canada.ca CPP amount — "Periods of
 * disability": https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html
 */
export const DISABILITY_DROP_IN_RATE = 0.7;

/** Number of pre-disability years averaged for the enhanced disability drop-in (the "6 years before you became disabled"). */
export const DISABILITY_DROP_IN_PRIOR_YEARS = 6;

/**
 * Adjustment factors for early/late take-up of the base + Tier 1 portion.
 * Authorized by CPP Act s. 46(3)–(6); the specific monthly factors are
 * prescribed by regulation (canada.ca — "When to start your retirement pension").
 */
export const EARLY_ADJUSTMENT_PER_MONTH = 0.006; // -0.6% per month before 65 (max -36% at 60)
export const LATE_ADJUSTMENT_PER_MONTH = 0.007; // +0.7% per month after 65 (max +42% at 70)

/**
 * General drop-out rate applied to the base contributory period.
 * CPP Act s. 48(4)(a)(i): the statutory rate phased up from 15% (before 2012)
 * to 16% (2012–2013) to 17% (after December 2013).
 */
export const GENERAL_DROPOUT_RATE = 0.17;

/** YMPE history (Year's Maximum Pensionable Earnings) */
export const YMPE_HISTORY: Record<number, number> = {
  1966: 5000, 1967: 5000, 1968: 5100, 1969: 5200, 1970: 5300,
  1971: 5400, 1972: 5500, 1973: 5900, 1974: 6600, 1975: 7400,
  1976: 8300, 1977: 9300, 1978: 10400, 1979: 11700, 1980: 13100,
  1981: 14700, 1982: 16500, 1983: 18500, 1984: 20800, 1985: 23400,
  1986: 25800, 1987: 25900, 1988: 26500, 1989: 27700, 1990: 28900,
  1991: 30500, 1992: 32200, 1993: 33400, 1994: 34400, 1995: 34900,
  1996: 35400, 1997: 35800, 1998: 36900, 1999: 37400, 2000: 37600,
  2001: 38300, 2002: 39100, 2003: 39900, 2004: 40500, 2005: 41100,
  2006: 42100, 2007: 43700, 2008: 44900, 2009: 46300, 2010: 47200,
  2011: 48300, 2012: 50100, 2013: 51100, 2014: 52500, 2015: 53600,
  2016: 54900, 2017: 55300, 2018: 55900, 2019: 57400, 2020: 58700,
  2021: 61600, 2022: 64900, 2023: 66600, 2024: 68500, 2025: 71300,
  2026: 74000,
};

/** YAMPE history (Year's Additional Maximum Pensionable Earnings) */
export const YAMPE_HISTORY: Record<number, number> = {
  2024: 73200,
  2025: 81200,
  2026: 84400,
};

/** Maximum monthly CPP retirement pension at age 65 (for reference only) */
export const MAX_BENEFIT_AT_65: Record<number, number> = {
  2020: 1175.83,
  2021: 1203.75,
  2022: 1253.59,
  2023: 1306.57,
  2024: 1364.60,
  2025: 1433.00,
  2026: 1497.36,
};

// ---------------------------------------------------------------------------
// Survivor / death / children's benefit constants
// ---------------------------------------------------------------------------
// Statute: Canada Pension Plan Act, RSC 1985, c. C-8 —
//  - Survivor's pension (rates, flat-rate, under-45 reduction, combined cap): s. 58
//  - Death benefit: s. 57(1)(b)
//  - Children's / orphan's benefit: s. 59
// Plain-language: canada.ca CPP survivor's / death / children's benefit pages.
// ---------------------------------------------------------------------------

/**
 * Survivor's pension flat-rate component (paid in addition to 37.5% of the
 * deceased's calculated retirement pension when the survivor is under 65).
 * Monthly amount, indexed annually with CPI. (CPP Act s. 58)
 */
export const SURVIVOR_FLAT_RATE_HISTORY: Record<number, number> = {
  2019: 193.66,
  2020: 197.34,
  2021: 199.31,
  2022: 204.68,
  2023: 217.99,
  2024: 227.81,
  2025: 232.30,
  2026: 238.34,
};

/** One-time CPP death benefit (lump sum). Fixed at $2,500 for deaths after Dec 31, 2018 (CPP Act s. 57(1)(b)). */
export const DEATH_BENEFIT_AMOUNT = 2500;

/** CPP children's benefit — flat monthly amount per eligible child (CPP Act s. 59). */
export const CHILDREN_BENEFIT_HISTORY: Record<number, number> = {
  2019: 250.27,
  2020: 255.03,
  2021: 257.58,
  2022: 264.53,
  2023: 281.72,
  2024: 294.12,
  2025: 301.77,
  2026: 309.62,
};

/** Survivor's pension: percentage of deceased's calculated retirement pension when survivor is 65+ (CPP Act s. 58). */
export const SURVIVOR_RATE_65_PLUS = 0.60;

/** Survivor's pension: percentage of deceased's calculated retirement pension when survivor is under 65 (CPP Act s. 58). */
export const SURVIVOR_RATE_UNDER_65 = 0.375;

/** Enhanced survivor's pension: 37.5% of deceased's enhanced (Tier 1 + Tier 2) retirement amount, regardless of survivor age (CPP Act s. 58). */
export const SURVIVOR_ENHANCED_RATE = 0.375;

/** Survivor's pension is unavailable to childless, non-disabled survivors under this age (deferred to 65) (CPP Act s. 58). */
export const SURVIVOR_MIN_ELIGIBLE_AGE = 35;

/** At ages 35–44 (no children, not disabled), the under-65 base is reduced by 1/120 per month under this age (CPP Act s. 58). */
export const SURVIVOR_FULL_RATE_AGE = 45;

/** Look up the survivor flat rate for a year. Projects unknown years from the latest known value. */
export function getSurvivorFlatRate(year: number, indexingRate: number): number {
  if (SURVIVOR_FLAT_RATE_HISTORY[year] !== undefined) return SURVIVOR_FLAT_RATE_HISTORY[year];
  const knownYears = Object.keys(SURVIVOR_FLAT_RATE_HISTORY).map(Number).sort((a, b) => a - b);
  const lastKnown = knownYears[knownYears.length - 1];
  const lastValue = SURVIVOR_FLAT_RATE_HISTORY[lastKnown];
  if (year > lastKnown) return lastValue * Math.pow(1 + indexingRate, year - lastKnown);
  const firstKnown = knownYears[0];
  return SURVIVOR_FLAT_RATE_HISTORY[firstKnown] / Math.pow(1 + indexingRate, firstKnown - year);
}

/** Look up the children's benefit for a year. Projects unknown years from the latest known value. */
export function getChildrensBenefit(year: number, indexingRate: number): number {
  if (CHILDREN_BENEFIT_HISTORY[year] !== undefined) return CHILDREN_BENEFIT_HISTORY[year];
  const knownYears = Object.keys(CHILDREN_BENEFIT_HISTORY).map(Number).sort((a, b) => a - b);
  const lastKnown = knownYears[knownYears.length - 1];
  const lastValue = CHILDREN_BENEFIT_HISTORY[lastKnown];
  if (year > lastKnown) return lastValue * Math.pow(1 + indexingRate, year - lastKnown);
  const firstKnown = knownYears[0];
  return CHILDREN_BENEFIT_HISTORY[firstKnown] / Math.pow(1 + indexingRate, firstKnown - year);
}

/** Look up the maximum CPP retirement pension at 65 for a year. Projects unknown years using the supplied indexing rate. */
export function getMaxBenefitAt65(year: number, indexingRate: number): number {
  if (MAX_BENEFIT_AT_65[year] !== undefined) return MAX_BENEFIT_AT_65[year];
  const knownYears = Object.keys(MAX_BENEFIT_AT_65).map(Number).sort((a, b) => a - b);
  const lastKnown = knownYears[knownYears.length - 1];
  const lastValue = MAX_BENEFIT_AT_65[lastKnown];
  if (year > lastKnown) return lastValue * Math.pow(1 + indexingRate, year - lastKnown);
  const firstKnown = knownYears[0];
  return MAX_BENEFIT_AT_65[firstKnown] / Math.pow(1 + indexingRate, firstKnown - year);
}

/** Earliest year for which CPP earnings exist */
export const CPP_START_YEAR = 1966;

/** Year that the first additional contributions started */
export const TIER1_START_YEAR = 2019;

/** Year that the second additional contributions started */
export const TIER2_START_YEAR = 2024;

// ---------------------------------------------------------------------------
// Contribution rates (used to display annual contribution amount, not benefits)
// ---------------------------------------------------------------------------

/**
 * Base CPP employee contribution rate (the portion withheld from a T4
 * paycheque). Self-employed people pay 2× this rate (employee + employer).
 * Applied to (pensionable earnings ∩ [YBE, YMPE]).
 */
export const BASE_EMPLOYEE_CONTRIBUTION_RATE = 0.0495;

/**
 * Tier 1 enhancement employee contribution rate by year. Phased in 2019–2023;
 * full rate from 2023 onwards is 1.00%. Applied to the same band as the base
 * (earnings ∩ [YBE, YMPE]). Self-employed pay 2×.
 */
export const TIER1_EMPLOYEE_CONTRIBUTION_RATE_HISTORY: Record<number, number> = {
  2019: 0.0015,
  2020: 0.003,
  2021: 0.005,
  2022: 0.0075,
  2023: 0.01,
};

/** Tier 1 fully accrued employee rate (2023+). */
export const TIER1_EMPLOYEE_CONTRIBUTION_RATE_FULL = 0.01;

/**
 * Tier 2 enhancement employee contribution rate (started 2024). Applied to
 * (pensionable earnings ∩ (YMPE, YAMPE]). Self-employed pay 2×.
 */
export const TIER2_EMPLOYEE_CONTRIBUTION_RATE = 0.04;

/** Look up the Tier 1 employee contribution rate for a year. */
export function getTier1ContributionRate(year: number): number {
  if (year < TIER1_START_YEAR) return 0;
  if (TIER1_EMPLOYEE_CONTRIBUTION_RATE_HISTORY[year] !== undefined) {
    return TIER1_EMPLOYEE_CONTRIBUTION_RATE_HISTORY[year];
  }
  return TIER1_EMPLOYEE_CONTRIBUTION_RATE_FULL;
}

/** Earliest age at which CPP retirement can begin */
export const MIN_START_AGE = 60;

/** Latest age at which CPP retirement can begin */
export const MAX_START_AGE = 70;

/**
 * Look up YMPE for a year. If beyond the published table, project forward
 * from the most recent known year using the supplied annual growth rate.
 */
export function getYmpe(year: number, growthRate: number): number {
  if (YMPE_HISTORY[year] !== undefined) return YMPE_HISTORY[year];
  const knownYears = Object.keys(YMPE_HISTORY).map(Number).sort((a, b) => a - b);
  const lastKnown = knownYears[knownYears.length - 1];
  if (year < lastKnown) {
    // Predates published history — extrapolate backwards from earliest known
    const firstKnown = knownYears[0];
    const firstValue = YMPE_HISTORY[firstKnown];
    const yearsBack = firstKnown - year;
    return firstValue / Math.pow(1 + growthRate, yearsBack);
  }
  const lastValue = YMPE_HISTORY[lastKnown];
  const yearsForward = year - lastKnown;
  return lastValue * Math.pow(1 + growthRate, yearsForward);
}

/**
 * Look up YAMPE for a year. Years before 2024 are not applicable (return YMPE).
 * For projected years, grow from the last known YAMPE.
 */
export function getYampe(year: number, growthRate: number): number {
  if (year < TIER2_START_YEAR) return getYmpe(year, growthRate);
  if (YAMPE_HISTORY[year] !== undefined) return YAMPE_HISTORY[year];
  const knownYears = Object.keys(YAMPE_HISTORY).map(Number).sort((a, b) => a - b);
  const lastKnown = knownYears[knownYears.length - 1];
  const lastValue = YAMPE_HISTORY[lastKnown];
  const yearsForward = year - lastKnown;
  return lastValue * Math.pow(1 + growthRate, yearsForward);
}

/**
 * Five-year average YMPE (AYMPE) ending in `year`, used to index pensionable earnings.
 */
export function getAympe(year: number, growthRate: number): number {
  const years = [year, year - 1, year - 2, year - 3, year - 4];
  const sum = years.reduce((acc, y) => acc + getYmpe(y, growthRate), 0);
  return sum / 5;
}

/**
 * Five-year average YAMPE (AYAMPE) ending in `year`.
 */
export function getAyampe(year: number, growthRate: number): number {
  const years = [year, year - 1, year - 2, year - 3, year - 4];
  const sum = years.reduce((acc, y) => acc + getYampe(y, growthRate), 0);
  return sum / 5;
}
