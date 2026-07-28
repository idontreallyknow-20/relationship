// The offline layer had no unit tests at all.
//
// That is the trickiest and least observable code in the repo: it decides
// whether a failure is worth retrying, whether the app believes it has a
// connection, and whether a queued write is allowed to block the ones behind
// it. Every bug covered here was invisible from the outside and would have been
// caught by any one of these assertions.

import { beforeEach, describe, expect, it } from "vitest";
import { isTransportError, reportOffline, reportOnline } from "@/lib/offline/net";

/** What Supabase hands back for a real server rejection. */
function postgrestError(code: string, message: string) {
  return { code, message, details: null, hint: null, name: "PostgrestError" };
}

describe("isTransportError", () => {
  beforeEach(() => {
    reportOnline();
  });

  it("says no to nothing at all", () => {
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });

  it("recognises a failed fetch", () => {
    expect(isTransportError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransportError({ message: "NetworkError when attempting to fetch" })).toBe(true);
    expect(isTransportError({ message: "Load failed" })).toBe(true);
  });

  it("recognises an aborted request", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(isTransportError(error)).toBe(true);
  });

  // The deadline in `settled` is the only place a timeout error is minted, and
  // it used to say "timed out" while this matched on "timeout". The one string
  // that had to line up was the one that did not.
  it("recognises the deadline that settled() actually produces", () => {
    expect(isTransportError(new Error("Request timeout"))).toBe(true);
  });

  it("does not retry a real server rejection", () => {
    expect(isTransportError(postgrestError("42501", "new row violates row-level security policy"))).toBe(false);
    expect(isTransportError(postgrestError("23505", "duplicate key value violates unique constraint"))).toBe(false);
    expect(isTransportError(postgrestError("23503", "insert or update violates foreign key constraint"))).toBe(false);
  });

  // The one that blocked the queue.
  //
  // This used to short-circuit to true whenever the offline flag was down, so
  // once the app believed it had no connection, a permanent rejection was
  // classified as retryable. `drain` breaks on a transport error, so an
  // operation the server would never accept sat at the head of the outbox and
  // held everything behind it, and the flag it depended on could only be
  // cleared by some unrelated request succeeding.
  it("still refuses to retry a server rejection while offline", () => {
    reportOffline();
    expect(isTransportError(postgrestError("42501", "row-level security"))).toBe(false);
    expect(isTransportError(postgrestError("23505", "duplicate key"))).toBe(false);
  });

  it("does treat an error with nothing to judge it by as transport while offline", () => {
    reportOffline();
    expect(isTransportError({})).toBe(true);
    reportOnline();
    expect(isTransportError({ code: "PGRST116", message: "" })).toBe(false);
  });
});
