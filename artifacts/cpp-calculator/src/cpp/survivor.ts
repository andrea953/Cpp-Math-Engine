/**
 * CPP survivor-side benefits.
 *
 * Models:
 *  - Survivor's pension (base + enhanced portions, age-tiered)
 *  - One-time death benefit ($2,500 since 2019; deaths on/after Jan 1, 2025
 *    may include a $2,500 top-up, to a maximum of $5,000)
 *  - Children's benefit (per eligible dependent child)
 *  - Combined-benefit cap when the survivor is also receiving their own CPP retirement
 *
 * Statute: Canada Pension Plan Act, RSC 1985, c. C-8
 *  - Survivor's pension (rates, flat-rate, under-45 reduction, combined cap): s. 58
 *  - Death benefit ($2,500): s. 57(1)(b)
 *  - Children's / orphan's benefit: s. 59
 *  https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html
 * Plain-language: Service Canada — CPP survivor's, death and children's benefits.
 */

import {
  DEATH_BENEFIT_AMOUNT,
  DEATH_BENEFIT_TOPUP_AMOUNT,
  DEATH_BENEFIT_TOPUP_START_YEAR,
  SURVIVOR_ENHANCED_RATE,
  SURVIVOR_FULL_RATE_AGE,
  SURVIVOR_MIN_ELIGIBLE_AGE,
  SURVIVOR_RATE_65_PLUS,
  SURVIVOR_RATE_UNDER_65,
  getChildrensBenefit,
  getMaxBenefitAt65,
  getSurvivorFlatRate,
} from "./constants";
import { calculateCpp } from "./calculate";
import type { ScenarioInputs } from "./types";

export interface SurvivorInputs {
  /** Whether to compute survivor benefits at all. */
  enabled: boolean;
  /** Calendar year that survivor benefits begin (typically the year of death). */
  startYear: number;
  /** Survivor's age (in whole years) when survivor benefits begin. */
  survivorAge: number;
  /** Whether the survivor has dependent children at start (affects under-45 reduction). */
  hasDependentChildren: boolean;
  /** Whether the survivor is themselves disabled (CPP disability) at start. */
  survivorDisabled: boolean;
  /**
   * Whether the deceased ever received a CPP/QPP retirement pension,
   * disability benefit, or post-retirement disability benefit. Drives the
   * 2025+ death-benefit top-up. Omit/undefined = unknown; the engine then only
   * assumes "never received" when death occurs before age 60 AND treats
   * disability receipt as an undisclosed assumption.
   */
  deceasedReceivedCppBenefits?: boolean;
  /** Number of eligible dependent children of the deceased (each receives a children's benefit). */
  numEligibleChildren: number;
  /** Survivor's own monthly base+Tier 1 CPP retirement pension at start (for combined-cap analysis). 0 if not yet collecting. */
  survivorOwnBaseTier1Monthly: number;
  /** Survivor's own monthly Tier 2 CPP retirement pension at start. 0 if not applicable. */
  survivorOwnTier2Monthly: number;
}

export interface SurvivorResult {
  /** Year survivor benefits begin */
  startYear: number;
  /** Survivor's age at start */
  survivorAge: number;

  /** Deceased's calculated retirement pension at 65 (in start-year dollars), pre-take-up adjustment */
  deceasedCalculatedRetirementBaseTier1: number;
  /** Deceased's enhanced (Tier 2) retirement pension portion at 65 */
  deceasedCalculatedRetirementTier2: number;

  /** Survivor's pension — base + Tier 1 portion (uncapped, before combined-benefit cap) */
  survivorPensionBaseTier1: number;
  /** Survivor's pension — Tier 2 portion (not subject to combined cap) */
  survivorPensionTier2: number;
  /** Survivor flat-rate component (only if survivor is under 65 with no children/disability conditions met) */
  survivorFlatRate: number;

  /** Combined cap applied to (own retirement base+Tier1 + survivor pension base+Tier1) — limit at the year's max retirement pension at 65 */
  combinedBenefitCap: number;
  /** Survivor's pension base+Tier 1 portion AFTER combined cap (i.e. what they actually receive) */
  survivorPensionBaseTier1AfterCap: number;
  /** How much was clawed back by the combined cap (always >= 0) */
  combinedCapReduction: number;

  /** Total monthly survivor's pension (base+Tier1 after cap + Tier 2 + flat rate) */
  survivorMonthlyTotal: number;
  /** Annualized survivor's pension */
  survivorAnnualTotal: number;

  /** Combined monthly: survivor's own retirement + survivor's pension */
  combinedMonthlyTotal: number;

  /** One-time death benefit (lump sum). Basic $2,500; deaths on/after Jan 1, 2025 may include a $2,500 top-up (max $5,000). */
  deathBenefit: number;
  /** Basic portion of the death benefit ($2,500 since 2019). */
  deathBenefitBasic: number;
  /** Top-up portion of the death benefit ($2,500 for eligible deaths on/after Jan 1, 2025; otherwise 0). */
  deathBenefitTopUp: number;
  /**
   * Client-friendly one-liner (second person, addressed to the contributor)
   * explaining whether the 2025+ death-benefit top-up applies and why.
   * Empty string when no survivor-side benefits are payable at all.
   */
  deathBenefitTopUpExplanation: string;

  /** Children's benefit per child (monthly) */
  childrensBenefitPerChild: number;
  /** Total monthly children's benefit (per-child × number of eligible children) */
  childrensBenefitMonthlyTotal: number;

  /** Diagnostic: reduction factor applied to under-65 base for ages 35-44 (1.0 at 45+, 0 at 35) */
  underAgeReductionFactor: number;
  /** Notes/warnings about eligibility */
  notes: string[];
}

/**
 * Compute the deceased contributor's "calculated retirement pension" at age 65
 * as of the survivor benefit start year. Uses the existing engine with startAge=65,
 * but truncates earnings AND the projection horizon (stopWorkAge) to the year of
 * death so no contributions are projected after death.
 *
 * Limitation: the engine's contributory period still extends from age 18 to 65,
 * meaning years between the death year and age 65 are included as zero-earning
 * years (partially offset by the general 17% drop-out). For deaths well before
 * 60, this can understate the deceased's calculated retirement pension. The
 * survivor result attaches a note when this limitation is materially in play.
 */
function computeDeceasedRetirementAt65(
  inputs: ScenarioInputs,
  deathYear: number,
): { baseTier1Monthly: number; tier2Monthly: number; deathAge: number } {
  const deathAge = deathYear - inputs.birthYear;
  const truncatedEarnings = inputs.earningsHistory.filter((r) => r.year <= deathYear);
  const truncated: ScenarioInputs = {
    ...inputs,
    earningsHistory: truncatedEarnings,
    startAges: [65],
    assumptions: {
      ...inputs.assumptions,
      // Clamp work-cessation to death age so buildEffectiveEarnings stops projecting at death.
      stopWorkAge: Math.min(inputs.assumptions.stopWorkAge, deathAge, 65),
    },
  };
  const result = calculateCpp(truncated);
  const r = result.byStartAge.find((r) => r.startAge === 65);
  if (!r) return { baseTier1Monthly: 0, tier2Monthly: 0, deathAge };
  return {
    baseTier1Monthly: r.baseMonthly + r.tier1Monthly,
    tier2Monthly: r.tier2Monthly,
    deathAge,
  };
}

export function calculateSurvivor(
  inputs: ScenarioInputs,
  survivor: SurvivorInputs,
): SurvivorResult {
  const notes: string[] = [];
  const indexingRate = inputs.assumptions.indexingRate;

  const { baseTier1Monthly, tier2Monthly, deathAge } = computeDeceasedRetirementAt65(
    inputs,
    survivor.startYear,
  );

  // Eligibility: survivor pension, death benefit, and children's benefit all
  // require the deceased to have made qualifying CPP contributions. If the
  // deceased's calculated retirement pension at 65 is zero, treat as no
  // eligibility for any survivor-side benefit.
  const deceasedQualifies = baseTier1Monthly > 0 || tier2Monthly > 0;
  if (!deceasedQualifies) {
    notes.push(
      "Deceased has no calculated CPP retirement on file — no survivor pension, death benefit, or children's benefit is payable. Confirm the earnings history is populated.",
    );
    return {
      startYear: survivor.startYear,
      survivorAge: survivor.survivorAge,
      deceasedCalculatedRetirementBaseTier1: 0,
      deceasedCalculatedRetirementTier2: 0,
      survivorPensionBaseTier1: 0,
      survivorPensionTier2: 0,
      survivorFlatRate: 0,
      combinedBenefitCap: getMaxBenefitAt65(survivor.startYear, indexingRate),
      survivorPensionBaseTier1AfterCap: 0,
      combinedCapReduction: 0,
      survivorMonthlyTotal: 0,
      survivorAnnualTotal: 0,
      combinedMonthlyTotal: 0,
      deathBenefit: 0,
      deathBenefitBasic: 0,
      deathBenefitTopUp: 0,
      deathBenefitTopUpExplanation: "",
      childrensBenefitPerChild: getChildrensBenefit(survivor.startYear, indexingRate),
      childrensBenefitMonthlyTotal: 0,
      underAgeReductionFactor: 0,
      notes,
    };
  }

  if (deathAge < 60) {
    notes.push(
      `Deceased age at start of benefits is ${deathAge}. The contributory-period model extends to age 65, so years between the death year and age 65 are treated as zero-earning years; the calculated retirement pension may be understated for early-death scenarios.`,
    );
  }

  // ---------------------------------------------------------------------
  // Survivor's pension — base + Tier 1 portion
  // ---------------------------------------------------------------------
  let survivorRate: number;
  let underAgeReductionFactor = 1;
  let flatRate = 0;

  if (survivor.survivorAge >= 65) {
    survivorRate = SURVIVOR_RATE_65_PLUS;
  } else {
    survivorRate = SURVIVOR_RATE_UNDER_65;
    flatRate = getSurvivorFlatRate(survivor.startYear, indexingRate);

    // Under-45 reduction: only applies if no children and not disabled (CPP Act s. 58).
    const exempt = survivor.hasDependentChildren || survivor.survivorDisabled;
    if (!exempt && survivor.survivorAge < SURVIVOR_FULL_RATE_AGE) {
      if (survivor.survivorAge < SURVIVOR_MIN_ELIGIBLE_AGE) {
        underAgeReductionFactor = 0;
        notes.push(
          `Survivor is under ${SURVIVOR_MIN_ELIGIBLE_AGE} with no dependent children and not disabled — no survivor pension is payable until age 65.`,
        );
      } else {
        const monthsUnder45 = (SURVIVOR_FULL_RATE_AGE - survivor.survivorAge) * 12;
        underAgeReductionFactor = Math.max(0, 1 - monthsUnder45 / 120);
        notes.push(
          `Survivor is ${survivor.survivorAge} (no children, not disabled) — reduction of 1/120 per month under 45 applied (factor ${underAgeReductionFactor.toFixed(3)}).`,
        );
      }
    }
  }

  const survivorPensionBaseTier1Uncapped =
    baseTier1Monthly * survivorRate * underAgeReductionFactor;
  const survivorFlatRateComponent = flatRate * underAgeReductionFactor;

  // ---------------------------------------------------------------------
  // Survivor's pension — Tier 2 enhancement portion
  // (37.5% of deceased's enhanced amount; subject to the same under-45
  // reduction as the base portion, but NOT subject to the combined cap.)
  // ---------------------------------------------------------------------
  const survivorPensionTier2 = tier2Monthly * SURVIVOR_ENHANCED_RATE * underAgeReductionFactor;

  // ---------------------------------------------------------------------
  // Combined-benefit cap (base + Tier 1 portion only) — CPP Act s. 58.
  // The sum of (own retirement base+Tier1) + (survivor pension base+Tier1)
  // cannot exceed the maximum retirement pension at 65 for the start year.
  // ---------------------------------------------------------------------
  const combinedCap = getMaxBenefitAt65(survivor.startYear, indexingRate);
  const ownBaseTier1 = Math.max(0, survivor.survivorOwnBaseTier1Monthly);
  const allowedSurvivorBaseTier1 = Math.max(0, combinedCap - ownBaseTier1);
  const survivorPensionBaseTier1AfterCap = Math.min(
    survivorPensionBaseTier1Uncapped,
    allowedSurvivorBaseTier1,
  );
  const combinedCapReduction = Math.max(
    0,
    survivorPensionBaseTier1Uncapped - survivorPensionBaseTier1AfterCap,
  );
  if (combinedCapReduction > 0) {
    notes.push(
      `Combined-benefit cap reduced the survivor's base + Tier 1 pension by $${combinedCapReduction.toFixed(2)}/mo (own retirement pension consumes most of the cap).`,
    );
  }

  const survivorMonthlyTotal =
    survivorPensionBaseTier1AfterCap + survivorPensionTier2 + survivorFlatRateComponent;
  const survivorAnnualTotal = survivorMonthlyTotal * 12;

  const combinedMonthlyTotal =
    ownBaseTier1 +
    Math.max(0, survivor.survivorOwnTier2Monthly) +
    survivorMonthlyTotal;

  // ---------------------------------------------------------------------
  // Death benefit (lump sum). Basic $2,500 for deaths after Dec 31, 2018.
  // For deaths on/after Jan 1, 2025 a $2,500 top-up (max $5,000) applies when
  // the deceased never received a CPP/QPP retirement pension, disability
  // benefit, or post-retirement disability benefit AND no surviving
  // spouse/common-law partner is eligible for a survivor's pension. This tool
  // always models a surviving spouse, so the spouse condition is met only when
  // that spouse is NOT eligible for any survivor's pension (under 35 with no
  // dependent children and not disabled). Receipt status comes from the
  // explicit `deceasedReceivedCppBenefits` input; when it is unknown we only
  // infer "never received" for deaths before age 60 (no retirement pension is
  // possible before 60) and disclose the assumed absence of disability receipt.
  // ---------------------------------------------------------------------
  const deathBenefitBasic = DEATH_BENEFIT_AMOUNT;
  const survivorIneligibleForPension =
    survivor.survivorAge < SURVIVOR_MIN_ELIGIBLE_AGE &&
    !survivor.hasDependentChildren &&
    !survivor.survivorDisabled;
  // "Never received" is a statement about actual benefit receipt, not age.
  // Use the explicit input when provided. When unknown, only infer
  // "never received" for deaths before 60 (a retirement pension is impossible
  // before 60), disclosing that disability receipt is assumed absent.
  const neverReceivedKnown = survivor.deceasedReceivedCppBenefits !== undefined;
  const deceasedNeverReceived = neverReceivedKnown
    ? !survivor.deceasedReceivedCppBenefits
    : deathAge < 60;
  let deathBenefitTopUp = 0;
  if (
    survivor.startYear >= DEATH_BENEFIT_TOPUP_START_YEAR &&
    survivorIneligibleForPension &&
    deceasedNeverReceived
  ) {
    deathBenefitTopUp = DEATH_BENEFIT_TOPUP_AMOUNT;
    notes.push(
      neverReceivedKnown
        ? `Death benefit includes the $${DEATH_BENEFIT_TOPUP_AMOUNT.toLocaleString()} top-up for deaths on or after January 1, 2025 (deceased never received CPP/QPP retirement or disability benefits, and the survivor is not eligible for a survivor's pension).`
        : `Death benefit includes the $${DEATH_BENEFIT_TOPUP_AMOUNT.toLocaleString()} top-up for deaths on or after January 1, 2025 (death before age 60 means no CPP retirement pension was possible, and the survivor is not eligible for a survivor's pension). Assumes the deceased never received a CPP/QPP disability benefit — confirm with the "received CPP/QPP benefits" setting.`,
    );
  } else if (survivor.startYear >= DEATH_BENEFIT_TOPUP_START_YEAR) {
    notes.push(
      !neverReceivedKnown && deathAge >= 60 && survivorIneligibleForPension
        ? "Death benefit shown is the $2,500 basic amount. If the deceased never received CPP/QPP retirement or disability benefits, a $2,500 top-up (total $5,000) may apply — set the \"received CPP/QPP benefits\" option to confirm."
        : "Death benefit shown is the $2,500 basic amount. The $2,500 top-up (deaths on/after Jan 1, 2025) does not apply when the deceased received CPP/QPP retirement or disability benefits or a spouse is eligible for a survivor's pension.",
    );
  }
  const deathBenefit = deathBenefitBasic + deathBenefitTopUp;

  // Client-friendly one-liner (second person) explaining whether the 2025+
  // top-up applies and why — used verbatim on the printed handout and as the
  // caption on the live results card.
  let deathBenefitTopUpExplanation: string;
  if (survivor.startYear < DEATH_BENEFIT_TOPUP_START_YEAR) {
    deathBenefitTopUpExplanation =
      "The extra $2,500 top-up only applies to deaths on or after January 1, 2025, so this estimate shows the $2,500 basic amount.";
  } else if (deathBenefitTopUp > 0) {
    deathBenefitTopUpExplanation = neverReceivedKnown
      ? "The extra $2,500 top-up applies because you never received CPP/QPP retirement or disability benefits and your spouse would not qualify for a monthly survivor's pension."
      : "The extra $2,500 top-up applies because a death before age 60 means no CPP retirement pension was received and your spouse would not qualify for a monthly survivor's pension (assumes no CPP/QPP disability benefits were received).";
  } else if (!survivorIneligibleForPension) {
    deathBenefitTopUpExplanation =
      "The extra $2,500 top-up does not apply because your spouse qualifies for a monthly survivor's pension.";
  } else if (neverReceivedKnown) {
    deathBenefitTopUpExplanation =
      "The extra $2,500 top-up does not apply because you already received CPP/QPP retirement or disability benefits.";
  } else {
    deathBenefitTopUpExplanation =
      "The extra $2,500 top-up may apply if you never received CPP/QPP retirement or disability benefits — this estimate shows the $2,500 basic amount until that is confirmed.";
  }

  // ---------------------------------------------------------------------
  // Children's benefit
  // ---------------------------------------------------------------------
  const childrensBenefitPerChild = getChildrensBenefit(survivor.startYear, indexingRate);
  const childrensBenefitMonthlyTotal =
    childrensBenefitPerChild * Math.max(0, survivor.numEligibleChildren);

  return {
    startYear: survivor.startYear,
    survivorAge: survivor.survivorAge,
    deceasedCalculatedRetirementBaseTier1: baseTier1Monthly,
    deceasedCalculatedRetirementTier2: tier2Monthly,
    survivorPensionBaseTier1: survivorPensionBaseTier1Uncapped,
    survivorPensionTier2,
    survivorFlatRate: survivorFlatRateComponent,
    combinedBenefitCap: combinedCap,
    survivorPensionBaseTier1AfterCap,
    combinedCapReduction,
    survivorMonthlyTotal,
    survivorAnnualTotal,
    combinedMonthlyTotal,
    deathBenefit,
    deathBenefitBasic,
    deathBenefitTopUp,
    deathBenefitTopUpExplanation,
    childrensBenefitPerChild,
    childrensBenefitMonthlyTotal,
    underAgeReductionFactor,
    notes,
  };
}

export function buildDefaultSurvivorInputs(currentYear: number): SurvivorInputs {
  return {
    enabled: false,
    startYear: currentYear,
    survivorAge: 65,
    hasDependentChildren: false,
    survivorDisabled: false,
    numEligibleChildren: 0,
    survivorOwnBaseTier1Monthly: 0,
    survivorOwnTier2Monthly: 0,
  };
}
