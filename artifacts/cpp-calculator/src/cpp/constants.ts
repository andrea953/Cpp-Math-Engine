/**
 * CPP reference data.
 *
 * Sources (publicly published):
 *  - Year's Maximum Pensionable Earnings (YMPE), 1966–2026: Service Canada / CRA
 *  - Year's Additional Maximum Pensionable Earnings (YAMPE), 2024–2026
 *  - Year's Basic Exemption (YBE) is fixed at $3,500
 *  - Maximum CPP retirement pension at 65 by year (used for sanity checks only)
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
 */
export const TIER1_PHASE_IN: Record<number, number> = {
  2019: 0.15,
  2020: 0.3,
  2021: 0.5,
  2022: 0.75,
  2023: 1.0,
};

/** Tier 1 fully accrued replacement rate (above the 25% base) */
export const TIER1_FULL_REPLACEMENT_RATE = 0.0833333; // 8 1/3 %

/** Tier 2 replacement rate on earnings between YMPE and YAMPE (full accrual) */
export const TIER2_REPLACEMENT_RATE = 0.3333333; // 33 1/3 %

/** Number of contribution years required to fully accrue the enhancement */
export const ENHANCEMENT_FULL_YEARS = 40;

/** Adjustment factors for early/late take-up of the base + Tier 1 portion */
export const EARLY_ADJUSTMENT_PER_MONTH = 0.006; // -0.6% per month before 65
export const LATE_ADJUSTMENT_PER_MONTH = 0.007; // +0.7% per month after 65

/** General drop-out rate applied to the base contributory period */
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

/** Earliest year for which CPP earnings exist */
export const CPP_START_YEAR = 1966;

/** Year that the first additional contributions started */
export const TIER1_START_YEAR = 2019;

/** Year that the second additional contributions started */
export const TIER2_START_YEAR = 2024;

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
