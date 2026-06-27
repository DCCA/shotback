import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright e2e spec under tests/e2e/ uses the
// @playwright/test runner (see playwright.config.ts), so it is excluded here.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
