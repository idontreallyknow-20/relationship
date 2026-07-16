// Visual sweep: loads every major screen with a mocked backend, asserts the
// core content rendered, and captures screenshots for inspection.

import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock";

const SHOTS = "test-results/screens";

const screens: { path: string; name: string; expectText: string | RegExp }[] = [
  { path: "/home", name: "home", expectText: /Good (morning|afternoon|evening)|Up late/ },
  { path: "/chat", name: "chat", expectText: /bookshop|hello|message/i },
  { path: "/moods", name: "moods", expectText: /mood|feel/i },
  { path: "/questions", name: "questions", expectText: /question/i },
  { path: "/letters", name: "letters", expectText: /letter|write/i },
  { path: "/memories", name: "memories", expectText: /memor/i },
  { path: "/plans", name: "plans", expectText: /calendar|plan|bucket/i },
  { path: "/location", name: "location", expectText: /location|share/i },
  { path: "/us", name: "us", expectText: /Cami & Joseph/ },
  { path: "/settings", name: "settings", expectText: /profile|Settings/i },
  { path: "/draw", name: "draw", expectText: /draw/i },
];

test.describe("screens", () => {
  for (const screen of screens) {
    test(`renders ${screen.name}`, async ({ page }, testInfo) => {
      await mockSupabase(page);
      await page.goto(screen.path);
      await expect(page.getByText(screen.expectText).first()).toBeVisible({ timeout: 20_000 });
      // Give images/fonts a beat to settle before the screenshot.
      await page.waitForTimeout(900);
      await page.screenshot({
        path: `${SHOTS}/${screen.name}-${testInfo.project.name}.png`,
        fullPage: true,
      });
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
