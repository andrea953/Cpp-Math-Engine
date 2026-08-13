import type { ScenarioInputs } from "@/cpp";

/**
 * Content + selection logic for the client-facing "what to do when you apply"
 * guidance, kept free of React/UI imports so it can be unit-tested directly.
 *
 * Several CPP provisions that materially raise a pension are NOT applied
 * automatically — the contributor has to ask for them (or confirm them) when
 * they file with Service Canada. When a scenario relies on the child-rearing
 * provision (CRDO) or a period of disability, the client report surfaces a short
 * action list so the client knows what to take care of for their actual pension
 * to match this estimate.
 */

export interface ChecklistBlock {
  heading: string;
  intro: string;
  items: string[];
}

export const CRDO_BLOCK: ChecklistBlock = {
  heading: "Child-rearing provision",
  intro:
    "This estimate sets aside the lower-earning years you spent raising a child under the age of 7, which raises your pension. Service Canada does not apply this automatically — you have to request it.",
  items: [
    "When you apply for your CPP retirement pension, complete the child-rearing provision section of the application (form ISP-1640 if you apply on paper).",
    "Have ready, for each child: their full name, date of birth, and Social Insurance Number.",
    "Be ready to confirm you were the primary caregiver during those years — for example, that you were the parent who received the Family Allowance or was eligible for the Canada Child Benefit.",
  ],
};

export const DISABILITY_BLOCK: ChecklistBlock = {
  heading: "Period of disability",
  intro:
    "This estimate takes into account the months you received a CPP disability benefit. Those months are handled specially — they are set aside, or credited with typical earnings, so they don't pull your pension down.",
  items: [
    "If you received (or are receiving) a CPP disability benefit, Service Canada already has these periods on file and generally applies the adjustment automatically from your disability record.",
    "When you apply, confirm the disability period(s) shown on your record are correct and complete, and tell Service Canada if any period is missing or wrong.",
  ],
};

export const INTRO =
  "This estimate assumes one or more special CPP rules apply to you. Some of these are not applied automatically, so here is what to take care of when you apply to Service Canada — this helps make sure your actual pension matches this estimate.";

export const CLOSING =
  "If anything here is unclear, your planner can walk you through it before you submit your application.";

export function buildApplicationBlocks(inputs: ScenarioInputs): ChecklistBlock[] {
  const periods = inputs.dropoutPeriods ?? [];
  const blocks: ChecklistBlock[] = [];
  if (periods.some((p) => p.kind === "crdo")) blocks.push(CRDO_BLOCK);
  if (periods.some((p) => p.kind === "disability")) blocks.push(DISABILITY_BLOCK);
  return blocks;
}
