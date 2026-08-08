import { defineConfig, devices } from "@playwright/test";

// See tests/e2e/README.md for the full architecture writeup (auth
// strategy, fixture strategy, known limitations).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const AUTH_STATE_PATH = "tests/e2e/.auth/qa-user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  // A single shared QA tenant + one persisted session is reused by every
  // test in this run (see global.setup.ts) — parallel workers would race
  // on the same fixture rows and the same storageState file, so this
  // suite runs its specs serially. Deliberately small/high-signal (see
  // ROADMAP.md), so this isn't a throughput problem in practice.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }], ["list"]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // No video by default — trace already includes a DOM timeline/
    // screenshots for debugging a failure without the extra artifact
    // size/overhead a video adds on every run (task instructions:
    // "keine riesigen Artefakte standardmäßig dauerhaft"). Override with
    // PLAYWRIGHT_VIDEO=on locally when actually diagnosing something.
    video: (process.env.PLAYWRIGHT_VIDEO as "on" | "off" | undefined) ?? "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      teardown: "cleanup",
    },
    {
      name: "cleanup",
      testMatch: /global\.teardown\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE_PATH },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      // A representative modern smartphone viewport — this is a smoke
      // test, not a device-matrix suite (task instructions: no
      // pixel-perfect screenshot suite).
      use: { ...devices["Pixel 7"], storageState: AUTH_STATE_PATH },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
