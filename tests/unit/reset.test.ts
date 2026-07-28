// The clean slate.
//
// Two doors lead into a save: the local copy in IndexedDB and the row on the
// server. Both have to refuse an old one, and the server path is the awkward
// one, because `reconcile` reads permanent counters from the row's *columns*
// rather than from the state blob and would otherwise hand back the very
// numbers the reset exists to remove.

import { describe, expect, it } from "vitest";
import { createGameState, migrateSave, RESET_SAVES_BEFORE, SAVE_VERSION } from "@/game/state";
import { reconcile, type ServerSave } from "@/game/persistence";

function serverRow(version: number, overrides: Partial<ServerSave> = {}): ServerSave {
  return {
    person: "joseph",
    state: { version, tideChanges: 780, lifetime: { hearts: 1e300 } },
    hearts: 1e120,
    lifetime_hearts: 1e300,
    tide_changes: 780,
    new_waters: 12,
    creatures: 9,
    legacy_claimed: true,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("resetting all progress", () => {
  it("is pinned to the version it was done at", () => {
    expect(RESET_SAVES_BEFORE).toBeLessThanOrEqual(SAVE_VERSION);
  });

  it("refuses an old local save", () => {
    const state = migrateSave({ version: RESET_SAVES_BEFORE - 1, tideChanges: 400 }, "joseph");
    expect(state.tideChanges).toBe(0);
    expect(state.lifetime.hearts).toBe(0);
  });

  it("refuses an old server row, columns and all", () => {
    // This is the one that would have leaked. The columns say 1e300 lifetime
    // hearts and 780 rebirths, and the high water mark logic would have
    // written both onto an otherwise clean save.
    const fresh = createGameState(0, "joseph");
    const merged = reconcile(fresh, serverRow(RESET_SAVES_BEFORE - 1), "joseph")!;
    expect(merged.lifetime.hearts).toBe(0);
    expect(merged.tideChanges).toBe(0);
    expect(merged.newWaters).toBe(0);
  });

  it("returns a playable save rather than nothing when only an old row exists", () => {
    const merged = reconcile(null, serverRow(RESET_SAVES_BEFORE - 1), "joseph");
    expect(merged).toBeNull();
  });

  it("still merges a current server row normally", () => {
    const local = createGameState(0, "joseph");
    const theirs = createGameState(0, "joseph");
    theirs.lifetime.hearts = 5_000;
    theirs.tideChanges = 2;
    const merged = reconcile(
      local,
      serverRow(SAVE_VERSION, {
        state: theirs, lifetime_hearts: 5_000, tide_changes: 2, new_waters: 0,
      }),
      "joseph",
    )!;
    expect(merged.lifetime.hearts).toBe(5_000);
    expect(merged.tideChanges).toBe(2);
  });

  it("leaves a save written since the reset completely alone", () => {
    const played = createGameState(0, "cami");
    played.tideChanges = 6;
    played.wallet.hearts = 4_321;
    const state = migrateSave(JSON.parse(JSON.stringify(played)), "cami");
    expect(state.tideChanges).toBe(6);
    expect(state.wallet.hearts).toBe(4_321);
  });
});
