// Every word the game uses, defined once.
//
// The request was "make things more clear but also be able to click on
// everything for information", and that is two problems with one answer. The
// game had explanations, but they lived wherever the thing happened to be
// drawn: what a ribbon was got explained on the seal card, and only there, and
// only if you scrolled to it. So the same noun was described three different
// ways in three places, or not at all in the place you happened to be looking.
//
// This is the single copy. Every definition in the game comes from here, and a
// component that shows a word can make that word open its own definition
// without knowing anything about it. Nothing in the UI writes its own.
//
// The rule for an entry: `what` says what the thing is in one sentence you
// could say out loud. `where` names exactly one way to get it, or one place it
// happens. `use` says what it is for. If any of the three cannot be written
// plainly, that is a design problem showing up as a writing problem, and the
// fix belongs in the mechanic rather than in the paragraph.

import type { Feature } from "./stages";

export interface GlossaryEntry {
  id: string;
  term: string;
  /** Other names for it, so search finds it. */
  aka?: string[];
  what: string;
  where?: string;
  use?: string;
  /** Hidden from the index until this has been revealed. No spoilers. */
  needs?: Feature;
  group: GlossaryGroup;
}

export type GlossaryGroup =
  | "the jar"
  | "money"
  | "spending"
  | "the pets"
  | "rebirth"
  | "the two of you";

export const GLOSSARY: GlossaryEntry[] = [
  /* ---------------------------------------------------------------- */
  /* The jar                                                           */
  /* ---------------------------------------------------------------- */
  {
    id: "hearts",
    term: "Hearts",
    group: "the jar",
    what: "The thing you are collecting. Everything in the game is measured in them.",
    where: "Tapping the heart, and the pets carrying them over on their own.",
    use: "Upgrades, and filling the jar you are on.",
  },
  {
    id: "tap",
    term: "Tapping",
    aka: ["per tap", "click", "hearts per tap"],
    group: "the jar",
    what: "Pressing the big heart puts hearts in the jar. Per tap is how many.",
    where: "The ring around the heart pulses. Tapping as it closes pays a little more.",
    use: "It is the whole game for the first few minutes, and never stops mattering.",
  },
  {
    id: "perSecond",
    term: "Per second",
    aka: ["cps", "passive", "idle"],
    group: "the jar",
    what: "Hearts the jar makes without you touching it.",
    where: "Pets around the table, and every jar sealed onto the shelf.",
    use: "It is what makes putting the phone down the right move rather than a loss.",
  },
  {
    id: "colours",
    term: "Heart colours",
    aka: ["merging", "merge", "ten make one", "ladder"],
    needs: "colours",
    group: "the jar",
    what: "Ten hearts of one colour become one heart of the next, worth all ten.",
    where: "It happens on its own as the jar fills. You never merge anything by hand.",
    use: "It is why a jar holding a trillion hearts still looks like a jar with hearts in it, and why a late heart is worth more than an early one.",
  },
  {
    id: "combo",
    term: "Combo",
    group: "the jar",
    what: "Tapping without a long pause builds a streak, and the streak multiplies your taps.",
    where: "Keep tapping. It falls away after a few seconds of nothing.",
    use: "It rewards sitting with the jar for a minute rather than only checking in.",
  },
  {
    id: "critical",
    term: "Critical",
    aka: ["crit", "mega"],
    group: "the jar",
    what: "A tap that pays several times over. A mega critical is the rarer, larger one.",
    where: "A percentage chance on every tap, shown as Critical on the jar screen.",
    use: "Upgrades raise the chance, so a long run of taps gets steadily luckier.",
  },
  {
    id: "jar",
    term: "The jar",
    aka: ["jars", "vessel", "capacity"],
    group: "the jar",
    what: "What you are filling. It holds a fixed number of hearts and then it is full.",
    where: "You start with the jam jar. Ribbons buy bigger ones.",
    use: "A bigger jar holds more before it fills, seats more pets, and is worth more when sealed.",
  },
  {
    id: "full",
    term: "A full jar",
    aka: ["full"],
    needs: "seal",
    group: "the jar",
    what: "The jar has as many hearts in it as it can hold. Nothing bad happens, and nothing more goes in.",
    where: "The jar says Full, and the seal button lights up.",
    use: "A full jar is the only jar you can seal, which is how the shelf grows.",
  },
  {
    id: "seal",
    term: "Sealing",
    aka: ["seal", "seal a jar"],
    needs: "seal",
    group: "the jar",
    what: "Putting a lid on a full jar and standing it on the shelf.",
    where: "The seal button, once the jar is full.",
    use: "The hearts are moved, not spent: the sealed jar keeps paying a trickle forever, and sealing pays you ribbons and keepsakes on the spot. Then you start a fresh, empty jar.",
  },
  {
    id: "shelf",
    term: "The shelf",
    needs: "shelf",
    group: "the jar",
    what: "Where every jar you have ever sealed stands, all of them paying at once.",
    where: "Sealing a full jar puts one there.",
    use: "It is your passive income, and it is the reason the second hour is faster than the first. A rebirth clears it.",
  },
  {
    id: "sealKeep",
    term: "What sealing leaves behind",
    aka: ["never really empty", "seal keep"],
    needs: "shelf",
    group: "the jar",
    what: "A share of the jar that stays in the new jar rather than going on the shelf.",
    where: "Shelf upgrades and a couple of star upgrades raise it.",
    use: "It gives the next jar a head start, so a long chain of seals speeds up rather than starting from zero every time.",
  },

  /* ---------------------------------------------------------------- */
  /* Money                                                             */
  /* ---------------------------------------------------------------- */
  {
    id: "ribbons",
    term: "Ribbons",
    needs: "seal",
    group: "money",
    what: "The ribbon you tie round a jar you have sealed.",
    where: "Sealing a full jar. That is the only way. One jar pays at least one.",
    use: "Bigger jars, chairs for the pets, abilities, and the shelf upgrades. Everything in the Jars and shelf tab is bought with them.",
  },
  {
    id: "keepsakes",
    term: "Keepsakes",
    needs: "us",
    group: "money",
    what: "Small things worth keeping, shared between the two of you.",
    where: "Mostly sealing jars. Doing things together in the rest of the app pays them too, on top.",
    use: "The Us tree, which pays both of you at once.",
  },
  {
    id: "moons",
    term: "Moons",
    needs: "tideChange",
    group: "money",
    what: "The permanent currency a rebirth pays out, in return for everything it took.",
    where: "Being reborn. Going further past the bar pays more, but not proportionally more.",
    use: "The moon tree, which survives every rebirth and is what makes the next life faster.",
  },
  {
    id: "stars",
    term: "Stars",
    needs: "newWater",
    group: "money",
    what: "The permanent currency an ascension pays, one layer above moons.",
    where: "Ascending, which is the rebirth above rebirth.",
    use: "The star tree, which survives every ascension.",
  },
  {
    id: "suns",
    term: "Suns",
    needs: "sea",
    group: "money",
    what: "The permanent currency a forever pays, and the last one there is.",
    where: "Going forever, the last reset there is.",
    use: "The sun tree, which is the only tree that changes what the jar is rather than how big its numbers are.",
  },
  {
    id: "hours",
    term: "Hours",
    needs: "dilation",
    group: "money",
    what: "Time you spent playing the game deliberately slowed down.",
    where: "Turning dilation on, playing on anyway, and coming back out.",
    use: "The dilation tree, which is the only thing that makes dilation worth doing.",
  },

  /* ---------------------------------------------------------------- */
  /* Spending                                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "upgrades",
    term: "Upgrades",
    needs: "upgrades",
    group: "spending",
    what: "Things you buy with hearts that make the jar better. Each one can be bought many times.",
    where: "The Trees tab, and the three cheapest are on the jar screen too.",
    use: "Spending is always better than saving here. There is nothing to save up for.",
  },
  {
    id: "trees",
    term: "Trees",
    aka: ["upgrade tree", "grows out of"],
    needs: "upgrades",
    group: "spending",
    what: "The upgrade lists. They are called trees because each one grows out of the one above it.",
    where: "Every tab that spends a currency has one.",
    use: "The list is in the order things grow, so anything above a row is something that row builds on. Tap a row to see what it leads to.",
  },
  {
    id: "buyAmount",
    term: "Buy amount",
    aka: ["x10", "max", "buy all"],
    needs: "buyAmounts",
    group: "spending",
    what: "How many levels one press buys. Buy all takes the cheapest thing repeatedly until nothing is affordable.",
    where: "The row of buttons at the top of the Trees tab.",
    use: "It saves pressing a button eighty times. It is not a power and it costs nothing.",
  },
  {
    id: "abilities",
    term: "Abilities",
    needs: "abilities",
    group: "spending",
    what: "Things you fire on a cooldown. Some apply an effect for a while, some go off once.",
    where: "Bought with ribbons in the Abilities tab.",
    use: "Firing one before a long tapping session, or before sealing, is worth more than firing it at random.",
  },
  {
    id: "automation",
    term: "Automation",
    aka: ["autobuyer", "autobuyers", "auto tap", "auto seal"],
    needs: "automation",
    group: "spending",
    what: "The jar doing things you would otherwise do by hand: tapping, buying, sealing.",
    where: "Moon and sun upgrades unlock each piece. The Automation tab is where you switch them on.",
    use: "Each autobuyer only spends the share of your balance you allow it, so switching them all on cannot empty your wallet.",
  },

  /* ---------------------------------------------------------------- */
  /* The pets                                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "pets",
    term: "Pets",
    aka: ["otters", "crabs", "creatures"],
    needs: "pets",
    group: "the pets",
    what: "Otters and crabs who sit around the jar and carry hearts into it on their own.",
    where: "Bought in the Creatures tab. Otters are hers, crabs are his.",
    use: "They are your first source of hearts per second. A table with both kinds is worth more than a table with either.",
  },
  {
    id: "seats",
    term: "Chairs",
    aka: ["slots", "seats"],
    needs: "pets",
    group: "the pets",
    what: "How many pets can sit at the table at once. The rest wait.",
    where: "A bigger jar seats more. Shelf, moon and sun upgrades add chairs too.",
    use: "Only pets in a chair carry anything, so an empty chair is wasted income.",
  },
  {
    id: "feeding",
    term: "Feeding",
    needs: "pets",
    group: "the pets",
    what: "Pets get hungry over time and work more slowly when they are.",
    where: "Feed them with ribbons in the Creatures tab. Hunger never drops a pet to nothing.",
    use: "A moon upgrade makes them feed themselves.",
  },
  {
    id: "items",
    term: "Rocks and shells",
    needs: "pets",
    group: "the pets",
    what: "Something a pet carries. Otters carry a rock, crabs wear a shell, and each one adds a bonus.",
    where: "Crafted in the Creatures tab once a moon upgrade unlocks them.",
    use: "Rarer ones carry more bonuses. They can be polished, rerolled and salvaged.",
  },

  /* ---------------------------------------------------------------- */
  /* Rebirth                                                           */
  /* ---------------------------------------------------------------- */
  {
    id: "rebirth",
    term: "Rebirth",
    needs: "tideChange",
    group: "rebirth",
    what: "Emptying the jar and the shelf and starting again, stronger.",
    where: "The Rebirth tab, once this life has made enough hearts.",
    use: "It pays moons, and the moon tree is kept forever. This is the loop the rest of the game is made of; you will do it hundreds of times.",
  },
  {
    id: "ascension",
    term: "Ascension",
    needs: "newWater",
    group: "rebirth",
    what: "A rebirth of the rebirths. It takes the moons and the moon tree too.",
    where: "The Rebirth group, once a moon upgrade has unlocked it.",
    use: "It pays stars, and the star tree is kept through every ascension.",
  },
  {
    id: "forever",
    term: "Forever",
    needs: "sea",
    group: "rebirth",
    what: "The last reset. It takes the ascensions, the stars, and both trees below it.",
    where: "The Rebirth group, after three ascensions.",
    use: "It pays suns. The sun tree is the only one that changes the shape of the game rather than its numbers.",
  },
  {
    id: "dilation",
    term: "Time dilation",
    needs: "dilation",
    group: "rebirth",
    what: "A switch that makes the whole jar slower on purpose.",
    where: "The Dilation tab, after a forever.",
    use: "It pays hours for how far you get anyway. It is worse than not having it until you have spent a while on the tree it pays for, which is the point.",
  },
  {
    id: "offline",
    term: "Time away",
    aka: ["offline", "welcome back"],
    group: "rebirth",
    what: "The jar keeps working while the app is closed, up to a limit.",
    where: "Open the app again and it tells you what it made.",
    use: "Upgrades raise both the limit and how much of it counts. Nothing is lost by closing the app.",
  },

  /* ---------------------------------------------------------------- */
  /* The two of you                                                    */
  /* ---------------------------------------------------------------- */
  {
    id: "us",
    term: "Together",
    needs: "us",
    group: "the two of you",
    what: "The half of the game the two of you share. One tree, paid for with keepsakes, that helps you both.",
    where: "The Us tab.",
    use: "Nothing in the game needs your partner, and all of it is better with them.",
  },
  {
    id: "warmth",
    term: "Warmth",
    needs: "us",
    group: "the two of you",
    what: "A shared bar that adds a bonus to everything for both of you.",
    where: "It rises when you seal jars, and rises faster when you both do things in the app.",
    use: "It is a bonus on top, never the main way to get anything.",
  },
  {
    id: "missions",
    term: "Missions",
    needs: "missions",
    group: "the two of you",
    what: "Small goals. Some refresh daily, some do not.",
    where: "The Missions tab.",
    use: "They pay in whatever you are shortest of, and they are worth reading because they often ask for something you were going to do anyway.",
  },
  {
    id: "challenges",
    term: "Challenges",
    needs: "challenges",
    group: "the two of you",
    what: "A life with something taken away, and a permanent reward for finishing it anyway.",
    where: "The Challenges tab.",
    use: "You can leave one at any time and nothing is lost by trying.",
  },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((entry) => [entry.id, entry]),
);

export const GLOSSARY_GROUPS: GlossaryGroup[] = [
  "the jar", "money", "spending", "the pets", "rebirth", "the two of you",
];

/** Case-insensitive search over term, other names, and the definition itself. */
export function searchGlossary(query: string, known: Set<Feature>): GlossaryEntry[] {
  const visible = GLOSSARY.filter((e) => !e.needs || known.has(e.needs));
  const q = query.trim().toLowerCase();
  if (!q) return visible;
  return visible.filter((entry) =>
    [entry.term, ...(entry.aka ?? []), entry.what, entry.where ?? "", entry.use ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
