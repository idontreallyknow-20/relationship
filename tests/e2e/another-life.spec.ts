// The in-another-life screen: black full-screen tap counter to 77777 that
// becomes a hand-drawn heart when the couple reaches the target.

import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock";

const SHOTS = "test-results/screens";

test.describe("another life", () => {
  test("renders the counter and per-person totals", async ({ page }, testInfo) => {
    await mockSupabase(page);
    await page.goto("/another-life");
    await expect(page.getByText("42/77777")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Joseph 12")).toBeVisible();
    await expect(page.getByText("Cami 30")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/another-life-${testInfo.project.name}.png` });
  });

  test("each pointer counts, so two fingers add two", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/another-life");
    const screen = page.locator(".another-life");
    await expect(page.getByText("42/77777")).toBeVisible({ timeout: 20_000 });
    await screen.dispatchEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 120, clientY: 220, button: 0,
    });
    await screen.dispatchEvent("pointerdown", {
      pointerId: 2, pointerType: "touch", clientX: 240, clientY: 420, button: 0,
    });
    await expect(page.getByText("44/77777")).toBeVisible();
    await expect(page.getByText("Joseph 14")).toBeVisible();
  });

  test("a tap shows a ripple that fades away", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/another-life");
    const screen = page.locator(".another-life");
    await expect(page.getByText("42/77777")).toBeVisible({ timeout: 20_000 });
    await screen.dispatchEvent("pointerdown", {
      pointerId: 3, pointerType: "touch", clientX: 180, clientY: 300, button: 0,
    });
    await expect(page.locator(".tap-ripple")).toHaveCount(1);
    await expect(page.locator(".tap-ripple")).toHaveCount(0, { timeout: 3_000 });
  });

  test("at 77777 only the heart remains and taps do nothing", async ({ page }, testInfo) => {
    await mockSupabase(page);
    await page.route("**/rest/v1/another_life_clicks**", (route) =>
      route.fulfill({
        json: [
          { person: "joseph", count: 40000 },
          { person: "cami", count: 37777 },
        ],
      }),
    );
    await page.goto("/another-life");
    const heart = page.locator('svg[aria-label="Heart"]');
    await expect(heart).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("77777")).toHaveCount(0);
    await page.locator(".another-life").dispatchEvent("pointerdown", {
      pointerId: 4, pointerType: "touch", clientX: 200, clientY: 200, button: 0,
    });
    await expect(page.locator(".tap-ripple")).toHaveCount(0);
    await expect(heart).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/another-life-done-${testInfo.project.name}.png` });
  });

  test("a note can be typed and sent without counting a tap", async ({ page }, testInfo) => {
    await mockSupabase(page);
    await page.goto("/another-life");
    await expect(page.getByText("42/77777")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Send a note" }).click();
    await page.getByPlaceholder("A note to Cami").fill("miss you");
    await page.screenshot({ path: `${SHOTS}/another-life-note-${testInfo.project.name}.png` });
    const request = page.waitForRequest(
      (r) => r.url().includes("/functions/v1/notify") && r.method() === "POST",
    );
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const req = await request;
    expect(req.postDataJSON()).toMatchObject({ category: "note", body: "miss you" });
    await expect(page.getByText("Sent")).toBeVisible();
    await expect(page.getByText("42/77777")).toBeVisible();
  });

  test("the root route lands on the counter when signed in", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.waitForURL("**/another-life", { timeout: 20_000 });
    await expect(page.getByText("42/77777")).toBeVisible({ timeout: 20_000 });
  });
});
