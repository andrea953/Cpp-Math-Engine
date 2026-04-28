import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // The cross-browser print e2e test boots its own Vite dev server
    // and a real Chromium via puppeteer-core; it is opted in via
    // `pnpm test:e2e` (see `vitest.e2e.config.ts`) so the default
    // `pnpm test` flow stays fast and headless.
    exclude: ["**/node_modules/**", "**/*.e2e.test.ts"],
    globals: false,
    restoreMocks: true,
  },
});
