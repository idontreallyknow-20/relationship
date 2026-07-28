"use client";

// Shared timeline of memories: photos, videos, notes, milestones, and dates,
// grouped by month with search, filters, favorites, and a monthly recap.

import {
  Suspense, useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { EllipsisVertical, Plus, Search, Sparkles } from "lucide-react";
import { Button, EmptyState, IconButton, Input, Select, TopBar, useToast } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { useCouple, useWho } from "@/lib/couple-context";
import { supabase } from "@/lib/supabase";
import { readCache, settled, writeCache } from "@/lib/offline/cache";
import {
  queueDelete, queueInsert, queueKeyedDelete, queueKeyedInsert, queueUpdate,
} from "@/lib/offline/ops";
import { notifyPartner } from "@/lib/notify";
import type { Memory, MemoryKind, Person } from "@/lib/types";
import { MemoryCard, memoryDate } from "@/components/memories/card";
import { MemoryComposer } from "@/components/memories/composer";
import { MemoryViewer } from "@/components/memories/viewer";
import { MilestoneStrip } from "@/components/memories/milestone-strip";

const KIND_FILTERS: { label: string; kinds: MemoryKind[] | null }[] = [
  { label: "All", kinds: null },
  { label: "Photos", kinds: ["photo"] },
  { label: "Videos", kinds: ["video"] },
  { label: "Drawings", kinds: ["drawing"] },
  { label: "Letters", kinds: ["letter"] },
  { label: "Notes", kinds: ["note"] },
  { label: "Milestones", kinds: ["milestone"] },
  { label: "Dates", kinds: ["date", "plan"] },
];

type FavoriteMap = Record<string, Person[]>;

function MemoriesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { me } = useWho();
  const { couple } = useCouple();

  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [favorites, setFavorites] = useState<FavoriteMap>({});
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState(0);
  const [yearFilter, setYearFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsBump, setCommentsBump] = useState(0);
  const creatingRecap = useRef(false);

  const loadAll = useCallback(async () => {
    const sb = supabase();
    const [memRes, favRes] = await Promise.all([
      settled(sb
        .from("memories")
        .select("*")
        .order("happened_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500)),
      settled(sb.from("memory_favorites").select("*")),
    ]);
    if (memRes.error && favRes.error) {
      const cached = await readCache<{ memories: Memory[]; favorites: FavoriteMap }>(CACHE_KEY);
      if (cached) {
        setMemories(cached.data.memories);
        setFavorites(cached.data.favorites);
      }
      return;
    }
    const nextMemories = (memRes.error ? [] : (memRes.data ?? [])) as Memory[];
    const map: FavoriteMap = {};
    if (!favRes.error && favRes.data) {
      for (const row of favRes.data as { memory_id: string; person: Person }[]) {
        (map[row.memory_id] ??= []).push(row.person);
      }
    }
    setMemories(nextMemories);
    setFavorites(map);
    // Only the newest slice is worth keeping: the whole library can be large,
    // and what you open the screen on is the top of it.
    void writeCache(CACHE_KEY, { memories: nextMemories.slice(0, 200), favorites: map });
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Realtime: refresh the timeline on memory changes, bump comments on
  // comment changes so an open viewer refetches.
  useEffect(() => {
    const sb = supabase();
    const channel = sb
      .channel("memories-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "memories" }, () => {
        void loadAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "memory_comments" }, () => {
        setCommentsBump((b) => b + 1);
      })
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [loadAll]);

  // ?new=1 opens the composer.
  useEffect(() => {
    if (searchParams.get("new")) {
      setComposerOpen(true);
      router.replace("/memories");
    }
  }, [searchParams, router]);

  // Server-side search alongside the client filter, so older rows beyond the
  // initial page can still be found.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      const safe = q.replace(/[%_,()]/g, " ").trim();
      if (!safe) return;
      const { data } = await supabase()
        .from("memories")
        .select("*")
        .or(`title.ilike.%${safe}%,caption.ilike.%${safe}%,location.ilike.%${safe}%`)
        .limit(100);
      if (data) {
        setMemories((prev) => {
          if (!prev) return data as Memory[];
          const seen = new Set(prev.map((m) => m.id));
          const extra = (data as Memory[]).filter((m) => !seen.has(m.id));
          return extra.length ? [...prev, ...extra] : prev;
        });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const m of memories ?? []) set.add(String(new Date(memoryDate(m)).getFullYear()));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [memories]);

  const filtered = useMemo(() => {
    if (!memories) return [];
    const kinds = KIND_FILTERS[kindFilter]?.kinds ?? null;
    const q = search.trim().toLowerCase();
    return memories
      .filter((m) => {
        if (kinds && !kinds.includes(m.kind)) return false;
        if (yearFilter !== "all" && String(new Date(memoryDate(m)).getFullYear()) !== yearFilter) return false;
        if (q) {
          const hay = `${m.title ?? ""} ${m.caption ?? ""} ${m.location ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(memoryDate(b)).getTime() - new Date(memoryDate(a)).getTime());
  }, [memories, kindFilter, yearFilter, search]);

  const groups = useMemo(() => {
    const out: { label: string; items: Memory[] }[] = [];
    for (const m of filtered) {
      const label = format(new Date(memoryDate(m)), "MMMM yyyy");
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [filtered]);

  const toggleFavorite = useCallback(
    async (memoryId: string) => {
      const mine = favorites[memoryId]?.includes(me) ?? false;
      setFavorites((prev) => {
        const next = { ...prev };
        const list = next[memoryId] ?? [];
        next[memoryId] = mine ? list.filter((p) => p !== me) : [...list, me];
        return next;
      });
      const key = `${memoryId}:${me}`;
      if (mine) {
        await queueKeyedDelete("memory_favorites", { memory_id: memoryId, person: me }, key, "Unfavourite");
      } else {
        await queueKeyedInsert("memory_favorites", { memory_id: memoryId, person: me }, key, "Favourite");
      }
    },
    [favorites, me],
  );

  const saveEdit = useCallback(
    async (
      id: string,
      fields: { title: string | null; caption: string | null; happened_on: string | null; location: string | null },
    ) => {
      const edited_at = new Date().toISOString();
      setMemories((prev) =>
        (prev ?? []).map((m) => (m.id === id ? { ...m, ...fields, edited_at } : m)),
      );
      await queueUpdate("memories", { id }, { ...fields, edited_at }, "Memory edit");
      toast("Memory updated");
    },
    [toast],
  );

  const deleteMemory = useCallback(
    async (m: Memory) => {
      setViewerId(null);
      setMemories((prev) => (prev ?? []).filter((x) => x.id !== m.id));
      await queueDelete("memories", { id: m.id }, "Delete memory");
      toast("Memory deleted", () => {
        setMemories((prev) => [m, ...(prev ?? [])]);
        // The media file is untouched by the delete, so putting the row back
        // restores the memory whole.
        void queueInsert("memories", {
          id: m.id,
          kind: m.kind,
          title: m.title,
          caption: m.caption,
          media_path: m.media_path,
          media_meta: m.media_meta,
          drawing_id: m.drawing_id,
          letter_id: m.letter_id,
          happened_on: m.happened_on,
          location: m.location,
          created_by: m.created_by,
          created_at: m.created_at,
          edited_at: m.edited_at,
        }, "Restore memory");
      });
    },
    [toast],
  );

  const createRecap = useCallback(async () => {
    if (creatingRecap.current) return;
    setMenuOpen(false);
    const now = new Date();
    const monthLabel = format(now, "MMMM");
    const recapTitle = `Our ${monthLabel} recap`;
    const monthKey = format(now, "yyyy-MM");
    const monthItems = (memories ?? []).filter(
      (m) => format(new Date(memoryDate(m)), "yyyy-MM") === monthKey && m.title !== recapTitle,
    );
    if (monthItems.length === 0) {
      toast("No memories yet this month.");
      return;
    }
    creatingRecap.current = true;
    try {
      const counts = new Map<MemoryKind, number>();
      for (const m of monthItems) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const countWords: Partial<Record<MemoryKind, string>> = {
        photo: "photo", video: "video", note: "note", milestone: "milestone",
        date: "date", drawing: "drawing", letter: "letter", plan: "plan",
        mood_highlight: "highlight",
      };
      const lines: string[] = [];
      const countLine = Array.from(counts.entries())
        .map(([kind, n]) => plural(n, countWords[kind] ?? "memory"))
        .join(", ");
      lines.push(`This month held ${countLine}.`);
      const loved = monthItems.filter((m) => (favorites[m.id]?.length ?? 0) > 0 && m.title);
      if (loved.length > 0) {
        lines.push("Favorite moments:");
        for (const m of loved) lines.push(`- ${m.title}`);
      }
      const captioned = monthItems.filter((m) => m.caption);
      if (captioned.length > 0) {
        lines.push("In your own words:");
        for (const m of captioned.slice(0, 12)) {
          lines.push(`- ${(m.caption ?? "").split("\n")[0].slice(0, 120)}`);
        }
      }
      const { data, error } = await supabase()
        .from("memories")
        .insert({
          kind: "note",
          title: recapTitle,
          caption: lines.join("\n"),
          happened_on: format(now, "yyyy-MM-dd"),
          created_by: me,
        })
        .select()
        .single();
      if (error || !data) {
        toast("Could not create the recap.");
        return;
      }
      void notifyPartner("plans", (data as Memory).id, {
        body: "A new memory was added",
        url: "/memories",
      });
      toast(`${recapTitle} added to your timeline`);
      void loadAll();
    } finally {
      creatingRecap.current = false;
    }
  }, [memories, favorites, me, toast, loadAll]);

  const viewerMemory = viewerId ? (memories ?? []).find((m) => m.id === viewerId) ?? null : null;

  return (
    <>
      <TopBar
        title="Memories"
        action={
          <div className="relative flex items-center">
            <IconButton label="More options" onClick={() => setMenuOpen((v) => !v)}>
              <EllipsisVertical className="h-5 w-5" />
            </IconButton>
            <IconButton
              label="Add memory"
              className="bg-rose-dark text-white hover:bg-rose-deep"
              onClick={() => setComposerOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </IconButton>
            {menuOpen && (
              <>
                <button
                  aria-label="Close menu"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-12 z-40 w-60 rounded-card border border-line bg-white p-2 shadow-lift">
                  <button
                    className="pressable flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-berry hover:bg-blush/60"
                    onClick={() => void createRecap()}
                  >
                    <Sparkles className="h-4 w-4 text-rose-deep" />
                    Create monthly recap
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />

      <div className="space-y-3 px-4 pt-3">
        {couple.start_date && <MilestoneStrip startDate={couple.start_date} />}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-berry-soft" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories"
              aria-label="Search memories"
              className="pl-10"
            />
          </div>
          <Select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            aria-label="Filter by year"
            className="w-28"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {KIND_FILTERS.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setKindFilter(i)}
              aria-pressed={kindFilter === i}
              className={`pressable min-h-9 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold ${
                kindFilter === i
                  ? "border-plum bg-plum text-white"
                  : "border-line bg-white text-berry-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {memories === null ? (
          <HeartSpinner label="Loading memories" />
        ) : groups.length === 0 ? (
          <EmptyState
            title={search || kindFilter !== 0 || yearFilter !== "all" ? "Nothing matches" : "No memories yet"}
            hint={
              search || kindFilter !== 0 || yearFilter !== "all"
                ? "Try a different search or filter."
                : "Add your first photo, note, or milestone and start your shared timeline."
            }
            action={
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                <Plus className="h-4 w-4" />
                Add a memory
              </Button>
            }
          />
        ) : (
          <div className="space-y-6 pb-6">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-semibold text-plum">
                  <HeartIcon className="h-3.5 w-3.5 text-blush-deep" />
                  {group.label}
                </h2>
                <div className="space-y-3">
                  {group.items.map((m) => (
                    <MemoryCard
                      key={m.id}
                      memory={m}
                      favoritedBy={favorites[m.id] ?? []}
                      me={me}
                      onOpen={() => setViewerId(m.id)}
                      onToggleFavorite={() => void toggleFavorite(m.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <MemoryComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        me={me}
        onSaved={() => void loadAll()}
      />

      {viewerMemory && (
        <MemoryViewer
          memory={viewerMemory}
          me={me}
          favoritedBy={favorites[viewerMemory.id] ?? []}
          commentsBump={commentsBump}
          onClose={() => setViewerId(null)}
          onToggleFavorite={() => void toggleFavorite(viewerMemory.id)}
          onSaveEdit={saveEdit}
          onDelete={() => void deleteMemory(viewerMemory)}
        />
      )}
    </>
  );
}

const CACHE_KEY = "memories:page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Memories" />
          <HeartSpinner />
        </>
      }
    >
      <MemoriesInner />
    </Suspense>
  );
}
