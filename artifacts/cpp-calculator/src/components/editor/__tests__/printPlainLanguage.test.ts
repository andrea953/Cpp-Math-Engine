import { describe, expect, it } from "vitest";
import {
  translateSurvivorNote,
  translateWarning,
} from "../print-plain-language";

describe("translateWarning", () => {
  it("rewrites negative-earnings warnings in plain language", () => {
    const out = translateWarning("Negative pensionable earnings in 2019");
    expect(out).toContain("2019");
    expect(out).not.toContain("pensionable");
    expect(out.toLowerCase()).toContain("planner");
  });

  it("rewrites out-of-range birth year warnings", () => {
    const out = translateWarning("Birth year 1875 is out of range (1900-2100)");
    expect(out).toContain("1875");
    expect(out).not.toContain("out of range");
  });

  it("falls back to the original text for unknown warnings", () => {
    expect(translateWarning("Some brand new engine warning")).toBe(
      "Some brand new engine warning",
    );
  });
});

describe("translateSurvivorNote", () => {
  it("rewrites the no-contributions note", () => {
    const out = translateSurvivorNote(
      "Deceased has no calculated CPP retirement on file — no survivor pension, death benefit, or children's benefit is payable. Confirm the earnings history is populated.",
    );
    expect(out).not.toContain("Deceased");
    expect(out.toLowerCase()).toContain("planner");
  });

  it("rewrites the early-death contributory-period note", () => {
    const out = translateSurvivorNote(
      "Deceased age at start of benefits is 52. The contributory-period model extends to age 65, so years between the death year and age 65 are treated as zero-earning years; the calculated retirement pension may be understated for early-death scenarios.",
    );
    expect(out).not.toContain("contributory-period");
    expect(out).not.toContain("Deceased");
  });

  it("rewrites the under-35 no-pension note", () => {
    const out = translateSurvivorNote(
      "Survivor is under 35 with no dependent children and not disabled — no survivor pension is payable until age 65.",
    );
    expect(out).toContain("35");
    expect(out).toContain("65");
    expect(out).not.toMatch(/^Survivor is/);
  });

  it("rewrites the under-45 reduction note without the raw factor", () => {
    const out = translateSurvivorNote(
      "Survivor is 40 (no children, not disabled) — reduction of 1/120 per month under 45 applied (factor 0.500).",
    );
    expect(out).not.toContain("1/120");
    expect(out).not.toContain("factor");
  });

  it("rewrites the combined-cap note and keeps the dollar amount", () => {
    const out = translateSurvivorNote(
      "Combined-benefit cap reduced the survivor's base + Tier 1 pension by $123.45/mo (own retirement pension consumes most of the cap).",
    );
    expect(out).toContain("$123.45");
    expect(out).not.toContain("Tier 1");
  });

  it("rewrites death-benefit top-up notes", () => {
    const known = translateSurvivorNote(
      "Death benefit includes the $2,500 top-up for deaths on or after January 1, 2025 (deceased never received CPP/QPP retirement or disability benefits, and the survivor is not eligible for a survivor's pension).",
    );
    expect(known).toContain("$2,500");
    expect(known).not.toContain("deceased");

    const assumed = translateSurvivorNote(
      'Death benefit includes the $2,500 top-up for deaths on or after January 1, 2025 (death before age 60 means no CPP retirement pension was possible, and the survivor is not eligible for a survivor\'s pension). Assumes the deceased never received a CPP/QPP disability benefit — confirm with the "received CPP/QPP benefits" setting.',
    );
    expect(assumed.toLowerCase()).toContain("planner");
    expect(assumed).not.toContain("setting");
  });

  it("rewrites basic death-benefit notes", () => {
    const maybe = translateSurvivorNote(
      'Death benefit shown is the $2,500 basic amount. If the deceased never received CPP/QPP retirement or disability benefits, a $2,500 top-up (total $5,000) may apply — set the "received CPP/QPP benefits" option to confirm.',
    );
    expect(maybe).toContain("$5,000");
    expect(maybe).not.toContain("option to confirm");

    const notApplicable = translateSurvivorNote(
      "Death benefit shown is the $2,500 basic amount. The $2,500 top-up (deaths on/after Jan 1, 2025) does not apply when the deceased received CPP/QPP retirement or disability benefits or a spouse is eligible for a survivor's pension.",
    );
    expect(notApplicable).toContain("$2,500");
    expect(notApplicable).not.toContain("deceased");
  });

  it("falls back to the original text for unknown notes", () => {
    expect(translateSurvivorNote("A brand new survivor note")).toBe(
      "A brand new survivor note",
    );
  });
});
