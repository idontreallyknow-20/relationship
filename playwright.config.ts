import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: "http://localhost:3111",
    // Match the fixture couple's timezone so date-sensitive screens (the
    // daily question) behave the same no matter where CI runs.
    timezoneId: "America/New_York",
    launchOptions: {
      // The CI sandbox provides its own Chromium build and runs as root.
      executablePath: process.env.PW_CHROMIUM_PATH ?? undefined,
      args: process.env.PW_CHROMIUM_PATH ? ["--no-sandbox"] : [],
    },
  },
  projects: [
    {
      name: "iphone",
      // Chromium with iPhone 13 emulation (WebKit is not available in CI).
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3111",
    url: "http://localhost:3111/welcome",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
