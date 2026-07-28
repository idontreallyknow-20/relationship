"use client";

// The jar playing itself.
//
// All of this already existed and none of it was reachable. `state.auto.tap`
// was never set to true by anything on screen, `setAutobuyer` had no caller,
// and the tab that should have held them rendered nothing at all: the stage
// ladder revealed a tab called Automation at rung eight and pressing it gave
// you a blank page. So every moon upgrade on that line was buying a switch
// that did not exist anywhere in the interface.
//
// This is that page. Each row says what the thing does, whether it is on, and
// what would unlock it if it is not, which is the same shape every other list
// in the game uses.

import { useGame } from "@/game/store";
import { hasFlag } from "@/game/formulas";
import { setAutobuyer } from "@/game/actions";
import { formatNumber } from "@/game/numbers";
import { Section } from "./bits";
import { InfoDot } from "./glossary";

const BUYERS = [
  {
    id: "upgrades",
    name: "Buys upgrades",
    what: "Buys the cheapest upgrade it can afford, over and over.",
    flag: "auto_buy",
    unlock: "Buys For You, in the moon tree",
  },
  {
    id: "shelf",
    name: "Buys shelf upgrades",
    what: "Spends ribbons on the shelf tree the moment it can.",
    flag: "auto_buy",
    unlock: "Buys For You, in the moon tree",
  },
] as const;

/** How much of the balance an autobuyer is allowed to touch. */
const SHARES = [0.25, 0.5, 0.75, 1];

export function AutomationTab() {
  const { state, derived, mutate } = useGame();
  const format = state.settings.numberFormat;

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-card border border-line bg-white px-3.5 py-2.5 text-sm leading-relaxed text-berry-soft">
        Everything here does something you would otherwise do by hand. None of
        it is faster than you are; it is just still going when you are not.
      </p>

      <Section title="Tapping">
        <Switch
          name="Taps for you"
          what={
            derived.autoTapsPerSecond > 0
              ? `${formatNumber(derived.autoTapsPerSecond, format)} taps a second, at full strength.`
              : "Buy Quick Hands in the moon tree first. Without it this taps zero times a second."
          }
          on={state.auto.tap}
          disabled={derived.autoTapsPerSecond <= 0}
          unlock="Quick Hands, in the moon tree"
          onToggle={() => mutate((draft) => void (draft.auto.tap = !draft.auto.tap))}
        />
      </Section>

      <Section title="Buying">
        <ul className="flex flex-col gap-2">
          {BUYERS.map((buyer) => {
            const unlocked = hasFlag(state, buyer.flag);
            const current = state.autobuyers[buyer.id] ?? {
              on: false, max: true, threshold: 1, lastRunAt: 0,
            };
            return (
              <li key={buyer.id} className="rounded-card border border-line bg-white p-3.5">
                <Switch
                  name={buyer.name}
                  what={buyer.what}
                  on={current.on}
                  disabled={!unlocked}
                  unlock={buyer.unlock}
                  bare
                  onToggle={() =>
                    mutate((draft) => setAutobuyer(draft, buyer.id, { on: !current.on }))
                  }
                />

                {unlocked && current.on && (
                  <div className="mt-2.5 border-t border-line-soft pt-2.5">
                    <p className="flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wide text-berry-soft">
                      How much of your balance it may spend
                      <InfoDot id="automation" />
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      {SHARES.map((share) => (
                        <button
                          key={share}
                          onClick={() =>
                            mutate((draft) => setAutobuyer(draft, buyer.id, { threshold: share }))
                          }
                          aria-pressed={Math.abs(current.threshold - share) < 0.01}
                          className={`pressable flex-1 rounded-full px-2 py-1.5 text-xs font-semibold ${
                            Math.abs(current.threshold - share) < 0.01
                              ? "bg-plum text-white"
                              : "bg-cream text-berry-soft"
                          }`}
                        >
                          {Math.round(share * 100)}%
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-berry-soft">
                      It takes that share, spends what it can of it, and puts the
                      rest back. The other switches get their own share of what
                      is left, so turning them all on cannot empty the wallet.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="The rest">
        <ul className="flex flex-col gap-2">
          <li>
            <Row
              name="Seals a full jar"
              what="The moment the jar fills it goes on the shelf and a new one starts."
              on={derived.autoSeal}
              unlock="Seals For You, in the shelf tree"
            />
          </li>
          <li>
            <Row
              name="Fires abilities"
              what="Any ability you have switched to auto fires itself the moment it is ready."
              on={hasFlag(state, "auto_skill") && state.settings.autoSkills}
              unlock="Fires For You, in the moon tree"
            />
          </li>
          <li>
            <Row
              name="Is reborn for you"
              what="Rebirth happens on its own the moment it is worth doing."
              on={hasFlag(state, "auto_rebirth")}
              unlock="Reborn For You, in the moon tree"
            />
          </li>
          <li>
            <Row
              name="Ascends for you"
              what="Ascension happens on its own, once it would pay."
              on={hasFlag(state, "auto_tide")}
              unlock="It Turns Itself, in the sun tree"
            />
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Switch({ name, what, on, disabled, unlock, onToggle, bare = false }: {
  name: string;
  what: string;
  on: boolean;
  disabled?: boolean;
  unlock: string;
  onToggle: () => void;
  bare?: boolean;
}) {
  return (
    <div className={bare ? "flex items-start gap-2" : "flex items-start gap-2 rounded-card border border-line bg-white p-3.5"}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-berry">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-berry-soft">{what}</p>
        {disabled && (
          <p className="mt-1 text-xs font-semibold text-berry-soft">Needs {unlock}.</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={on && !disabled}
        aria-label={name}
        disabled={disabled}
        onClick={onToggle}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
          disabled ? "bg-cream text-berry-soft" : on ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
        }`}
      >
        {disabled ? "Locked" : on ? "On" : "Off"}
      </button>
    </div>
  );
}

/** A switch somebody else owns: shown, explained, not toggled from here. */
function Row({ name, what, on, unlock }: {
  name: string;
  what: string;
  on: boolean;
  unlock: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-card border border-line bg-white p-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-berry">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-berry-soft">{what}</p>
        {!on && <p className="mt-1 text-xs font-semibold text-berry-soft">Needs {unlock}.</p>}
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
          on ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </div>
  );
}
