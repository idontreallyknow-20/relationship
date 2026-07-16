import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: "http://localhost:3111",
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
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
