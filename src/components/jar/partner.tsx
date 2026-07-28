"use client";

// Watching the other one play.
//
// Asked for directly: "for us you should be able to spectate like camis
// progress". It needed no new table and no new permission, which is worth
// saying because the obvious way to build it would have been a fresh column of
// summary numbers written on every save. The whole save is already in
// `game_saves.state`, both of you can already read both rows, and `derive` is
// a pure function of a state. So this fetches the save that was going to be
// fetched anyway, runs it through exactly the same code the live game uses,
// and draws it. It is never written back, so nothing here can affect them.
//
// What it deliberately does not do is compare. The rest of the Us tab adds the
// two of you together rather than ranking you, and a spectator view that
// declared a winner would undo that in one screen.

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useCouple, useWho } from "@/lib/couple-context";
import { displayName } from "@/lib/types";
import { useCachedQuery } from "@/lib/offline/cache";
import { loadPartnerSave } from "@/game/persistence";
import { currentJar } from "@/game/engine";
import { creaturesInJar, derive } from "@/game/formulas";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { CREATURE_BY_ID } from "@/game/config/creatures";
import { STAGE_BY_INDEX } from "@/game/config/stages";
import { useGame } from "@/game/store";
import { TheJar } from "./the-jar";
import { CreatureGlyph, EmptyRow, Section, Stat } from "./bits";
import { InfoDot } from "./glossary";

export function PartnerJar() {
  const { state, now } = useGame();
  const { partner: partnerProfile } = useCouple();
  const { partner } = useWho();
  const format = state.settings.numberFormat;
  const name = partnerProfile?.display_name ?? displayName(partner);

  const query = useCachedQuery(
    `game:partner:${partner}`,
    () => loadPartnerSave(partner),
    [partner],
  );

  const view = useMemo(() => {
    const save = query.data;
    if (!save) return null;
    const theirs = save.state;
    const derived = derive(theirs, save.updatedAt || now);
    return {
      theirs,
      derived,
      jar: currentJar(theirs),
      pets: creaturesInJar(theirs),
      seen: save.updatedAt,
      // What they have unlocked that you have not, and the other way round. It
      // is the only genuinely interesting thing about somebody else's idle
      // game: not how big their number is, but what they have found.
      stage: STAGE_BY_INDEX[derived.stage],
    };
  }, [query.data, now]);

  return (
    <Section
      title={`${name}'s jar`}
      hint="Their save, exactly as they left it. Nothing you do here reaches it."
      action={
        <button
          onClick={() => query.refresh()}
          aria-label="Check again"
          className="pressable flex items-center gap-1 text-xs font-semibold text-rose-dark"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      }
    >
      {!view ? (
        <EmptyRow>
          {query.status === "loading"
            ? "Looking for their jar."
            : `${name} has not opened the jar yet. It will show up here when they do.`}
        </EmptyRow>
      ) : (
        <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
          <div
            className="relative flex items-end justify-center gap-1 rounded-card px-2 pt-3"
            style={{ backgroundColor: view.jar.backdrop }}
          >
            <span className="flex w-14 shrink-0 flex-wrap items-end justify-end gap-0.5 pb-5">
              {view.pets
                .filter((c) => CREATURE_BY_ID[c.defId]?.line === "otter")
                .map((creature) => (
                  <CreatureGlyph
                    key={creature.id}
                    line="otter"
                    color={CREATURE_BY_ID[creature.defId]?.color ?? "#a87f6a"}
                    className="h-6 w-6"
                  />
                ))}
            </span>

            <TheJar
              hearts={view.theirs.wallet.hearts}
              jar={view.jar}
              capacity={view.derived.jarCapacity}
              reducedMotion
              className="h-36 w-28 shrink-0"
            />

            <span className="flex w-14 shrink-0 flex-wrap items-end justify-start gap-0.5 pb-5">
              {view.pets
                .filter((c) => CREATURE_BY_ID[c.defId]?.line === "crab")
                .map((creature) => (
                  <CreatureGlyph
                    key={creature.id}
                    line="crab"
                    color={CREATURE_BY_ID[creature.defId]?.color ?? "#8a5a4a"}
                    className="h-6 w-6"
                  />
                ))}
            </span>

            <span
              aria-hidden="true"
              className="absolute inset-x-3 bottom-2 h-1.5 rounded-full"
              style={{ backgroundColor: view.jar.shelf, opacity: 0.7 }}
            />
            <p className="absolute left-3 top-2 text-[0.65rem] font-semibold text-berry-soft">
              {view.jar.name}
            </p>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <Stat label="Per second" value={formatNumber(view.derived.heartsPerSecond, format)} />
            <Stat label="On the shelf" value={formatNumber(view.theirs.shelfHearts, format)} />
            <Stat label="Jars sealed" value={`${view.theirs.stats.jarsSealed}`} />
            <Stat label="Rebirths" value={`${view.theirs.tideChanges}`} />
            <Stat label="Ascensions" value={`${view.theirs.newWaters}`} />
            <Stat label="Pets" value={`${Object.keys(view.theirs.creatures).length}`} />
          </div>

          {view.stage && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-cream px-3 py-2 text-xs leading-relaxed text-berry-soft">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-berry">Furthest they have got: </span>
                {view.stage.title}. {view.stage.body}
              </span>
              <InfoDot id="us" />
            </p>
          )}

          <p className="mt-1.5 text-[0.65rem] text-berry-soft">
            {view.seen > 0
              ? `Last played ${formatDurationShort(Math.max(0, now - view.seen))} ago.`
              : "Last played recently."}
            {query.stale && " Showing the copy on this device."}
          </p>
        </div>
      )}
    </Section>
  );
}
