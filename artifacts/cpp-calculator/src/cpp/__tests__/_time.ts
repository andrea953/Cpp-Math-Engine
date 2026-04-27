/**
 * Time-pinning helper for deterministic tests.
 *
 * The earnings projection in `buildEffectiveEarnings` uses
 * `new Date().getFullYear()` to decide where the projection segment begins,
 * and `socParser.ts` uses the current year to validate plausible year tokens.
 * Without pinning, tests would silently change behaviour every January 1.
 *
 * Usage:
 *   import { pinYear, unpinTime } from "./_time";
 *   beforeAll(() => pinYear(2026, 6, 15));
 *   afterAll(() => unpinTime());
 */
import { vi } from "vitest";

export function pinYear(year: number, month: number = 6, day: number = 15): void {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

export function unpinTime(): void {
  vi.useRealTimers();
}
