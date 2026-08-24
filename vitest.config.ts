import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright e2e spec under tests/e2e/ uses the
// @playwright/test runner (see playwright.config.ts), so it is excluded here.
export default defineConfig({
  // Mirror the `@/*` -> `src/*` alias from vite.config.ts/tsconfig so modules
  // under test can import each other the way the app does.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
