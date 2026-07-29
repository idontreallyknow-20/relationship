"use client";

// Tap anything and it tells you what it is.
//
// One sheet, mounted once at the root of the game, and a context that any
// component can reach to open it on a given word. That shape is the point: a
// button that explains a ribbon does not need to know what a ribbon is, it
// needs to know the string "ribbons". So adding an explanation to something is
// one prop rather than a copy of a paragraph, and the paragraph itself only
// exists in `config/glossary.ts`.
//
// Three ways in, because there are three kinds of place a word appears:
//
//   <Term id="ribbons">ribbons</Term>   inside a sentence, dotted underline
//   <InfoDot id="seal" />               beside a heading, question mark
//   useGlossary().open("moons")         from a control that is already a button
//
// The third matters more than it looks. Half the words in this game are on
// things that are already tappable for another reason, and wrapping a button in
// a button is not allowed. So those call the hook from their existing handler
// or put a small dot next to themselves instead.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { HelpCircle, Search } from "lucide-react";
import { useGame } from "@/game/store";
import {
  GLOSSARY_BY_ID, GLOSSARY_GROUPS, searchGlossary, type GlossaryEntry,
} from "@/game/config/glossary";
import { Sheet } from "@/components/ui";

interface GlossaryApi {
  /** Open the sheet on one entry. Unknown ids open the whole index. */
  open: (id: string) => void;
  /** Open the whole index. */
  browse: () => void;
}

const Ctx = createContext<GlossaryApi>({ open: () => {}, browse: () => {} });

export function useGlossary(): GlossaryApi {
  return useContext(Ctx);
}

export function GlossaryProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = useState<GlossaryEntry | null>(null);
  const [index, setIndex] = useState(false);

  const api = useMemo<GlossaryApi>(
    () => ({
      open: (id: string) => {
        const found = GLOSSARY_BY_ID[id];
        if (found) setEntry(found);
        else setIndex(true);
      },
      browse: () => setIndex(true),
    }),
    [],
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      <Sheet
        open={entry !== null}
        onClose={() => setEntry(null)}
        title={entry?.term ?? ""}
      >
        {entry && (
          <div className="space-y-3 pt-1">
            <p className="text-sm leading-relaxed text-berry">{entry.what}</p>
            {entry.where && (
              <div>
                <p className="text-[0.6rem] font-bold uppercase tracking-wide text-berry-soft">
                  Where it comes from
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-berry-soft">{entry.where}</p>
              </div>
            )}
            {entry.use && (
              <div>
                <p className="text-[0.6rem] font-bold uppercase tracking-wide text-berry-soft">
                  What it is for
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-berry-soft">{entry.use}</p>
              </div>
            )}
            <button
              onClick={() => {
                setEntry(null);
                setIndex(true);
              }}
              className="pressable w-full rounded-full border border-line py-2 text-xs font-semibold text-berry-soft"
            >
              Everything else, explained
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={index} onClose={() => setIndex(false)} title="What everything means" tall>
        <GlossaryIndex onPick={setEntry} />
      </Sheet>
    </Ctx.Provider>
  );
}

/**
 * The whole book.
 *
 * Filtered by what the player has actually been shown, so reading it cannot
 * spoil a mechanic four hours away. Searching searches the definitions too, not
 * only the headwords, because somebody looking up "why is my jar full" does not
 * know the word is "sealing".
 */
function GlossaryIndex({ onPick }: { onPick: (entry: GlossaryEntry) => void }) {
  const { derived } = useGame();
  const [query, setQuery] = useState("");
  const found = searchGlossary(query, derived.features);

  return (
    <div className="space-y-3 pt-1">
      <label className="flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2">
        <Search className="h-4 w-4 shrink-0 text-berry-soft" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search the glossary"
          className="w-full bg-transparent text-sm text-berry outline-none placeholder:text-berry-soft"
        />
      </label>

      {found.length === 0 && (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-berry-soft">
          Nothing by that name yet. It may still be ahead of you.
        </p>
      )}

      {GLOSSARY_GROUPS.map((group) => {
        const rows = found.filter((entry) => entry.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-berry-soft">
              {group}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {rows.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => onPick(entry)}
                    className="pressable w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-left"
                  >
                    <p className="text-sm font-semibold text-berry">{entry.term}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-berry-soft">{entry.what}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * A word in a sentence that can be tapped.
 *
 * Dotted underline rather than a link colour, because half a paragraph of
 * pink underlined words reads as a wall of links rather than as prose.
 */
export function Term({ id, children }: { id: string; children: React.ReactNode }) {
  const { open } = useGlossary();
  const entry = GLOSSARY_BY_ID[id];
  return (
    <button
      onClick={() => open(id)}
      aria-label={`What ${entry?.term ?? "this"} means`}
      className="underline decoration-dotted decoration-from-font underline-offset-2"
    >
      {children}
    </button>
  );
}

/** The question mark beside a heading, a stat, or a row. */
export function InfoDot({ id, className = "" }: { id: string; className?: string }) {
  const { open } = useGlossary();
  const entry = GLOSSARY_BY_ID[id];
  return (
    <button
      onClick={() => open(id)}
      aria-label={`What ${entry?.term ?? "this"} means`}
      className={`pressable shrink-0 text-berry-soft ${className}`}
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * A stat card that opens its own definition.
 *
 * Same shape as `Stat` in `bits.tsx`, with the whole card as the target. Every
 * number on the jar screen goes through this, which is the literal reading of
 * "be able to click on everything for information": there is now no number on
 * that screen that does not answer when you press it.
 */
export function ExplainedStat({ id, label, value, tone = "default" }: {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  const { open } = useGlossary();
  const known = GLOSSARY_BY_ID[id] !== undefined;
  const body = (
    <>
      <p className="flex items-center gap-1 truncate text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">
        <span className="truncate">{label}</span>
        {known && <HelpCircle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
      </p>
      <p className={`truncate font-display text-base font-semibold ${tone === "accent" ? "text-rose-dark" : "text-plum"}`}>
        {value}
      </p>
    </>
  );

  if (!known) {
    return <div className="min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5">{body}</div>;
  }
  return (
    <button
      onClick={() => open(id)}
      className="pressable min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5 text-left"
    >
      {body}
    </button>
  );
}

/** The whole book, inline, for the settings screen. */
export function GlossaryButton() {
  const { browse } = useGlossary();
  return (
    <button
      onClick={browse}
      className="pressable flex w-full items-center gap-2 rounded-card border border-line bg-white px-4 py-3 text-left"
    >
      <HelpCircle className="h-4 w-4 shrink-0 text-rose-dark" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-berry">What everything means</span>
        <span className="block text-xs text-berry-soft">
          Every word the game uses, defined. Searchable.
        </span>
      </span>
    </button>
  );
}
