import { defineConfig } from "vitest/config";

/**
 * Separate config for the cross-browser print page-count e2e test
 * (`whitePaperPrint.e2e.test.ts`). Kept out of `vitest.config.ts` so:
 *   - `pnpm test` stays fast and does not require a system Chromium
 *     binary or a transient Vite dev server.
 *   - `pnpm test:e2e` opts in to the heavier check that proves the
 *     Safari/Firefox `estimateWhitePaperPageCount` matches the page
 *     count Chromium actually produces from `Page.printToPDF`.
 *
 * The test boots its own Vite dev server inline, so the runner needs
 * generous timeouts and must run the file alone (no parallel workers
 * fighting over the shared Chromium binary or the dev port).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.e2e.test.ts"],
    globals: false,
    restoreMocks: true,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
