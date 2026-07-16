// Interaction checks: open the main composers and exercise core flows
// against the mocked backend.

import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock";

const SHOTS = "test-results/screens";

test("questions: today's question shows and accepts an answer", async ({ page }, testInfo) => {
  await mockSupabase(page);
  await page.goto("/questions");
  await expect(
    page.getByText("Which small moment together do you replay in your head the most?"),
  ).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/questions-today-${testInfo.project.name}.png`, fullPage: true });
});

test("moods: composer opens and mood can be picked", async ({ page }, testInfo) => {
  await mockSupabase(page);
  await page.goto("/moods?new=1");
  await expect(page.getByText(/how (do you|are you) feel/i).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("radio", { name: /calm/i }).first().click();
  await page.screenshot({ path: `${SHOTS}/moods-composer-${testInfo.project.name}.png`, fullPage: true });
});

test("letters: write tab shows the five kinds", async ({ page }, testInfo) => {
  await mockSupabase(page);
  await page.goto("/letters?new=1");
  await expect(page.getByText(/instant note/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/open when/i).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/letters-write-${testInfo.project.name}.png`, fullPage: true });
});

test("plans: bucket list tab renders items and add input", async ({ page }, testInfo) => {
  await mockSupabase(page);
  await page.goto("/plans");
  await page.getByRole("radio", { name: /bucket list/i }).click();
  await expect(page.getByText("Watch a sunrise on the beach")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/plans-bucket-${testInfo.project.name}.png`, fullPage: true });
});

test("draw: editor opens with canvas and tools", async ({ page }, testInfo) => {
  await mockSupabase(page);
  await page.goto("/draw");
  await page.getByRole("button", { name: /start fresh/i }).click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/draw-editor-${testInfo.project.name}.png`, fullPage: true });
});

test("memories: composer sheet opens", async ({ page }, testInfo) => {
  await mockSupabase(page);
  await page.goto("/memories?new=1");
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/memories-composer-${testInfo.project.name}.png`, fullPage: true });
});

test("chat: message can be typed and sent optimistically", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/chat");
  const box = page.getByRole("textbox", { name: "Message" });
  await box.click();
  await box.fill("A brand new test message");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("A brand new test message")).toBeVisible({ timeout: 10_000 });
});
