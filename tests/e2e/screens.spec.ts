// The app is the in-another-life counter now: every inner route must land
// on it, and the pairing screen is the only other thing a person can see.

import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock";

const SHOTS = "test-results/screens";

const hiddenRoutes = [
  "/home",
  "/chat",
  "/moods",
  "/questions",
  "/letters",
  "/memories",
  "/plans",
  "/location",
  "/us",
  "/settings",
  "/draw",
];

test.describe("screens", () => {
  for (const path of hiddenRoutes) {
    test(`${path} stays black and lands on the counter`, async ({ page }) => {
      await mockSupabase(page);
      await page.goto(path);
      await page.waitForURL("**/another-life", { timeout: 20_000 });
      await expect(page.getByText("42/77777")).toBeVisible({ timeout: 20_000 });
    });
  }

  test("welcome screen shows both profiles", async ({ page }, testInfo) => {
    await page.route("**/rest/v1/rpc/pin_available**", (route) => route.fulfill({ json: false }));
    await page.route("**/auth/v1/**", (route) => route.fulfill({ json: {} }));
    await page.goto("/welcome");
    await expect(page.getByText("Who are you?")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Cami", { exact: true })).toBeVisible();
    await expect(page.getByText("Joseph", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/welcome-${testInfo.project.name}.png`, fullPage: true });
  });
});
