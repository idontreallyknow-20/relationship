// What exists yet.
//
// The complaint that produced this file was that the game showed nineteen
// screens on the first run and its own owner could not read it. These tests
// are the guard against that coming back one config entry at a time.

import { describe, expect, it } from "vitest";
import { STAGES, featuresAt, stageFor, type Feature } from "@/game/config/stages";

describe("stages", () => {
  it("opens with one thing to do", () => {
    const first = featuresAt(stageFor(0));
    // Buy amounts are the single exception, and they are a convenience rather
    // than a feature: there is nothing yet to buy ten of.
    expect([...first]).toEqual(["buyAmounts"]);
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
      // Two sentences, not two words. A feature that appears with a three word
      // label is the same problem in a different costume.
      expect(stage.body.length, `stage ${stage.index} barely explains itself`).toBeGreaterThan(60);
    }
  });

  it("puts the player at the right stage for what they have earned", () => {
    expect(stageFor(0)).toBe(0);
    expect(stageFor(49)).toBe(0);
    expect(stageFor(50)).toBe(1);
    expect(stageFor(1e30)).toBe(STAGES[STAGES.length - 1].index);
  });

  it("hands out buy amounts and the chain before it hands out rebirth", () => {
    const chain = STAGES.find((s) => s.reveals.includes("chain"))!;
    const rebirth = STAGES.find((s) => s.reveals.includes("tideChange"))!;
    const deepen = STAGES.find((s) => s.reveals.includes("deepen"))!;
    expect(chain.at).toBeLessThan(deepen.at);
    expect(deepen.at).toBeLessThan(rebirth.at);
  });
});
