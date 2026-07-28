// Every screen has to survive losing the backend.
//
// The app shell is the service worker's job; what is tested here is the data
// layer. Each screen is visited once with a working backend to warm the
// cache, then the REST endpoint is cut and the page reloaded. What was on
// screen before must still be on screen after.
//
// Auth is left reachable because the session lives in local storage and is
// not what any of this is about.

import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock";

const screens: { path: string; name: string; expect: RegExp }[] = [
  { path: "/chat", name: "chat", expect: /bookshop|hello|message/i },
  { path: "/memories", name: "memories", expect: /memor/i },
  { path: "/letters", name: "letters", expect: /letter|write/i },
  { path: "/plans", name: "plans", expect: /calendar|plan|bucket/i },
  { path: "/moods", name: "moods", expect: /mood|feel/i },
  { path: "/home", name: "home", expect: /Good (morning|afternoon|evening)|Up late/ },
  { path: "/questions", name: "questions", expect: /question/i },
  { path: "/jar", name: "jar", expect: /Love Jar/i },
];

for (const screen of screens) {
  test(`${screen.name} still renders with the backend gone`, async ({ page }) => {
    await mockSupabase(page);

    // Warm the cache with a normal visit.
    await page.goto(screen.path);
    await expect(page.getByText(screen.expect).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_200);

    // Now take the backend away and come back to the page.
    await page.route("**/rest/v1/**", (route) => route.abort("failed"));
    await page.reload();

    // Generous, because an aborted request can hang until the query deadline
    // rather than failing fast. A real offline device rejects immediately.
    await expect(page.getByText(screen.expect).first()).toBeVisible({ timeout: 25_000 });
  });
}
