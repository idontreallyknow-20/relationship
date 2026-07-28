// The ticker along the top of the jar.
//
// Openly borrowed from Cookie Clicker, which is where the idea that an idle
// game should have something to read belongs. It does nothing mechanical on
// purpose: it is the only place in the game that is allowed to just be about
// these two people, and a line that paid out would turn into something to
// farm.
//
// Lines are filtered by how far in you are, so the early ones are about a jar
// and a heart and nothing spoils a mechanic you have not met. Within what is
// available it picks by a seed that changes on its own clock, so both phones
// are not required to agree and neither is it random enough to flicker.

import { seededRandom } from "../numbers";

export interface NewsLine {
  /** Lowest stage this can appear at. */
  from: number;
  text: string;
}

export const NEWS: NewsLine[] = [
  { from: 0, text: "Jar reports being tapped. Jar reports liking it." },
  { from: 0, text: "Local heart found to be in excellent condition." },
  { from: 0, text: "Studies confirm: the jar is bigger on the inside, emotionally." },
  { from: 0, text: "Local couple still going. More at eleven." },
  { from: 0, text: "Heart tapped repeatedly. Heart declines to comment." },
  { from: 0, text: "Nothing else has happened today. This is the news." },

  { from: 1, text: "Upgrade purchased. Jar noticeably smugger." },
  { from: 1, text: "Experts baffled by jar that only goes up." },
  { from: 1, text: "Spending everything found to be the correct strategy, again." },

  { from: 3, text: "Handful of hearts reported. Handful requests a bigger hand." },
  { from: 3, text: "Shelf installed. Shelf immediately full." },
  { from: 3, text: "Jar now makes hearts while you are not looking. Trust issues developing." },
  { from: 3, text: "Room of shelves declared structurally romantic." },

  { from: 4, text: "Jar goes deeper. Nobody is sure how deep it goes." },
  { from: 4, text: "Deepening reported. Everything is now slightly more." },

  { from: 5, text: "Autobuyer purchased something. Autobuyer is not sorry." },
  { from: 5, text: "Jar now plays itself. You are welcome to keep watching." },

  { from: 6, text: "Jar emptied and refilled. Jar took it well." },
  { from: 6, text: "Rebirth number unclear. Jar has stopped counting out loud." },
  { from: 6, text: "Moons collected. No moons were harmed." },

  { from: 7, text: "Warmth up. Meteorologists credit somebody opening the app." },
  { from: 8, text: "Message sent in the other tab. Jar felt it." },
  { from: 8, text: "Both of you were here this evening. The water is showing off." },
  { from: 8, text: "Partner activity detected. Jar visibly pleased." },

  { from: 9, text: "Otter opens shell. Crab collects shell. System works." },
  { from: 9, text: "Two otters observed holding hands. Scientists moved to tears." },
  { from: 9, text: "Crab walks sideways toward goal. Arrives anyway." },
  { from: 9, text: "Otter has opinions about the rock it is carrying." },

  { from: 11, text: "Jar replaced with bigger jar. Old jar retired with honours." },
  { from: 14, text: "Ascension performed. Stars issued. Nobody asked where from." },
  { from: 16, text: "Time reported slower than usual. Jar insists this is fine." },
];

/** How long one line stays up. */
export const NEWS_INTERVAL_MS = 12_000;

/**
 * The line to show right now.
 *
 * Seeded off the clock rather than `Math.random`, so a re-render inside the
 * same window shows the same line instead of shuffling under the reader.
 */
export function newsLine(stage: number, now: number): string {
  const available = NEWS.filter((line) => line.from <= stage);
  if (available.length === 0) return NEWS[0].text;
  const slot = Math.floor(now / NEWS_INTERVAL_MS);
  const index = Math.floor(seededRandom(`news:${slot}`) * available.length);
  return available[Math.min(available.length - 1, index)].text;
}
