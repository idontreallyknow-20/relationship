"use client";

// Shared planning: calendar with events and RSVPs, bucket list, date ideas
// with votes, and a small shared to-do list.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import {
  Button, IconButton, Input, Label, SegmentedControl, Sheet, Textarea, TopBar, useToast,
} from "@/components/ui";
import { HeartSpinner } from "@/components/hearts";
import { useWho } from "@/lib/couple-context";
import { supabase } from "@/lib/supabase";
import { readCache, settled, writeCache } from "@/lib/offline/cache";
import {
  queueDelete, queueInsert, queueKeyedDelete, queueKeyedInsert, queueKeyedUpsert, queueUpdate,
} from "@/lib/offline/ops";
import { notifyPartner } from "@/lib/notify";
import type { CoupleEvent, EventRsvp, ListItem, ListStatus } from "@/lib/types";
import { CalendarTab } from "@/components/plans/calendar";
import { EventComposer } from "@/components/plans/event-composer";
import { ListTab, TodoTab, type ListVote } from "@/components/plans/lists";

type Tab = "calendar" | "bucket" | "ideas" | "todos";

function PlansInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { me } = useWho();

  const [tab, setTab] = useState<Tab>("calendar");
  const [events, setEvents] = useState<CoupleEvent[] | null>(null);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [votes, setVotes] = useState<ListVote[]>([]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CoupleEvent | null>(null);
  const [prefillTitle, setPrefillTitle] = useState<string | null>(null);
  const [linkItem, setLinkItem] = useState<ListItem | null>(null);

  const [bucketSheetOpen, setBucketSheetOpen] = useState(false);
  const [bucketTitle, setBucketTitle] = useState("");
  const [bucketNotes, setBucketNotes] = useState("");
  const [bucketSaving, setBucketSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    const sb = supabase();
    const [evRes, rsvpRes] = await Promise.all([
      settled(sb.from("events").select("*").order("starts_at", { ascending: true })),
      settled(sb.from("event_rsvps").select("*")),
    ]);
    if (evRes.error && rsvpRes.error) {
      const cached = await readCache<{ events: CoupleEvent[]; rsvps: EventRsvp[] }>(EVENTS_KEY);
      if (cached) {
        setEvents(cached.data.events);
        setRsvps(cached.data.rsvps);
      }
      return;
    }
    const nextEvents = (evRes.error ? [] : (evRes.data ?? [])) as CoupleEvent[];
    const nextRsvps = (rsvpRes.error ? [] : (rsvpRes.data ?? [])) as EventRsvp[];
    setEvents(nextEvents);
    setRsvps(nextRsvps);
    void writeCache(EVENTS_KEY, { events: nextEvents, rsvps: nextRsvps });
  }, []);

  const loadItems = useCallback(async () => {
    const sb = supabase();
    const [itemRes, voteRes] = await Promise.all([
      settled(sb.from("list_items").select("*").order("created_at", { ascending: false })),
      settled(sb.from("list_votes").select("*")),
    ]);
    if (itemRes.error && voteRes.error) {
      const cached = await readCache<{ items: ListItem[]; votes: ListVote[] }>(ITEMS_KEY);
      if (cached) {
        setItems(cached.data.items);
        setVotes(cached.data.votes);
      }
      return;
    }
    const nextItems = (itemRes.error ? [] : (itemRes.data ?? [])) as ListItem[];
    const nextVotes = (voteRes.error ? [] : (voteRes.data ?? [])) as ListVote[];
    setItems(nextItems);
    setVotes(nextVotes);
    void writeCache(ITEMS_KEY, { items: nextItems, votes: nextVotes });
  }, []);

  useEffect(() => {
    void loadEvents();
    void loadItems();
  }, [loadEvents, loadItems]);

  // Realtime: events and list items are in the publication. Votes are not,
  // so they are refetched together with list items and after our own taps.
  useEffect(() => {
    const sb = supabase();
    const channel = sb
      .channel("plans-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        void loadEvents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "list_items" }, () => {
        void loadItems();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [loadEvents, loadItems]);

  // ?new=event opens the event composer; ?new=bucket opens the bucket sheet.
  useEffect(() => {
    const wanted = searchParams.get("new");
    if (!wanted) return;
    if (wanted === "event") {
      setEditingEvent(null);
      setComposerOpen(true);
    } else if (wanted === "bucket") {
      setTab("bucket");
      setBucketSheetOpen(true);
    }
    router.replace("/plans");
  }, [searchParams, router]);

  const openNewEvent = () => {
    setEditingEvent(null);
    setPrefillTitle(null);
    setLinkItem(null);
    setComposerOpen(true);
  };

  const handleEventSaved = useCallback(
    async (event: CoupleEvent, isNew: boolean) => {
      if (isNew && linkItem) {
        await queueUpdate(
          "list_items",
          { id: linkItem.id },
          { planned_event_id: event.id, status: "planned" },
          "Link to plan",
        );
        setLinkItem(null);
        setPrefillTitle(null);
        void loadItems();
      }
      void loadEvents();
    },
    [linkItem, loadEvents, loadItems],
  );

  const handleRsvp = useCallback(
    async (eventId: string, status: EventRsvp["status"]) => {
      setRsvps((prev) => {
        const rest = prev.filter((r) => !(r.event_id === eventId && r.person === me));
        return [...rest, { event_id: eventId, person: me, status, created_at: new Date().toISOString() }];
      });
      await queueKeyedUpsert(
        "event_rsvps",
        { event_id: eventId, person: me, status },
        "event_id,person",
        `${eventId}:${me}`,
        "Reply",
      );
    },
    [me],
  );

  const addItem = useCallback(
    async (category: ListItem["category"], title: string, notes?: string) => {
      const item = {
        id: crypto.randomUUID(),
        category,
        title,
        notes: notes?.trim() || null,
        status: "idea" as ListStatus,
        created_by: me,
        created_at: new Date().toISOString(),
        completed_at: null,
        planned_event_id: null,
      } as ListItem;
      await queueInsert("list_items", { ...item }, "List item");
      setItems((prev) => [item, ...(prev ?? [])]);
      if (category !== "todo") {
        void notifyPartner("plans", item.id, {
          body: category === "bucket" ? `Bucket list: ${item.title}` : `Date idea: ${item.title}`,
          url: "/plans",
        });
      }
      toast("Added");
    },
    [me, toast],
  );

  const setItemStatus = useCallback(
    async (item: ListItem, status: ListStatus) => {
      const completed_at = status === "completed" ? new Date().toISOString() : null;
      setItems((prev) =>
        (prev ?? []).map((i) => (i.id === item.id ? { ...i, status, completed_at } : i)),
      );
      await queueUpdate("list_items", { id: item.id }, { status, completed_at }, "List item status");
      if (status === "completed") {
        // Celebrate and drop it into the shared timeline.
        toast(`Completed: ${item.title}`);
        await queueInsert("memories", {
          id: crypto.randomUUID(),
          kind: "plan",
          title: item.title,
          happened_on: format(new Date(), "yyyy-MM-dd"),
          created_by: me,
        }, "Plan memory");
        void notifyPartner("plans", `${item.id}-completed`, {
          body: `Completed: ${item.title}`,
          url: "/plans",
        });
      }
    },
    [me, toast],
  );

  const saveNotes = useCallback(
    async (item: ListItem, notes: string) => {
      const value = notes.trim() || null;
      setItems((prev) => (prev ?? []).map((i) => (i.id === item.id ? { ...i, notes: value } : i)));
      await queueUpdate("list_items", { id: item.id }, { notes: value }, "Notes");
      toast("Notes saved");
    },
    [toast],
  );

  const toggleVote = useCallback(
    async (item: ListItem) => {
      const mine = votes.some((v) => v.item_id === item.id && v.person === me);
      setVotes((prev) =>
        mine
          ? prev.filter((v) => !(v.item_id === item.id && v.person === me))
          : [...prev, { item_id: item.id, person: me }],
      );
      const key = `${item.id}:${me}`;
      if (mine) {
        await queueKeyedDelete("list_votes", { item_id: item.id, person: me }, key, "Remove vote");
      } else {
        await queueKeyedInsert("list_votes", { item_id: item.id, person: me }, key, "Vote");
      }
    },
    [votes, me],
  );

  const deleteItem = useCallback(
    async (item: ListItem) => {
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
      await queueDelete("list_items", { id: item.id }, "Delete item");
      toast("Deleted", () => {
        setItems((prev) => [item, ...(prev ?? [])]);
        void queueInsert("list_items", {
          id: item.id,
          category: item.category,
          title: item.title,
          notes: item.notes,
          status: item.status,
          planned_event_id: item.planned_event_id,
          completed_at: item.completed_at,
          created_by: item.created_by,
          created_at: item.created_at,
        }, "Restore item");
      });
    },
    [toast],
  );

  const planIt = useCallback((item: ListItem) => {
    setEditingEvent(null);
    setPrefillTitle(item.title);
    setLinkItem(item);
    setComposerOpen(true);
  }, []);

  const toggleTodo = useCallback(
    (item: ListItem) => {
      const next: ListStatus = item.status === "completed" ? "idea" : "completed";
      const completed_at = next === "completed" ? new Date().toISOString() : null;
      setItems((prev) =>
        (prev ?? []).map((i) => (i.id === item.id ? { ...i, status: next, completed_at } : i)),
      );
      void queueUpdate("list_items", { id: item.id }, { status: next, completed_at }, "To-do");
    },
    [],
  );

  const saveBucketSheet = async () => {
    if (!bucketTitle.trim()) {
      toast("Give it a title.");
      return;
    }
    setBucketSaving(true);
    try {
      await addItem("bucket", bucketTitle.trim(), bucketNotes);
      setBucketTitle("");
      setBucketNotes("");
      setBucketSheetOpen(false);
    } finally {
      setBucketSaving(false);
    }
  };

  const loading = events === null || items === null;
  const bucketItems = (items ?? []).filter((i) => i.category === "bucket");
  const ideaItems = (items ?? []).filter((i) => i.category === "date_idea");
  const todoItems = (items ?? []).filter((i) => i.category === "todo");

  return (
    <>
      <TopBar
        title="Plans"
        action={
          <IconButton
            label={tab === "bucket" ? "Add bucket list item" : "Add event"}
            className="bg-rose-dark text-white hover:bg-rose-deep"
            onClick={() => {
              if (tab === "bucket") setBucketSheetOpen(true);
              else openNewEvent();
            }}
          >
            <Plus className="h-5 w-5" />
          </IconButton>
        }
      />

      <div className="space-y-4 px-4 pt-3">
        <SegmentedControl<Tab>
          label="Plans sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "calendar", label: "Calendar" },
            { value: "bucket", label: "Bucket list" },
            { value: "ideas", label: "Date ideas" },
            { value: "todos", label: "To-dos" },
          ]}
        />

        {loading ? (
          <HeartSpinner label="Loading plans" />
        ) : tab === "calendar" ? (
          <CalendarTab
            events={events ?? []}
            rsvps={rsvps}
            me={me}
            onEdit={(event) => {
              setEditingEvent(event);
              setPrefillTitle(null);
              setLinkItem(null);
              setComposerOpen(true);
            }}
            onRsvp={(id, status) => void handleRsvp(id, status)}
            onAdd={openNewEvent}
          />
        ) : tab === "bucket" ? (
          <ListTab
            category="bucket"
            items={bucketItems}
            votes={votes}
            me={me}
            onAdd={(title) => addItem("bucket", title)}
            onSetStatus={(item, status) => void setItemStatus(item, status)}
            onSaveNotes={saveNotes}
            onToggleVote={(item) => void toggleVote(item)}
            onDelete={(item) => void deleteItem(item)}
            onPlanIt={planIt}
          />
        ) : tab === "ideas" ? (
          <ListTab
            category="date_idea"
            items={ideaItems}
            votes={votes}
            me={me}
            onAdd={(title) => addItem("date_idea", title)}
            onSetStatus={(item, status) => void setItemStatus(item, status)}
            onSaveNotes={saveNotes}
            onToggleVote={(item) => void toggleVote(item)}
            onDelete={(item) => void deleteItem(item)}
            onPlanIt={planIt}
          />
        ) : (
          <TodoTab
            items={todoItems}
            onAdd={(title) => addItem("todo", title)}
            onToggle={toggleTodo}
            onDelete={(item) => void deleteItem(item)}
          />
        )}
      </div>

      <EventComposer
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          setLinkItem(null);
          setPrefillTitle(null);
        }}
        me={me}
        editing={editingEvent}
        prefillTitle={prefillTitle}
        onSaved={(event, isNew) => void handleEventSaved(event, isNew)}
        onDeleted={() => void loadEvents()}
      />

      <Sheet open={bucketSheetOpen} onClose={() => setBucketSheetOpen(false)} title="New bucket list item">
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="bucket-title">Title</Label>
            <Input
              id="bucket-title"
              value={bucketTitle}
              onChange={(e) => setBucketTitle(e.target.value)}
              placeholder="Add an idea"
              maxLength={160}
            />
          </div>
          <div>
            <Label htmlFor="bucket-notes">Notes</Label>
            <Textarea
              id="bucket-notes"
              value={bucketNotes}
              onChange={(e) => setBucketNotes(e.target.value)}
              placeholder="Optional details"
              maxLength={2000}
            />
          </div>
          <Button className="w-full" loading={bucketSaving} onClick={() => void saveBucketSheet()}>
            Add to bucket list
          </Button>
        </div>
      </Sheet>
    </>
  );
}

const EVENTS_KEY = "plans:events";
const ITEMS_KEY = "plans:items";

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Plans" />
          <HeartSpinner />
        </>
      }
    >
      <PlansInner />
    </Suspense>
  );
}
