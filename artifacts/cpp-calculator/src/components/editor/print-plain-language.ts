/**
 * Plain-language translation layer for the printed client report.
 *
 * The calculation engine (calculate.ts, survivor.ts) emits precise but
 * technical notes and warnings meant for the advisor. Before anything is
 * printed on the client handout, these strings are run through the mappers
 * below and rewritten as short, friendly sentences a client with no CPP
 * knowledge can read. Unrecognized strings fall back to the original text so
 * new engine messages are never silently dropped.
 *
 * React-free so it can be unit-tested directly (see the cpp-calculator vitest
 * alias constraint on importing component modules).
 */

interface Translation {
  match: RegExp;
  rewrite: (m: RegExpMatchArray) => string;
}

function translate(text: string, table: Translation[]): string {
  for (const t of table) {
    const m = text.match(t.match);
    if (m) return t.rewrite(m);
  }
  return text; // safe fallback: keep the original wording
}

// ---------------------------------------------------------------------------
// Calculator warnings → "Good to know" sentences
// ---------------------------------------------------------------------------

const WARNING_TRANSLATIONS: Translation[] = [
  {
    match: /^Negative pensionable earnings in (\d{4})$/,
    rewrite: (m) =>
      `One of the earnings years in this scenario (${m[1]}) shows an amount below zero — ask your planner to double-check that entry.`,
  },
  {
    match: /^Birth year (\d+) is out of range/,
    rewrite: (m) =>
      `The birth year entered (${m[1]}) doesn't look right — ask your planner to confirm it.`,
  },
  {
    match: /^No start ages provided$/,
    rewrite: () =>
      "No start ages were selected for this scenario, so there is nothing to show yet.",
  },
];

export function translateWarning(warning: string): string {
  return translate(warning, WARNING_TRANSLATIONS);
}

// ---------------------------------------------------------------------------
// Survivor notes → family-section sentences
// ---------------------------------------------------------------------------

const SURVIVOR_NOTE_TRANSLATIONS: Translation[] = [
  {
    match: /^Deceased has no calculated CPP retirement on file/,
    rewrite: () =>
      "We couldn't calculate a CPP pension from the earnings information entered, so no family benefits are shown here. Your planner can review the earnings history with you.",
  },
  {
    match: /^Deceased age at start of benefits is (\d+)\./,
    rewrite: () =>
      "Because this scenario looks at a death before age 65, the estimate errs on the low side — the actual support your family receives could be somewhat higher.",
  },
  {
    match: /^Survivor is under (\d+) with no dependent children and not disabled/,
    rewrite: (m) =>
      `Under CPP rules, a surviving spouse who is younger than ${m[1]}, has no children at home, and is not disabled doesn't receive the monthly survivor's pension right away — it begins at age 65 instead.`,
  },
  {
    match: /^Survivor is (\d+) \(no children, not disabled\) — reduction/,
    rewrite: () =>
      "Because the surviving spouse would be under 45 with no children at home and not disabled, CPP rules reduce the monthly survivor's pension. The amount shown already includes this reduction.",
  },
  {
    match: /^Combined-benefit cap reduced the survivor's base \+ Tier 1 pension by \$([\d.,]+)\/mo/,
    rewrite: (m) =>
      `CPP limits how much one person can collect from their own pension and a survivor's pension combined. Because of that limit, the survivor's pension shown here is about $${m[1]} a month lower than it would otherwise be.`,
  },
  {
    match: /^Death benefit includes the \$([\d,]+) top-up[\s\S]*Assumes the deceased never received/,
    rewrite: (m) =>
      `The one-time payment shown includes an extra $${m[1]} that applies in this situation. This assumes no CPP or QPP disability payments were ever received — your planner can confirm this detail.`,
  },
  {
    match: /^Death benefit includes the \$([\d,]+) top-up/,
    rewrite: (m) =>
      `The one-time payment shown includes an extra $${m[1]} that applies in this situation, because no CPP pension was ever received and no monthly survivor's pension would be payable.`,
  },
  {
    match: /^Death benefit shown is the \$2,500 basic amount\. If the deceased never received/,
    rewrite: () =>
      "The one-time payment shown is the standard $2,500. It could be as much as $5,000 if no CPP or QPP payments were ever received — your planner can confirm which applies.",
  },
  {
    match: /^Death benefit shown is the \$2,500 basic amount/,
    rewrite: () =>
      "The one-time payment shown is the standard $2,500 amount that applies in this situation.",
  },
];

export function translateSurvivorNote(note: string): string {
  return translate(note, SURVIVOR_NOTE_TRANSLATIONS);
}
