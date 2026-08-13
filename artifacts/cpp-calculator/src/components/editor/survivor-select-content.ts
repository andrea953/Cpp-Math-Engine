/**
 * Pure mapping between the persisted `deceasedReceivedCppBenefits` value
 * (undefined = unknown, true = yes, false = no) and the three-state select
 * shown on the survivor inputs panel.
 *
 * Kept React-free so tests can verify that the selector round-trips the
 * persisted value exactly — an untouched "Unknown" must stay `undefined`
 * (the key absent from the saved JSON), and an explicit "No" must stay
 * `false`, because the two drive different $2,500 death-benefit top-up
 * outcomes.
 */
export type DeceasedReceivedSelectValue = "unknown" | "yes" | "no";

export function deceasedReceivedToSelectValue(
  value: boolean | undefined,
): DeceasedReceivedSelectValue {
  return value === undefined ? "unknown" : value ? "yes" : "no";
}

export function selectValueToDeceasedReceived(
  value: string,
): boolean | undefined {
  return value === "unknown" ? undefined : value === "yes";
}
