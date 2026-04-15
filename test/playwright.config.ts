import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for FinAlly E2E tests.
 *
 * Tests run against the app at http://localhost:8000 (or http://app:8000 in Docker).
 * The app should be started with LLM_MOCK=true for deterministic chat responses.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Run tests serially — they share a single app instance with persistent state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Generous timeout for SSE data to start flowing
    actionTimeout: 15_000,
  },

  // Global timeout per test — SSE and market data need time to initialize
  timeout: 60_000,

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
