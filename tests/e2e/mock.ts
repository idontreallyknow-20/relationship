// Intercepts every Supabase request so the app can be exercised visually
// without a network connection. The tiny filter engine below supports the
// query shapes the app actually uses.

import type { Page } from "@playwright/test";
import { fixtures, JOSEPH_ID } from "./fixtures";

const SUPABASE_URL = "https://vahhsjtxhjddohtgqtaj.supabase.co";
const REF = "vahhsjtxhjddohtgqtaj";

function applyFilters(rows: unknown[], params: URLSearchParams): unknown[] {
  let out = [...rows] as Record<string, unknown>[];
  for (const [key, raw] of params.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (op === "eq") out = out.filter((r) => String(r[key]) === value);
    else if (op === "is" && value === "null") out = out.filter((r) => r[key] === null);
    else if (op === "gt") out = out.filter((r) => String(r[key]) > value);
    else if (op === "gte") out = out.filter((r) => String(r[key]) >= value);
    else if (op === "lt") out = out.filter((r) => String(r[key]) < value);
    else if (op === "lte") out = out.filter((r) => String(r[key]) <= value);
    else if (op === "ilike") {
      const needle = value.replaceAll("%", "").toLowerCase();
      out = out.filter((r) => String(r[key] ?? "").toLowerCase().includes(needle));
    } else if (op === "not" && rest[0] === "is" && rest[1] === "null") {
      out = out.filter((r) => r[key] !== null);
    }
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out.sort((a, b) => {
      const av = String(a[col] ?? "");
      const bv = String(b[col] ?? "");
      return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === "desc" ? -1 : 1);
    });
  }
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

export async function mockSupabase(page: Page): Promise<void> {
  // Seed a valid-looking session so the client treats us as signed in.
  const session = {
    access_token: "test-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "test-refresh-token",
    user: {
      id: JOSEPH_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "joseph@camijoseph.private",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: { person: "joseph" },
      created_at: new Date().toISOString(),
    },
  };
  await page.addInitScript(
    ([key, value, deviceId]) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem("cj_device_id", deviceId);
      window.localStorage.setItem("cj_person", "joseph");
    },
    [`sb-${REF}-auth-token`, JSON.stringify(session), "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
  );

  await page.route(`${SUPABASE_URL}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/user")) {
      await route.fulfill({ json: session.user });
    } else if (url.pathname.endsWith("/token")) {
      await route.fulfill({ json: session });
    } else if (url.pathname.endsWith("/logout")) {
      await route.fulfill({ status: 204, body: "" });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  // Taps flushed through add_clicks during this page's run.
  let clicksFlushed = 0;

  await page.route(`${SUPABASE_URL}/rest/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace("/rest/v1/", "").split("/")[0];
    const params = url.searchParams;
    const method = request.method();

    // RPC calls
    if (table === "rpc") {
      const fn = url.pathname.split("/").pop();
      if (fn === "pin_available") {
        await route.fulfill({ json: true });
      } else if (fn === "add_clicks") {
        let n = 0;
        try {
          n = Number((request.postDataJSON() as { n?: number }).n) || 0;
        } catch {
          n = 0;
        }
        clicksFlushed += Math.max(0, n);
        const mine = (fixtures.another_life_clicks as { person: string; count: number }[]).find(
          (r) => r.person === "joseph",
        );
        await route.fulfill({ json: (mine?.count ?? 0) + clicksFlushed });
      } else {
        await route.fulfill({ json: null });
      }
      return;
    }

    const rows = (fixtures[table] ?? []) as Record<string, unknown>[];

    if (method === "GET" || method === "HEAD") {
      const filtered = applyFilters(rows, params);
      const wantsSingle = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      const prefer = request.headers()["prefer"] ?? "";
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "access-control-expose-headers": "content-range",
      };
      if (prefer.includes("count=exact")) {
        headers["content-range"] = `0-${Math.max(filtered.length - 1, 0)}/${filtered.length}`;
      }
      if (method === "HEAD") {
        await route.fulfill({ status: 200, headers, body: "" });
        return;
      }
      if (wantsSingle) {
        if (filtered.length === 0) {
          await route.fulfill({
            status: 406,
            headers,
            json: { code: "PGRST116", message: "no rows", details: "0 rows" },
          });
        } else {
          await route.fulfill({ status: 200, headers, json: filtered[0] });
        }
        return;
      }
      await route.fulfill({ status: 200, headers, json: filtered });
      return;
    }

    // Writes: echo back something plausible.
    if (method === "POST") {
      let body: unknown = {};
      try {
        body = request.postDataJSON();
      } catch {
        body = {};
      }
      const record = Array.isArray(body) ? body[0] : body;
      const echoed = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...(record as Record<string, unknown>),
      };
      const wantsSingle = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      await route.fulfill({ status: 201, json: wantsSingle ? echoed : [echoed] });
      return;
    }

    if (method === "PATCH" || method === "DELETE") {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    await route.fulfill({ status: 200, json: [] });
  });

  await page.route(`${SUPABASE_URL}/functions/v1/**`, async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.route(`${SUPABASE_URL}/storage/v1/object/sign/**`, async (route) => {
    await route.fulfill({ json: { signedURL: "object/mock-signed/preview.png" } });
  });
  await page.route(`${SUPABASE_URL}/storage/v1/object/mock-signed/**`, async (route) => {
    await route.fulfill({ path: "public/icons/icon-512.png" });
  });
  // Block realtime websocket upgrade cleanly.
  await page.route(`${SUPABASE_URL.replace("https", "wss")}/**`, (route) => route.abort());
}
