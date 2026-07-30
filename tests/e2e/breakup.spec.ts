// The app is a single screen now: the heart break, the blackout, and the
// hidden way back to the animation.

import { expect, test } from "@playwright/test";

const SHOTS = "test-results/breakup";

test.describe("breakup screen", () => {
  for (const path of ["/", "/home", "/chat", "/welcome", "/settings"]) {
    test(`every route ends here: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("it's over")).toBeVisible({ timeout: 20_000 });
    });
  }

  test("goes black and offers another life", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByText("it's over")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/break-${testInfo.project.name}.png` });

    const egg = page.getByRole("button", { name: "Play it again" });
    await expect(egg).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("maybe in another life...")).toBeVisible();
    // Let the blackout finish fading before capturing it.
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${SHOTS}/blackout-${testInfo.project.name}.png` });

    // The easter egg: tapping "life" replays the animation.
    await egg.click();
    await expect(egg).toBeHidden();
    await expect(page.getByText("it's over")).toBeVisible({ timeout: 20_000 });
    await expect(egg).toBeVisible({ timeout: 20_000 });
  });
});
