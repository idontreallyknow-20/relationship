"use client";

// Pets and charms: the two systems that decide what kind of player you are.

import { useMemo, useState } from "react";
import { Egg, Heart, Lock, Sparkles, Star, Unlock } from "lucide-react";
import { useGame } from "@/game/store";
import {
  EGGS, PETS, PET_BY_ID, RARITY_META, RARITY_ORDER, TRAIT_BY_ID,
  petFeedCost, petXpFor,
} from "@/game/config/pets";
import { CHARM_SETS, CHARM_SLOTS, CRAFT_COST, enhanceCost, rerollCost, salvageValue } from "@/game/config/charms";
import { activeCharmSets, hasFlag } from "@/game/formulas";
import {
  collectExpedition, craftCharm, enhanceCharm, equipCharm, equipPet, evolvePet,
  feedPet, fusePets, openEgg, releasePet, rerollCharm, salvageCharm, sendExpedition,
} from "@/game/actions";
import { buyShopItem } from "@/game/actions";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import type { CharmSlot, PetInstance, Rarity } from "@/game/types";
import { Button, ConfirmDialog, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { Bar, EmptyRow, RarityTag, Section } from "./bits";

type PetView = "team" | "collection" | "eggs" | "codex";

export function PetsTab() {
  const { state, derived, mutate, version, notify } = useGame();
  const toast = useToast();
  const [view, setView] = useState<PetView>("team");
  const [selected, setSelected] = useState<PetInstance | null>(null);
  const [fuseWith, setFuseWith] = useState<PetInstance | null>(null);
  const format = state.settings.numberFormat;

  const pets = useMemo(() => Object.values(state.pets), [state.pets, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadout = state.petLoadouts[state.activeLoadout] ?? state.petLoadouts[0];

  const hatch = (eggId: string) => {
    mutate((draft) => {
      const result = openEgg(draft, eggId, Date.now());
      if (!result.ok) {
        toast(result.message ?? "Could not open that");
        return;
      }
      const def = result.pet ? PET_BY_ID[result.pet.defId] : null;
      notify({
        kind: "reward",
        title: `${def?.name ?? "A pet"} hatched`,
        detail: `${RARITY_META[def?.rarity ?? "common"].label}${result.newToCodex ? ", new to the codex" : result.duplicate ? ", duplicate converted to treats" : ""}`,
      });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<PetView>
        label="Pet section"
        value={view}
        onChange={setView}
        options={[
          { value: "team", label: "Team" },
          { value: "collection", label: "Sanctuary" },
          { value: "eggs", label: "Eggs" },
          { value: "codex", label: "Codex" },
        ]}
      />

      {view === "team" && (
        <Section title="In the field" hint={`${derived.petSlots} slots. Tap a slot to change it.`}>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: derived.petSlots }, (_, index) => {
              const petId = loadout?.slots[index] ?? null;
              const pet = petId ? state.pets[petId] : null;
              const def = pet ? PET_BY_ID[pet.defId] : null;
              return (
                <button
                  key={index}
                  onClick={() => setView("collection")}
                  className="pressable flex flex-col items-center gap-1 rounded-xl border border-line bg-white px-2 py-3 text-center"
                >
                  {def ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-8 w-8 rounded-full"
                        style={{ backgroundColor: def.color }}
                      />
                      <span className="text-[0.65rem] font-bold leading-tight text-berry">
                        {pet!.nickname ?? def.name}
                      </span>
                      <span className="text-[0.6rem] text-berry-soft">lv {pet!.level}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-line text-berry-soft">
                        <Heart className="h-4 w-4" />
                      </span>
                      <span className="text-[0.65rem] text-berry-soft">Empty</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex gap-2">
            {state.petLoadouts.map((entry, index) => (
              <button
                key={entry.name}
                onClick={() => mutate((draft) => void (draft.activeLoadout = index))}
                className={`pressable flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  state.activeLoadout === index
                    ? "border-plum bg-plum text-white"
                    : "border-line bg-white text-berry-soft"
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs text-berry-soft">
            Rarity buys breadth, not raw power. A common pet that does one thing very well is
            often the right pick for a build that only cares about that thing.
          </p>
        </Section>
      )}

      {view === "collection" && (
        <Section title="Sanctuary" hint={`${pets.length} pets`}>
          {pets.length === 0 ? (
            <EmptyRow>No pets yet. Open an egg to meet your first one.</EmptyRow>
          ) : (
            <ul className="flex flex-col gap-2">
              {pets
                .sort((a, b) => {
                  const ra = RARITY_ORDER.indexOf(PET_BY_ID[a.defId]?.rarity ?? "common");
                  const rb = RARITY_ORDER.indexOf(PET_BY_ID[b.defId]?.rarity ?? "common");
                  return rb - ra || b.level - a.level;
                })
                .map((pet) => {
                  const def = PET_BY_ID[pet.defId];
                  if (!def) return null;
                  const equipped = loadout?.slots.includes(pet.id);
                  return (
                    <li key={pet.id}>
                      <button
                        onClick={() => setSelected(pet)}
                        className="pressable flex w-full items-center gap-3 rounded-card border border-line bg-white p-3 text-left shadow-soft"
                      >
                        <span
                          aria-hidden="true"
                          className="h-10 w-10 shrink-0 rounded-full"
                          style={{ backgroundColor: def.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-berry">
                              {pet.nickname ?? def.name}
                            </span>
                            {pet.locked && <Lock className="h-3 w-3 shrink-0 text-berry-soft" />}
                            {pet.stars > 0 && (
                              <span className="flex shrink-0 items-center gap-0.5 text-[0.65rem] font-bold text-rose-dark">
                                <Star className="h-3 w-3" />
                                {pet.stars}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-berry-soft">
                            lv {pet.level} · {TRAIT_BY_ID[pet.trait]?.name ?? "plain"} · {pet.personality}
                          </span>
                          <span className="mt-1 block">
                            <Bar value={pet.xp} max={petXpFor(pet.level)} height="0.2rem" />
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <RarityTag rarity={RARITY_META[def.rarity].label} color={RARITY_META[def.rarity].color} />
                          {equipped && (
                            <span className="text-[0.6rem] font-bold text-rose-dark">In field</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </Section>
      )}

      {view === "eggs" && (
        <Section title="Eggs" hint="Duplicates convert into treats and shards, so no draw is wasted.">
          <ul className="flex flex-col gap-2">
            {EGGS.map((egg) => {
              const owned = state.eggs[egg.id] ?? 0;
              const pity = state.pity[egg.id] ?? 0;
              const unlocked = state.lifetime.hearts >= egg.unlockLifetime;
              const shopItem = `s_egg_${egg.id}`;
              return (
                <li key={egg.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-dark">
                      <Egg className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-berry">{egg.name}</p>
                      <p className="text-xs text-berry-soft">{egg.description}</p>
                      <p className="mt-1 text-[0.65rem] text-berry-soft">
                        {unlocked
                          ? `${owned} in your bag · guaranteed ${RARITY_META[egg.pityRarity].label} in ${Math.max(0, egg.pityAt - pity)} more`
                          : `Unlocks at ${formatNumber(egg.unlockLifetime, format)} lifetime hearts`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!unlocked || owned <= 0}
                      onClick={() => hatch(egg.id)}
                    >
                      Open one
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!unlocked}
                      onClick={() =>
                        mutate((draft) => {
                          const result = buyShopItem(draft, shopItem, Date.now());
                          toast(result.message ?? "Could not buy that");
                        })
                      }
                    >
                      Buy for {egg.cost.amount} {egg.cost.currency === "hearts" ? "hearts" : egg.cost.currency}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {view === "codex" && (
        <Section title="Pet codex" hint={`${state.petCodex.length} of ${PETS.length} discovered`}>
          <ul className="grid grid-cols-2 gap-2">
            {PETS.map((def) => {
              const found = state.petCodex.includes(def.id);
              return (
                <li
                  key={def.id}
                  className={`rounded-xl border p-3 ${found ? "border-line bg-white" : "border-dashed border-line bg-white/50"}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 rounded-full"
                      style={{ backgroundColor: found ? def.color : "var(--color-line)" }}
                    />
                    <p className="truncate text-xs font-bold text-berry">
                      {found ? def.name : "Not met yet"}
                    </p>
                  </div>
                  <p className="mt-1 text-[0.65rem] text-berry-soft">
                    {found ? def.ability : `A ${RARITY_META[def.rarity].label.toLowerCase()} pet.`}
                  </p>
                  {found && (
                    <p className="mt-1 text-[0.6rem] font-semibold text-rose-dark">{def.playstyle}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <PetSheet
        pet={selected}
        onClose={() => setSelected(null)}
        onFuse={(pet) => {
          setFuseWith(pet);
          setSelected(null);
        }}
      />

      <FuseSheet keep={fuseWith} onClose={() => setFuseWith(null)} />
    </div>
  );
}

function PetSheet({
  pet,
  onClose,
  onFuse,
}: {
  pet: PetInstance | null;
  onClose: () => void;
  onFuse: (pet: PetInstance) => void;
}) {
  const { state, derived, mutate, now } = useGame();
  const toast = useToast();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [nickname, setNickname] = useState("");
  if (!pet) return null;
  const live = state.pets[pet.id] ?? pet;
  const def = PET_BY_ID[live.defId];
  if (!def) return null;

  const loadout = state.petLoadouts[state.activeLoadout];
  const equippedSlot = loadout?.slots.indexOf(live.id) ?? -1;
  const evolveTarget = def.evolvesTo ? PET_BY_ID[def.evolvesTo] : null;

  return (
    <Sheet open onClose={onClose} title={live.nickname ?? def.name} tall>
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-14 w-14 shrink-0 rounded-full"
            style={{ backgroundColor: def.color }}
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <RarityTag rarity={RARITY_META[def.rarity].label} color={RARITY_META[def.rarity].color} />
              {live.stars > 0 && (
                <span className="flex items-center gap-0.5 text-xs font-bold text-rose-dark">
                  <Star className="h-3 w-3" />
                  {live.stars}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-berry">{def.ability}</p>
            <p className="text-xs text-berry-soft">{def.playstyle}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Fact label="Level" value={`${live.level} of ${def.maxLevel}`} />
          <Fact label="Trait" value={TRAIT_BY_ID[live.trait]?.name ?? "plain"} />
          <Fact label="Personality" value={live.personality} />
          <Fact label="Happiness" value={`${Math.round(live.happiness)}%`} />
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-berry-soft">Experience</p>
          <Bar value={live.xp} max={petXpFor(live.level)} />
        </div>

        {TRAIT_BY_ID[live.trait] && (
          <p className="rounded-xl bg-blush/50 px-3.5 py-2.5 text-sm text-berry">
            {TRAIT_BY_ID[live.trait].name}: {TRAIT_BY_ID[live.trait].description}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              mutate((draft) => {
                const result = feedPet(draft, live.id);
                toast(result.message ?? (result.ok ? "Fed" : "Not enough treats"));
              })
            }
          >
            Feed ({petFeedCost(live.level)} treats)
          </Button>

          {equippedSlot >= 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => mutate((draft) => void equipPet(draft, equippedSlot, null))}
            >
              Take out of the field
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                mutate((draft) => {
                  const slots = draft.petLoadouts[draft.activeLoadout]?.slots ?? [];
                  let target = slots.findIndex((s, i) => !s && i < derived.petSlots);
                  if (target < 0) target = 0;
                  const result = equipPet(draft, target, live.id);
                  if (!result.ok) toast(result.message ?? "Could not equip");
                })
              }
            >
              Put in the field
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => mutate((draft) => void (draft.pets[live.id].locked = !live.locked))}
          >
            {live.locked ? (
              <>
                <Unlock className="h-4 w-4" /> Unlock
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> Lock
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => mutate((draft) => void (draft.pets[live.id].favorite = !live.favorite))}
          >
            {live.favorite ? "Unfavorite" : "Favorite"}
          </Button>
        </div>

        {evolveTarget && def.evolveAt && (
          <div className="rounded-xl border border-line bg-white p-3.5">
            <p className="text-sm font-semibold text-berry">Evolves into {evolveTarget.name}</p>
            <p className="text-xs text-berry-soft">
              Needs level {def.evolveAt.level} and {def.evolveAt.shards} memory shards. The evolved
              form keeps most of its level.
            </p>
            <Button
              size="sm"
              className="mt-2"
              disabled={live.level < def.evolveAt.level || state.wallet.shards < def.evolveAt.shards}
              onClick={() =>
                mutate((draft) => {
                  const result = evolvePet(draft, live.id);
                  toast(result.message ?? "Could not evolve");
                })
              }
            >
              Evolve
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-line bg-white p-3.5">
          <p className="text-sm font-semibold text-berry">Expedition</p>
          {live.expedition ? (
            <>
              <p className="text-xs text-berry-soft">
                Away for {formatDurationShort(Math.max(0, live.expedition.endsAt - now))} more.
              </p>
              <Button
                size="sm"
                className="mt-2"
                disabled={live.expedition.endsAt > now}
                onClick={() =>
                  mutate((draft) => {
                    const result = collectExpedition(draft, live.id, Date.now());
                    toast(result.message ?? "Not back yet");
                  })
                }
              >
                Welcome them back
              </Button>
            </>
          ) : (
            <div className="mt-2 flex gap-2">
              {(["short", "long", "deep"] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    mutate((draft) => {
                      const result = sendExpedition(draft, live.id, kind, Date.now());
                      toast(result.message ?? "Could not send");
                    })
                  }
                >
                  {kind === "short" ? "15m" : kind === "long" ? "1h" : "4h"}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Give them a name"
            maxLength={20}
            className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-berry"
          />
          <Button
            size="sm"
            disabled={!nickname.trim()}
            onClick={() =>
              mutate((draft) => {
                draft.pets[live.id].nickname = nickname.trim();
                setNickname("");
              })
            }
          >
            Save
          </Button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => onFuse(live)}>
            <Sparkles className="h-4 w-4" />
            Fuse
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={live.locked}
            onClick={() => setConfirmRelease(true)}
          >
            Release
          </Button>
        </div>

        <ConfirmDialog
          open={confirmRelease}
          title={`Release ${live.nickname ?? def.name}?`}
          message="They convert into treats and shards. This cannot be undone."
          confirmLabel="Release"
          destructive
          onConfirm={() => {
            mutate((draft) => {
              const result = releasePet(draft, live.id);
              toast(result.message ?? "Released");
            });
            setConfirmRelease(false);
            onClose();
          }}
          onCancel={() => setConfirmRelease(false)}
        />
      </div>
    </Sheet>
  );
}

function FuseSheet({ keep, onClose }: { keep: PetInstance | null; onClose: () => void }) {
  const { state, mutate } = useGame();
  const toast = useToast();
  if (!keep) return null;
  const keepDef = PET_BY_ID[keep.defId];
  const candidates = Object.values(state.pets).filter((p) => p.id !== keep.id && !p.locked);

  return (
    <Sheet open onClose={onClose} title={`Fuse into ${keepDef?.name ?? "pet"}`} tall>
      <div className="space-y-3 pt-1">
        <p className="text-sm text-berry-soft">
          Fusing adds a star and some levels to the keeper, and consumes the other pet. The
          sacrifice has to be within one rarity of the keeper.
        </p>
        {candidates.length === 0 ? (
          <EmptyRow>No unlocked pets available to fuse.</EmptyRow>
        ) : (
          <ul className="space-y-2">
            {candidates.map((pet) => {
              const def = PET_BY_ID[pet.defId];
              return (
                <li key={pet.id}>
                  <button
                    onClick={() =>
                      mutate((draft) => {
                        const result = fusePets(draft, keep.id, pet.id);
                        toast(result.message ?? "Could not fuse");
                        if (result.ok) onClose();
                      })
                    }
                    className="pressable flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className="h-8 w-8 shrink-0 rounded-full"
                      style={{ backgroundColor: def?.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-berry">
                      {pet.nickname ?? def?.name} · lv {pet.level}
                    </span>
                    <RarityTag
                      rarity={RARITY_META[def?.rarity ?? "common"].label}
                      color={RARITY_META[def?.rarity ?? "common"].color}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
/* Charms                                                              */
/* ------------------------------------------------------------------ */

export function CharmsTab() {
  const { state, derived, mutate, version } = useGame();
  const toast = useToast();
  const [slot, setSlot] = useState<CharmSlot>("jar");
  const [craftRarity, setCraftRarity] = useState<Rarity>("common");
  const format = state.settings.numberFormat;
  const unlocked = hasFlag(state, "charms");

  const charms = useMemo(() => Object.values(state.charms), [state.charms, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const forSlot = charms.filter((c) => c.slot === slot);
  const sets = activeCharmSets(state);

  if (!unlocked) {
    return (
      <EmptyRow>
        Charms unlock with a rebirth upgrade. Once they do, ten slots and rolled stats open up.
      </EmptyRow>
    );
  }

  const slotUnlocked = (id: CharmSlot) => {
    const def = CHARM_SLOTS.find((s) => s.id === id)!;
    const index = CHARM_SLOTS.indexOf(def);
    return state.lifetime.hearts >= def.unlockLifetime || index < 2 + derived.mods.add.charmSlots;
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Equipped" hint={`${Object.values(state.equipped).filter(Boolean).length} of ${CHARM_SLOTS.length} slots`}>
        <div className="grid grid-cols-5 gap-2">
          {CHARM_SLOTS.map((def) => {
            const equippedId = state.equipped[def.id];
            const charm = equippedId ? state.charms[equippedId] : null;
            const open = slotUnlocked(def.id);
            return (
              <button
                key={def.id}
                onClick={() => setSlot(def.id)}
                className={`pressable flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center ${
                  slot === def.id ? "border-plum bg-lavender" : "border-line bg-white"
                } ${open ? "" : "opacity-50"}`}
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 rounded"
                  style={{
                    backgroundColor: charm ? RARITY_META[charm.rarity].color : "var(--color-line)",
                  }}
                />
                <span className="text-[0.55rem] font-bold leading-tight text-berry">
                  {def.name.replace(" Charm", "").replace("Background ", "")}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {sets.length > 0 && (
        <Section title="Set bonuses active">
          <ul className="space-y-1.5">
            {sets.map(({ setId, tier }) => {
              const set = CHARM_SETS.find((s) => s.id === setId)!;
              return (
                <li key={setId} className="rounded-xl border border-line bg-white px-3.5 py-2.5">
                  <p className="text-sm font-semibold text-berry">{set.name}</p>
                  <p className="text-xs text-berry-soft">{set.tiers[tier].label}</p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section
        title={CHARM_SLOTS.find((s) => s.id === slot)?.name ?? "Slot"}
        hint={CHARM_SLOTS.find((s) => s.id === slot)?.description}
      >
        {!slotUnlocked(slot) ? (
          <EmptyRow>
            This slot unlocks at {formatNumber(CHARM_SLOTS.find((s) => s.id === slot)!.unlockLifetime, format)}{" "}
            lifetime hearts, or sooner with ascension upgrades.
          </EmptyRow>
        ) : forSlot.length === 0 ? (
          <EmptyRow>No charms for this slot yet. Craft one below.</EmptyRow>
        ) : (
          <ul className="space-y-2">
            {forSlot.map((charm) => {
              const equipped = state.equipped[slot] === charm.id;
              return (
                <li
                  key={charm.id}
                  className={`rounded-card border bg-white p-3.5 shadow-soft ${
                    equipped ? "border-rose-dark" : "border-line"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <RarityTag
                          rarity={RARITY_META[charm.rarity].label}
                          color={RARITY_META[charm.rarity].color}
                        />
                        <span className="text-xs font-bold text-berry-soft">+{charm.level}</span>
                        {charm.locked && <Lock className="h-3 w-3 text-berry-soft" />}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {charm.affixes.map((affix, index) => (
                          <li key={index} className="text-xs text-berry">
                            {affix.kind === "add"
                              ? `+${formatNumber(affix.value, format)} ${affix.stat}`
                              : `+${(affix.value * 100).toFixed(1)}% ${affix.stat}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      variant={equipped ? "secondary" : "primary"}
                      onClick={() =>
                        mutate((draft) => {
                          const result = equipCharm(draft, slot, equipped ? null : charm.id);
                          if (!result.ok) toast(result.message ?? "Could not equip");
                        })
                      }
                    >
                      {equipped ? "Remove" : "Equip"}
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        mutate((draft) => {
                          const result = enhanceCharm(draft, charm.id);
                          toast(result.message ?? "Could not enhance");
                        })
                      }
                    >
                      Enhance ({enhanceCost(charm.rarity, charm.level)} dust)
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        mutate((draft) => {
                          const result = rerollCharm(draft, charm.id);
                          toast(result.message ?? "Could not reroll");
                        })
                      }
                    >
                      Reroll ({rerollCost(charm.rarity)} dust)
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mutate((draft) => void (draft.charms[charm.id].locked = !charm.locked))}
                    >
                      {charm.locked ? "Unlock" : "Lock"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={charm.locked}
                      onClick={() =>
                        mutate((draft) => {
                          const result = salvageCharm(draft, charm.id);
                          toast(result.message ?? "Could not salvage");
                        })
                      }
                    >
                      Salvage (+{salvageValue(charm.rarity, charm.level)} dust)
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Craft" hint={`${formatNumber(state.wallet.fragments, format)} fragments available`}>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {RARITY_ORDER.filter((r) => r !== "secret").map((rarity) => (
            <button
              key={rarity}
              onClick={() => setCraftRarity(rarity)}
              className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                craftRarity === rarity
                  ? "border-plum bg-plum text-white"
                  : "border-line bg-white text-berry-soft"
              }`}
            >
              {RARITY_META[rarity].label}
            </button>
          ))}
        </div>
        <Button
          className="mt-2"
          disabled={state.wallet.fragments < CRAFT_COST[craftRarity]}
          onClick={() =>
            mutate((draft) => {
              const result = craftCharm(draft, slot, craftRarity);
              toast(result.message ?? "Could not craft");
            })
          }
        >
          Craft a {RARITY_META[craftRarity].label} {CHARM_SLOTS.find((s) => s.id === slot)?.name} for{" "}
          {CRAFT_COST[craftRarity]} fragments
        </Button>
      </Section>
    </div>
  );
}
