// What exists yet.
//
// The complaint that produced this file was that the game showed nineteen
// screens on the first run and its own owner could not read it. The complaint
// that produced the second half of it was that hiding them behind lifetime
// hearts did not help, because an idle jar makes ninety hearts in the first
// minute and the first four rungs cost fifty, five hundred, three thousand and
// twenty thousand between them.
//
// These tests are the guard against both coming back one config entry at a
// time.

import { describe, expect, it } from "vitest";
import {
  STAGES,
  STAGE_MIN_GAP_MS,
  advanceStage,
  stageGap,
  featuresAt,
  stageCandidate,
  stageFor,
  type Feature,
} from "@/game/config/stages";
import { createGameState } from "@/game/state";
import type { GameState } from "@/game/types";

function fresh(): GameState {
  return createGameState(0, "cami");
}

describe("stages", () => {
  it("opens with nothing but the jar", () => {
    expect([...featuresAt(stageFor(fresh()))]).toEqual([]);
  });

  it("reveals at most one thing per rung", () => {
    for (const stage of STAGES) {
      expect(
        stage.reveals.length,
        `stage ${stage.index} reveals ${stage.reveals.length} things at once`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("never takes a feature away once it has been given", () => {
    let previous = new Set<Feature>();
    for (const stage of STAGES) {
      const now = featuresAt(stage.index);
      for (const feature of previous) {
        expect(now.has(feature), `stage ${stage.index} lost ${feature}`).toBe(true);
      }
      previous = now;
    }
  });

  it("reveals every feature exactly once", () => {
    const seen = new Set<Feature>();
    for (const stage of STAGES) {
      for (const feature of stage.reveals) {
        expect(seen.has(feature), `${feature} is revealed twice`).toBe(false);
        seen.add(feature);
      }
    }
  });

  it("rises, so a save can only ever move forward through them", () => {
    let previous = -1;
    for (const stage of STAGES) {
      expect(stage.at).toBeGreaterThan(previous);
      previous = stage.at;
      expect(stage.index).toBe(STAGES.indexOf(stage));
    }
  });

  it("explains everything it reveals", () => {
    for (const stage of STAGES) {
      expect(stage.title.length, `stage ${stage.index} has no title`).toBeGreaterThan(0);
      expect(stage.body.length, `stage ${stage.index} barely explains itself`).toBeGreaterThan(60);
    }
  });

  it("hands out the chain and deepening before it hands out rebirth", () => {
    const chain = STAGES.find((s) => s.reveals.includes("chain"))!;
    const rebirth = STAGES.find((s) => s.reveals.includes("tideChange"))!;
    const deepen = STAGES.find((s) => s.reveals.includes("deepen"))!;
    expect(chain.at).toBeLessThan(deepen.at);
    expect(deepen.at).toBeLessThan(rebirth.at);
  });

  // The heart of the rebalance. Hearts alone can be earned by waiting; a rung
  // that only asks for hearts is a rung that arrives on its own.
  it("asks for something the player did, not just a balance", () => {
    for (const stage of STAGES) {
      if (stage.index === 0) continue;
      expect(stage.needs, `stage ${stage.index} is gated on hearts alone`).toBeTruthy();
      expect(stage.needs!.count).toBeGreaterThan(0);
    }
  });

  it("does not open upgrades to a jar that has only been left alone", () => {
    const state = fresh();
    state.lifetime.hearts = 1e9; // far past every heart threshold
    // but nothing has been tapped, bought, deepened or reborn
    expect(stageCandidate(state)).toBe(0);
  });

  it("moves one rung at a time, however far ahead the jar is", () => {
    const state = fresh();
    state.lifetime.hearts = 1e30;
    state.stats.totalClicks = 1e6;
    state.stats.upgradesBought = 1e6;
    state.depths.forEach((d) => (d.bought = 1e4));
    state.deepens = 1e4;
    state.tideChanges = 1e4;
    state.newWaters = 1e4;
    state.seas = 1e4;

    // Everything is satisfied at once, which used to show one card and swallow
    // the rest.
    expect(stageCandidate(state)).toBe(STAGES[STAGES.length - 1].index);

    let now = 0;
    expect(advanceStage(state, now)).toBe(true);
    expect(stageFor(state)).toBe(1);

    // ...and the next one does not arrive a tick later.
    now += 1_000;
    expect(advanceStage(state, now)).toBe(false);
    expect(stageFor(state)).toBe(1);

    now += STAGE_MIN_GAP_MS;
    expect(advanceStage(state, now)).toBe(true);
    expect(stageFor(state)).toBe(2);
  });

  it("takes the whole ladder at least as long as the gap allows", () => {
    const state = fresh();
    state.lifetime.hearts = 1e30;
    state.stats.totalClicks = 1e6;
    state.stats.upgradesBought = 1e6;
    state.depths.forEach((d) => (d.bought = 1e4));
    state.deepens = 1e4;
    state.tideChanges = 1e4;
    state.newWaters = 1e4;
    state.seas = 1e4;

    let now = 0;
    let moves = 0;
    while (advanceStage(state, now)) {
      moves += 1;
      now += stageGap(stageFor(state) + 1);
    }
    expect(stageFor(state)).toBe(STAGES[STAGES.length - 1].index);
    expect(moves).toBe(STAGES.length - 1);
  });

  // A rebirth wipes the chain and the deepenings, both of which rungs ask for.
  // Recomputing rather than remembering would have closed the automation tab
  // on the first rebirth, which is exactly when it becomes most useful.
  it("does not take a rung back when a rebirth wipes what earned it", () => {
    const state = fresh();
    state.lifetime.hearts = 2e7;
    state.stats.totalClicks = 500;
    state.stats.upgradesBought = 80;
    state.depths.forEach((d) => (d.bought = 80));
    state.deepens = 8;

    let now = 0;
    for (let i = 0; i < 20; i++) {
      advanceStage(state, now);
      now += stageGap(stageFor(state) + 1);
    }
    const reached = stageFor(state);
    expect(reached).toBeGreaterThanOrEqual(5);
    expect(featuresAt(reached).has("automation")).toBe(true);

    // The rebirth.
    state.depths.forEach((d) => (d.bought = 0));
    state.deepens = 0;

    expect(stageFor(state)).toBe(reached);
    expect(featuresAt(stageFor(state)).has("automation")).toBe(true);
  });

  it("survives a clock that jumps backwards", () => {
    const state = fresh();
    state.lifetime.hearts = 1e30;
    state.stats.totalClicks = 1e6;
    state.stats.upgradesBought = 1e6;

    advanceStage(state, 1_000_000);
    expect(stageFor(state)).toBe(1);

    // The device clock goes back a day. Without the guard this would leave the
    // ladder waiting for a moment that has already passed, forever.
    advanceStage(state, 1_000);
    expect(advanceStage(state, 1_000 + STAGE_MIN_GAP_MS)).toBe(true);
    expect(stageFor(state)).toBe(2);
  });
});
