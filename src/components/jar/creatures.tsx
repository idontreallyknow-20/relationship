"use client";

// The jar's inhabitants: her otters, his crabs, what they eat, and what they
// carry. One tab, because they are one system.

import { useMemo, useState } from "react";
import { Lock, Plus, Unlock } from "lucide-react";
import { useGame } from "@/game/store";
import {
  CREATURES, CREATURE_BY_ID, LINE_NAME, TRAIT_BY_ID, xpFor,
} from "@/game/config/creatures";
import { FOODS } from "@/game/config/memories";
import { CRAFT_COST, RARITIES, RARITY_META, polishCost, rerollCost, salvageValue } from "@/game/config/items";
import { CURRENCY_BY_ID } from "@/game/config/currencies";
import { hasFlag, heldHands } from "@/game/formulas";
import {
  addCreature, craftItem, feedCreature, giveItem, growCreature, nameCreature,
  placeCreature, polishItem, rerollItem, salvageItem,
} from "@/game/actions";
import { formatNumber } from "@/game/numbers";
import type { CreatureInstance, ItemRarity } from "@/game/types";
import { Button, Input, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { Bar, CreatureGlyph, EmptyRow, Section, Tag } from "./bits";

type View = "jar" | "all" | "items";

export function CreaturesTab() {
  const { state, derived, mutate, version, notify } = useGame();
  const toast = useToast();
  const [view, setView] = useState<View>("jar");
  const [selected, setSelected] = useState<CreatureInstance | null>(null);
  const format = state.settings.numberFormat;

  const owned = useMemo(() => Object.values(state.creatures), [state.creatures, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const paired = heldHands(state);

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<View>
        label="Section"
        value={view}
        onChange={setView}
        options={[
          { value: "jar", label: "In the jar" },
          { value: "all", label: "All of them" },
          { value: "items", label: "Rocks and shells" },
        ]}
      />

      {view === "jar" && (
        <Section
          title="In the jar"
          hint={`${derived.creatureSlots} places. Otters beside otters hold hands.`}
        >
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: derived.creatureSlots }, (_, index) => {
              const id = state.slots[index] ?? null;
              const creature = id ? state.creatures[id] : null;
              const def = creature ? CREATURE_BY_ID[creature.defId] : null;
              return (
                <button
                  key={index}
                  onClick={() => (creature ? setSelected(creature) : setView("all"))}
                  className={`pressable flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center ${
                    creature && paired.has(creature.id) ? "border-rose-dark bg-blush/40" : "border-line bg-white"
                  }`}
                >
                  {def ? (
                    <>
                      <CreatureGlyph line={def.line} color={def.color} className="h-8 w-8" />
                      <span className="w-full truncate text-[0.6rem] font-bold leading-tight text-berry">
                        {creature!.name ?? def.name}
                      </span>
                      <span className="text-[0.55rem] text-berry-soft">
                        {creature!.level} · {creature!.fed >= 50 ? "fed" : "hungry"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-line text-berry-soft">
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="text-[0.6rem] text-berry-soft">Empty</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-berry-soft">
            Otters crack shells at the surface. What comes out sinks. Crabs pick it up off the floor.
          </p>
        </Section>
      )}

      {view === "all" && (
        <>
          {(["otter", "crab"] as const).map((line) => (
            <Section key={line} title={LINE_NAME[line]} hint={line === "otter" ? "Cami" : "Joseph"}>
              <ul className="flex flex-col gap-2">
                {CREATURES.filter((d) => d.line === line).map((def) => {
                  const mine = owned.find((c) => c.defId === def.id);
                  const ready = state.lifetime.hearts >= def.unlockLifetime;
                  const affordable = !def.cost || state.wallet[def.cost.currency] >= def.cost.amount;
                  return (
                    <li
                      key={def.id}
                      className={`rounded-card border bg-white p-3 shadow-soft ${mine ? "border-line" : "border-line-soft"}`}
                    >
                      <div className="flex items-start gap-3">
                        <CreatureGlyph
                          line={def.line}
                          color={ready || mine ? def.color : "#d8d0cc"}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-berry">{def.name}</p>
                          <p className="text-xs text-berry-soft">{def.ability}</p>
                          {!ready && (
                            <p className="mt-1 text-[0.65rem] text-berry-soft">
                              At {formatNumber(def.unlockLifetime, format)} lifetime hearts
                            </p>
                          )}
                        </div>
                        {mine ? (
                          <Button size="sm" variant="secondary" onClick={() => setSelected(mine)}>
                            Level {mine.level}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={!ready || !affordable}
                            onClick={() =>
                              mutate((draft) => {
                                const result = addCreature(draft, def.id, Date.now());
                                if (!result.ok) toast(result.message ?? "Not yet");
                                else notify({ kind: "reward", title: result.message ?? def.name });
                              })
                            }
                          >
                            {def.cost
                              ? `${def.cost.amount} ${CURRENCY_BY_ID[def.cost.currency].short}`
                              : "Free"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
        </>
      )}

      {view === "items" && <ItemsView />}

      {selected && <CreatureSheet creature={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One creature                                                        */
/* ------------------------------------------------------------------ */

function CreatureSheet({ creature, onClose }: { creature: CreatureInstance; onClose: () => void }) {
  const { state, derived, mutate } = useGame();
  const toast = useToast();
  const [name, setName] = useState(creature.name ?? "");
  const live = state.creatures[creature.id] ?? creature;
  const def = CREATURE_BY_ID[live.defId];
  if (!def) return null;

  const inJar = state.slots.indexOf(live.id);
  const target = def.evolvesTo ? CREATURE_BY_ID[def.evolvesTo] : null;
  const wants = def.line === "otter" ? "rock" : "shell";
  const item = live.itemId ? state.items[live.itemId] : null;
  const available = Object.values(state.items).filter((i) => i.kind === wants);

  return (
    <Sheet open onClose={onClose} title={live.name ?? def.name} tall>
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-3">
          <CreatureGlyph line={def.line} color={def.color} className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-berry">{def.ability}</p>
            <p className="mt-0.5 text-xs italic text-berry-soft">{def.blurb}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Fact label="Level" value={`${live.level} of ${def.maxLevel}`} />
          <Fact label="Trait" value={TRAIT_BY_ID[live.trait]?.name ?? "plain"} />
          <Fact label="Fed" value={`${Math.round(live.fed)}%`} />
          <Fact label="Grown" value={`${live.stars}`} />
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-berry-soft">Experience</p>
          <Bar value={live.xp} max={xpFor(live.level)} />
        </div>

        {TRAIT_BY_ID[live.trait] && (
          <p className="rounded-xl bg-blush/50 px-3.5 py-2.5 text-sm text-berry">
            {TRAIT_BY_ID[live.trait].name}: {TRAIT_BY_ID[live.trait].description}
          </p>
        )}

        {/* Food */}
        <Section title="Feed" hint={`${Math.round(live.fed)}% full`}>
          <div className="grid grid-cols-2 gap-2">
            {FOODS.map((food) => {
              const liked = food.favouredBy === def.line;
              const affordable = state.wallet[food.cost.currency] >= food.cost.amount;
              return (
                <button
                  key={food.id}
                  disabled={!affordable}
                  onClick={() =>
                    mutate((draft) => {
                      const result = feedCreature(draft, live.id, food.id);
                      toast(result.message ?? (result.ok ? "Fed" : "Not enough"));
                    })
                  }
                  className={`pressable rounded-xl border px-3 py-2 text-left ${
                    affordable ? "border-line bg-white" : "border-line-soft bg-cream/60"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: food.color }} />
                    <span className="truncate text-xs font-bold text-berry">{food.name}</span>
                    {liked && <span className="text-[0.55rem] font-bold text-rose-dark">likes</span>}
                  </span>
                  <span className="mt-0.5 block text-[0.6rem] text-berry-soft">
                    {food.cost.amount} {CURRENCY_BY_ID[food.cost.currency].short}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Item */}
        {hasFlag(state, "items") && (
          <Section title={wants === "rock" ? "Favourite rock" : "Shell"}>
            {item ? (
              <div className="rounded-xl border border-line bg-white p-3">
                <p className="flex items-center gap-1.5">
                  <Tag label={RARITY_META[item.rarity].label} color={RARITY_META[item.rarity].color} />
                  <span className="text-sm font-semibold text-berry">{item.defId}</span>
                  <span className="text-xs text-berry-soft">+{item.level}</span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {item.affixes.map((affix, i) => (
                    <li key={i} className="text-xs text-berry">
                      {affix.kind === "add"
                        ? `+${formatNumber(affix.value)} ${affix.stat}`
                        : `+${(affix.value * 100).toFixed(1)}% ${affix.stat}`}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1.5"
                  onClick={() => mutate((draft) => void giveItem(draft, live.id, null))}
                >
                  Take it back
                </Button>
              </div>
            ) : available.length === 0 ? (
              <EmptyRow>Nothing to give them yet. Make one from sea glass.</EmptyRow>
            ) : (
              <ul className="space-y-1.5">
                {available.map((option) => (
                  <li key={option.id}>
                    <button
                      onClick={() =>
                        mutate((draft) => {
                          const result = giveItem(draft, live.id, option.id);
                          if (!result.ok) toast(result.message ?? "No");
                        })
                      }
                      className="pressable flex w-full items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left"
                    >
                      <Tag label={RARITY_META[option.rarity].label} color={RARITY_META[option.rarity].color} />
                      <span className="flex-1 truncate text-sm text-berry">{option.defId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {target && def.evolveAt && (
          <div className="rounded-xl border border-line bg-white p-3.5">
            <p className="text-sm font-semibold text-berry">
              {def.line === "crab" ? "Molts into" : "Grows into"} {target.name}
            </p>
            <p className="text-xs text-berry-soft">
              Level {def.evolveAt.level} and {def.evolveAt.glass} sea glass. Keeps most of its level.
            </p>
            <Button
              size="sm"
              className="mt-2"
              disabled={live.level < def.evolveAt.level || state.wallet.glass < def.evolveAt.glass}
              onClick={() =>
                mutate((draft) => {
                  const result = growCreature(draft, live.id);
                  toast(result.message ?? "Not yet");
                })
              }
            >
              {def.line === "crab" ? "Molt" : "Grow"}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {inJar >= 0 ? (
            <Button size="sm" variant="secondary" onClick={() => mutate((draft) => void placeCreature(draft, inJar, null))}>
              Take out of the jar
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                mutate((draft) => {
                  const empty = draft.slots.findIndex((s, i) => !s && i < derived.creatureSlots);
                  const result = placeCreature(draft, empty >= 0 ? empty : 0, live.id);
                  if (!result.ok) toast(result.message ?? "No room");
                })
              }
            >
              Put in the jar
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => mutate((draft) => void (draft.creatures[live.id].locked = !live.locked))}
          >
            {live.locked ? <><Unlock className="h-4 w-4" /> Unlock</> : <><Lock className="h-4 w-4" /> Lock</>}
          </Button>
        </div>

        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Give them a name" maxLength={24} />
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => mutate((draft) => void nameCreature(draft, live.id, name))}
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</p>
      <p className="truncate font-semibold text-berry">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rocks and shells                                                    */
/* ------------------------------------------------------------------ */

function ItemsView() {
  const { state, mutate, version } = useGame();
  const toast = useToast();
  const [kind, setKind] = useState<"rock" | "shell">("rock");
  const [rarity, setRarity] = useState<ItemRarity>("plain");
  const format = state.settings.numberFormat;

  const items = useMemo(
    () => Object.values(state.items).filter((i) => i.kind === kind),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, kind],
  );

  if (!hasFlag(state, "items")) {
    return <EmptyRow>Rocks and shells unlock with a moon upgrade.</EmptyRow>;
  }

  const wearer = (itemId: string) =>
    Object.values(state.creatures).find((c) => c.itemId === itemId);

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Kind"
        value={kind}
        onChange={(v) => setKind(v as "rock" | "shell")}
        options={[{ value: "rock", label: "Rocks" }, { value: "shell", label: "Shells" }]}
      />

      <Section title="Make one" hint={`${formatNumber(state.wallet.glass, format)} sea glass`}>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {RARITIES.map((r) => (
            <button
              key={r}
              onClick={() => setRarity(r)}
              className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                rarity === r ? "border-plum bg-plum text-white" : "border-line bg-white text-berry-soft"
              }`}
            >
              {RARITY_META[r].label}
            </button>
          ))}
        </div>
        <Button
          className="mt-2"
          disabled={state.wallet.glass < CRAFT_COST[rarity]}
          onClick={() =>
            mutate((draft) => {
              const result = craftItem(draft, kind, rarity);
              toast(result.message ?? "Cannot make that");
            })
          }
        >
          {RARITY_META[rarity].label} {kind} for {CRAFT_COST[rarity]} sea glass
        </Button>
      </Section>

      {items.length === 0 ? (
        <EmptyRow>None yet.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const worn = wearer(item.id);
            return (
              <li key={item.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                <p className="flex items-center gap-1.5">
                  <Tag label={RARITY_META[item.rarity].label} color={RARITY_META[item.rarity].color} />
                  <span className="text-sm font-semibold text-berry">{item.defId}</span>
                  <span className="text-xs text-berry-soft">+{item.level}</span>
                  {item.locked && <Lock className="h-3 w-3 text-berry-soft" />}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {item.affixes.map((affix, i) => (
                    <li key={i} className="text-xs text-berry">
                      {affix.kind === "add"
                        ? `+${formatNumber(affix.value)} ${affix.stat}`
                        : `+${(affix.value * 100).toFixed(1)}% ${affix.stat}`}
                    </li>
                  ))}
                </ul>
                {worn && (
                  <p className="mt-1 text-[0.65rem] font-semibold text-rose-dark">
                    Carried by {worn.name ?? CREATURE_BY_ID[worn.defId]?.name}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => mutate((d) => void toast(polishItem(d, item.id).message ?? ""))}>
                    Polish ({polishCost(item.rarity, item.level)})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => mutate((d) => void toast(rerollItem(d, item.id).message ?? ""))}>
                    Reroll ({rerollCost(item.rarity)})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => mutate((draft) => void (draft.items[item.id].locked = !item.locked))}
                  >
                    {item.locked ? "Unlock" : "Lock"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={item.locked}
                    onClick={() => mutate((d) => void toast(salvageItem(d, item.id).message ?? ""))}
                  >
                    Salvage (+{salvageValue(item.rarity, item.level)})
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
