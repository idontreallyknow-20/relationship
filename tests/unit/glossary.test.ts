// Everything is explained, and nothing is explained early.
//
// The glossary is the one place in the game where a missing entry is silent:
// a component asks for an id, does not get one, and simply renders a card that
// does nothing when you press it. So these are the checks that catch a typo,
// a definition that never got written, and a spoiler.

import { describe, expect, it } from "vitest";
import {
  GLOSSARY, GLOSSARY_BY_ID, GLOSSARY_GROUPS, searchGlossary,
} from "@/game/config/glossary";
import { CURRENCIES } from "@/game/config/currencies";
import { STAGES, featuresAt, type Feature } from "@/game/config/stages";

const ALL_FEATURES = featuresAt(STAGES[STAGES.length - 1].index);

describe("the glossary", () => {
  it("has no duplicate ids", () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says what everything is, in a whole sentence", () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.length, entry.id).toBeGreaterThan(1);
      expect(entry.what.length, entry.id).toBeGreaterThan(20);
      expect(entry.what.endsWith("."), `${entry.id}: "${entry.what}"`).toBe(true);
    }
  });

  it("files every entry under a group that exists", () => {
    for (const entry of GLOSSARY) {
      expect(GLOSSARY_GROUPS, entry.id).toContain(entry.group);
    }
  });

  it("gates only on features the ladder actually reveals", () => {
    for (const entry of GLOSSARY) {
      if (!entry.needs) continue;
      expect(ALL_FEATURES.has(entry.needs), `${entry.id} needs ${entry.needs}`).toBe(true);
    }
  });

  // The complaint that started this: a currency you hold and cannot look up.
  it("defines every currency in the game", () => {
    for (const currency of CURRENCIES) {
      expect(GLOSSARY_BY_ID[currency.id], `no glossary entry for ${currency.id}`)
        .toBeDefined();
    }
  });

  it("has something to say on the first screen, before anything is revealed", () => {
    const opening = searchGlossary("", new Set<Feature>());
    expect(opening.length).toBeGreaterThan(3);
    expect(opening.map((e) => e.id)).toContain("hearts");
    expect(opening.map((e) => e.id)).toContain("tap");
  });

  it("hides what has not been revealed yet", () => {
    const opening = searchGlossary("", new Set<Feature>()).map((e) => e.id);
    expect(opening).not.toContain("forever");
    expect(opening).not.toContain("ascension");
    expect(opening).not.toContain("ribbons");
  });

  it("searches the definitions, not only the headwords", () => {
    // Somebody looking this up does not know the word is "sealing".
    const hits = searchGlossary("full", ALL_FEATURES).map((e) => e.id);
    expect(hits).toContain("seal");
  });

  it("finds a thing by a name the game does not print", () => {
    expect(searchGlossary("otters", ALL_FEATURES).map((e) => e.id)).toContain("pets");
    expect(searchGlossary("cps", ALL_FEATURES).map((e) => e.id)).toContain("perSecond");
  });
});
