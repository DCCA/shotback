import { defineConfig } from "@playwright/test";

// E2E smoke test for the built extension. It launches real Chromium (new
// headless) with the unpacked `dist/` loaded, so it is intentionally kept out
// of the `npm run check` gate and CI — run it locally with `npm run test:e2e`
// (which builds `dist/` first). Browsers must be installed once via
// `npx playwright install chromium`.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 10_000 }
});
