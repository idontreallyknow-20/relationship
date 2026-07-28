"use client";

// Shared drawing editor: local drawing with undo and redo, debounced
// persistence, local draft mirroring, and live drawing together over a
// realtime broadcast channel with presence.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { BookHeart, Eraser, Redo2, Send, Trash2, Undo2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useCouple, useWho } from "@/lib/couple-context";
import { displayName, type Drawing, type Stroke } from "@/lib/types";
import { notifyPartner } from "@/lib/notify";
import { uploadMedia } from "@/lib/media";
import { saveDraft, loadDraft, clearDraft } from "@/lib/drafts";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Label,
  SegmentedControl,
  Sheet,
  TopBar,
  useToast,
} from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";

import { DrawCanvas } from "./canvas";
import { StrokeThumb } from "./thumb";
import { type DrawBackground, PALETTE, PEN_SIZES, renderPngBlob } from "./render";
import { noteRewardable } from "@/game/rewards-inbox";

export interface DrawDraft {
  strokes: Stroke[];
  background: DrawBackground;
  updatedAt: number;
}

const SAVE_DEBOUNCE_MS = 600;
const HISTORY_LIMIT = 60;
const LAST_DRAFT_KEY = "draw:last";

const draftKey = (id: string) => `draw:${id}`;

export function DrawEditor({
  id,
  isNew,
  onExit,
}: {
  id: string;
  isNew: boolean;
  onExit: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { partner } = useCouple();
  const { me, partner: partnerPerson } = useWho();
  const partnerName = partner?.display_name ?? displayName(partnerPerson);

  // isNew only matters on mount; after the row is created the URL gains
  // ?id= and the prop may flip without the editor remounting.
  const [startedFresh] = useState(isNew);

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(false);

  // Stroke state, mirrored into a ref for use inside callbacks.
  const [strokes, setStrokesState] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const setStrokes = useCallback((next: Stroke[]) => {
    strokesRef.current = next;
    setStrokesState(next);
  }, []);

  const [background, setBackgroundState] = useState<DrawBackground>("plain");
  const backgroundRef = useRef<DrawBackground>("plain");
  const setBackground = useCallback((next: DrawBackground) => {
    backgroundRef.current = next;
    setBackgroundState(next);
  }, []);

  // Undo and redo as full-list snapshots, held in refs so remote strokes
  // can be folded in without racing renders; counts drive the buttons.
  const undoRef = useRef<Stroke[][]>([]);
  const redoRef = useRef<Stroke[][]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistoryCounts = useCallback(() => {
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, []);

  // Tools.
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [erase, setErase] = useState(false);

  // Row and channel lifecycle.
  const [rowExists, setRowExists] = useState(!isNew);
  const rowExistsRef = useRef(!isNew);
  const creatingRef = useRef(false);
  const isSharedRef = useRef(false);
  const lastPushedRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [partnerHere, setPartnerHere] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sheet, setSheet] = useState<"chat" | "memory" | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  /* ------------------------- persistence ------------------------- */

  const mirrorDraft = useCallback(() => {
    saveDraft(draftKey(id), {
      strokes: strokesRef.current,
      background: backgroundRef.current,
      updatedAt: Date.now(),
    } satisfies DrawDraft);
    if (!isSharedRef.current) saveDraft(LAST_DRAFT_KEY, { id });
  }, [id]);

  const pushToDb = useCallback(async () => {
    if (!rowExistsRef.current) return;
    const payload = {
      strokes: strokesRef.current,
      background: backgroundRef.current,
      updated_at: new Date().toISOString(),
    };
    lastPushedRef.current = JSON.stringify(payload.strokes);
    await supabase().from("drawings").update(payload).eq("id", id);
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void pushToDb();
    }, SAVE_DEBOUNCE_MS);
  }, [pushToDb]);

  // Insert the row on the first stroke so recovery works from the start.
  const ensureRow = useCallback(async () => {
    if (rowExistsRef.current || creatingRef.current) return;
    creatingRef.current = true;
    const { error } = await supabase().from("drawings").insert({
      id,
      strokes: strokesRef.current,
      background: backgroundRef.current,
      created_by: me,
      is_shared: false,
    });
    if (error) {
      // Offline or transient failure; the draft still protects the work
      // and the next local change retries.
      creatingRef.current = false;
      return;
    }
    rowExistsRef.current = true;
    setRowExists(true);
    // Reflect the drawing in the URL so a reload reopens it.
    window.history.replaceState(null, "", `/draw?id=${id}`);
  }, [id, me]);

  const afterLocalChange = useCallback(() => {
    mirrorDraft();
    if (rowExistsRef.current) scheduleSave();
    else void ensureRow().then(() => scheduleSave());
  }, [mirrorDraft, scheduleSave, ensureRow]);

  /* ----------------------------- load ----------------------------- */

  useEffect(() => {
    if (startedFresh) return;
    let alive = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      const { data, error } = await supabase()
        .from("drawings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!alive) return;
      const draft = loadDraft<DrawDraft>(draftKey(id));
      if (error) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      if (!data) {
        if (draft) {
          // The row never made it to the server; recover from the draft.
          setStrokes(draft.strokes);
          setBackground(draft.background);
          rowExistsRef.current = false;
          setRowExists(false);
          setLoading(false);
          void ensureRow();
          return;
        }
        setLoadError(true);
        setLoading(false);
        return;
      }
      const row = data as Drawing;
      isSharedRef.current = row.is_shared;
      if (row.is_shared) clearLastPointer(id);
      const rowTime = Date.parse(row.updated_at);
      // Only trust the local draft over the server for unsent drawings;
      // shared canvases may hold newer strokes from the partner.
      if (!row.is_shared && draft && draft.updatedAt > rowTime && draft.strokes.length > 0) {
        // Local work is newer than the server copy; restore and push it.
        setStrokes(draft.strokes);
        setBackground(draft.background);
        setLoading(false);
        scheduleSave();
        return;
      }
      setStrokes(row.strokes ?? []);
      setBackground(row.background);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id, startedFresh, setStrokes, setBackground, ensureRow, scheduleSave]);

  // Flush pending saves when leaving the page or hiding the app.
  useEffect(() => {
    const flushIfPending = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void pushToDb();
      }
    };
    window.addEventListener("pagehide", flushIfPending);
    document.addEventListener("visibilitychange", flushIfPending);
    return () => {
      window.removeEventListener("pagehide", flushIfPending);
      document.removeEventListener("visibilitychange", flushIfPending);
      flushIfPending();
    };
  }, [pushToDb]);

  /* --------------------------- realtime --------------------------- */

  useEffect(() => {
    if (!rowExists) return;
    const sb = supabase();
    const channel = sb
      .channel(`draw-live-${id}`, { config: { presence: { key: me } } })
      .on("broadcast", { event: "stroke" }, (msg) => {
        const p = msg.payload as { from: string; stroke: Stroke } | undefined;
        if (!p || p.from === me) return;
        applyRemoteStroke(p.stroke);
      })
      .on("broadcast", { event: "sync" }, (msg) => {
        const p = msg.payload as
          | { from: string; strokes: Stroke[]; background: DrawBackground }
          | undefined;
        if (!p || p.from === me) return;
        applyRemoteSync(p.strokes, p.background);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPartnerHere(Object.keys(state).some((key) => key !== me));
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drawings", filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as Drawing;
          const remote = row.strokes ?? [];
          const remoteJson = JSON.stringify(remote);
          // Skip our own writes and no-ops.
          if (remoteJson === lastPushedRef.current) return;
          if (remoteJson === JSON.stringify(strokesRef.current)) return;
          // Fallback merge if a broadcast was missed: append remote
          // strokes we do not have yet, preserving their order.
          const localSet = new Set(strokesRef.current.map((s) => JSON.stringify(s)));
          const missing = remote.filter((s) => !localSet.has(JSON.stringify(s)));
          if (missing.length === 0) return;
          setStrokes([...strokesRef.current, ...missing]);
          mirrorDraft();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ person: me });
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setPartnerHere(false);
      void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowExists, id, me]);

  const broadcast = useCallback((event: "stroke" | "sync", payload: object) => {
    void channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  const applyRemoteStroke = useCallback(
    (stroke: Stroke) => {
      setStrokes([...strokesRef.current, stroke]);
      // Keep the partner's stroke alive across our own undo history.
      undoRef.current = undoRef.current.map((snap) => [...snap, stroke]);
      redoRef.current = redoRef.current.map((snap) => [...snap, stroke]);
      mirrorDraft();
    },
    [setStrokes, mirrorDraft],
  );

  const applyRemoteSync = useCallback(
    (remoteStrokes: Stroke[], remoteBackground: DrawBackground) => {
      setStrokes(remoteStrokes);
      if (remoteBackground) setBackground(remoteBackground);
      // The partner rewrote history (undo, redo, clear); ours is stale.
      undoRef.current = [];
      redoRef.current = [];
      syncHistoryCounts();
      mirrorDraft();
    },
    [setStrokes, setBackground, syncHistoryCounts, mirrorDraft],
  );

  /* ---------------------------- actions --------------------------- */

  const pushHistory = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), strokesRef.current];
    redoRef.current = [];
    syncHistoryCounts();
  }, [syncHistoryCounts]);

  const handleStroke = useCallback(
    (stroke: Stroke) => {
      pushHistory();
      setStrokes([...strokesRef.current, stroke]);
      broadcast("stroke", { from: me, stroke });
      afterLocalChange();
    },
    [pushHistory, setStrokes, broadcast, me, afterLocalChange],
  );

  const syncAll = useCallback(() => {
    broadcast("sync", {
      from: me,
      strokes: strokesRef.current,
      background: backgroundRef.current,
    });
    afterLocalChange();
  }, [broadcast, me, afterLocalChange]);

  const undo = useCallback(() => {
    const snapshot = undoRef.current.pop();
    if (!snapshot) return;
    redoRef.current = [...redoRef.current, strokesRef.current];
    setStrokes(snapshot);
    syncHistoryCounts();
    syncAll();
  }, [setStrokes, syncHistoryCounts, syncAll]);

  const redo = useCallback(() => {
    const snapshot = redoRef.current.pop();
    if (!snapshot) return;
    undoRef.current = [...undoRef.current, strokesRef.current];
    setStrokes(snapshot);
    syncHistoryCounts();
    syncAll();
  }, [setStrokes, syncHistoryCounts, syncAll]);

  const clearAll = useCallback(() => {
    setConfirmClear(false);
    if (strokesRef.current.length === 0) return;
    pushHistory();
    setStrokes([]);
    syncAll();
    toast("Canvas cleared");
  }, [pushHistory, setStrokes, syncAll, toast]);

  const changeBackground = useCallback(
    (next: DrawBackground) => {
      setBackground(next);
      if (strokesRef.current.length > 0 || rowExistsRef.current) {
        broadcast("sync", {
          from: me,
          strokes: strokesRef.current,
          background: next,
        });
        mirrorDraft();
        if (rowExistsRef.current) scheduleSave();
      }
    },
    [setBackground, broadcast, me, mirrorDraft, scheduleSave],
  );

  /* --------------------------- finishing -------------------------- */

  const finish = useCallback(
    async (mode: "chat" | "memory") => {
      setBusy(true);
      try {
        const sb = supabase();
        // Make sure the row exists and holds the final strokes.
        if (!rowExistsRef.current) await ensureRow();
        if (!rowExistsRef.current) throw new Error("no_row");
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        await pushToDb();

        const blob = await renderPngBlob(strokesRef.current, backgroundRef.current);
        const path = await uploadMedia("drawings", me, blob);
        const trimmed = caption.trim();
        const { error: updErr } = await sb
          .from("drawings")
          .update({
            preview_path: path,
            is_shared: true,
            caption: trimmed || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updErr) throw updErr;
        isSharedRef.current = true;
        clearDraft(draftKey(id));
        clearLastPointer(id);
        void noteRewardable("drawing_shared", new Date().toISOString().slice(0, 10), `drawing:${id}`);

        if (mode === "chat") {
          const { error: msgErr } = await sb.from("messages").insert({
            client_id: crypto.randomUUID(),
            sender: me,
            kind: "drawing",
            drawing_id: id,
            body: trimmed || null,
          });
          if (msgErr) throw msgErr;
          void notifyPartner("drawings", id, {
            title: "A drawing for you",
            body: trimmed || "Sent you a drawing",
            url: "/chat",
          });
          toast("Sent in chat");
          router.push("/chat");
        } else {
          const { error: memErr } = await sb.from("memories").insert({
            kind: "drawing",
            drawing_id: id,
            media_path: path,
            caption: trimmed || null,
            created_by: me,
          });
          if (memErr) throw memErr;
          void notifyPartner("drawings", "mem-" + id, {
            title: "A new drawing memory",
            body: trimmed || "Saved a drawing to your memories",
            url: "/memories",
          });
          toast("Saved to memories");
          router.push("/memories");
        }
      } catch {
        toast("Could not save the drawing. Try again.");
        setBusy(false);
      }
    },
    [caption, ensureRow, pushToDb, me, id, toast, router],
  );

  /* ----------------------------- render --------------------------- */

  if (loading) {
    return (
      <>
        <TopBar title="Draw" back={onExit} />
        <HeartSpinner label="Loading drawing" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <TopBar title="Draw" back={onExit} />
        <div className="px-4 pt-8">
          <EmptyState
            title="Could not open this drawing"
            hint="It may have been removed, or the connection dropped."
            action={
              <Button variant="secondary" onClick={onExit}>
                Back to drawings
              </Button>
            }
          />
        </div>
      </>
    );
  }

  const hasStrokes = strokes.length > 0;

  return (
    <>
      <TopBar title="Draw" back={onExit} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
        <SegmentedControl<DrawBackground>
          label="Background"
          value={background}
          onChange={changeBackground}
          options={[
            { value: "plain", label: "Plain" },
            { value: "lined", label: "Lined" },
            { value: "grid", label: "Grid" },
          ]}
        />

        {partnerHere && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-rose-deep" aria-live="polite">
            <HeartIcon className="heart-pulse h-3.5 w-3.5" />
            {partnerName} is drawing with you
          </p>
        )}

        <DrawCanvas
          strokes={strokes}
          background={background}
          tool={{
            color: PALETTE[colorIdx].color,
            size: PEN_SIZES[sizeIdx].size,
            erase,
          }}
          onStroke={handleStroke}
          disabled={busy}
        />

        <Toolbar
          colorIdx={colorIdx}
          onColor={(i) => {
            setColorIdx(i);
            setErase(false);
          }}
          sizeIdx={sizeIdx}
          onSize={setSizeIdx}
          erase={erase}
          onErase={() => setErase((e) => !e)}
          canUndo={history.undo > 0}
          canRedo={history.redo > 0}
          canClear={hasStrokes}
          onUndo={undo}
          onRedo={redo}
          onClear={() => setConfirmClear(true)}
        />

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={!hasStrokes || busy}
            onClick={() => {
              setCaption("");
              setSheet("chat");
            }}
          >
            <Send className="h-4 w-4" />
            Send in chat
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!hasStrokes || busy}
            onClick={() => {
              setCaption("");
              setSheet("memory");
            }}
          >
            <BookHeart className="h-4 w-4" />
            Save as memory
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear the canvas?"
        message="Every stroke will be removed for both of you. You can undo right after if you change your mind."
        confirmLabel="Clear"
        destructive
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />

      <Sheet
        open={sheet !== null}
        onClose={() => {
          if (!busy) setSheet(null);
        }}
        title={sheet === "memory" ? "Save as memory" : "Send in chat"}
      >
        <div className="space-y-4 pt-2">
          <div className="mx-auto w-40 overflow-hidden rounded-card border border-line shadow-soft">
            <StrokeThumb strokes={strokes} background={background} />
          </div>
          <div>
            <Label htmlFor="draw-caption">Caption (optional)</Label>
            <Input
              id="draw-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder="Add a little note"
              disabled={busy}
            />
          </div>
          <Button
            className="w-full"
            size="lg"
            loading={busy}
            onClick={() => sheet && void finish(sheet)}
          >
            {sheet === "memory" ? "Save to memories" : "Send it"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** Drop the landing-page resume pointer if it references this drawing. */
function clearLastPointer(id: string): void {
  const last = loadDraft<{ id: string }>(LAST_DRAFT_KEY);
  if (last?.id === id) clearDraft(LAST_DRAFT_KEY);
}

/* ------------------------------ toolbar ----------------------------- */

function Toolbar({
  colorIdx,
  onColor,
  sizeIdx,
  onSize,
  erase,
  onErase,
  canUndo,
  canRedo,
  canClear,
  onUndo,
  onRedo,
  onClear,
}: {
  colorIdx: number;
  onColor: (i: number) => void;
  sizeIdx: number;
  onSize: (i: number) => void;
  erase: boolean;
  onErase: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}) {
  const dotSizes = ["h-1.5 w-1.5", "h-2.5 w-2.5", "h-4 w-4"];
  return (
    <div className="rounded-card border border-line bg-white px-2 py-2 shadow-soft">
      <div className="flex items-start justify-between" role="radiogroup" aria-label="Pen color">
        {PALETTE.map((entry, i) => {
          const selected = !erase && i === colorIdx;
          return (
            <button
              key={entry.color}
              role="radio"
              aria-checked={selected}
              aria-label={entry.name}
              title={entry.name}
              onClick={() => onColor(i)}
              className="pressable flex min-h-11 min-w-10 flex-col items-center gap-0.5 pt-1"
            >
              <span
                className="h-7 w-7 rounded-full border-2"
                style={{
                  backgroundColor: entry.color,
                  borderColor: entry.color === "#FFFFFF" ? "#ECDAE1" : entry.color,
                }}
              />
              <HeartIcon
                className={`h-3 w-3 ${selected ? "text-rose-deep" : "text-transparent"}`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-0.5 border-t border-line-soft pt-1.5">
        <div role="radiogroup" aria-label="Pen size" className="flex items-center gap-0.5">
          {PEN_SIZES.map((entry, i) => (
            <button
              key={entry.name}
              role="radio"
              aria-checked={i === sizeIdx}
              aria-label={entry.name}
              title={entry.name}
              onClick={() => onSize(i)}
              className={`pressable inline-flex h-11 w-11 items-center justify-center rounded-full ${
                i === sizeIdx ? "bg-blush" : "hover:bg-blush/60"
              }`}
            >
              <span className={`rounded-full bg-berry ${dotSizes[i]}`} />
            </button>
          ))}
        </div>

        <IconButton
          label={erase ? "Eraser on" : "Eraser"}
          aria-pressed={erase}
          onClick={onErase}
          className={erase ? "bg-blush text-rose-dark" : ""}
        >
          <Eraser className="h-5 w-5" />
        </IconButton>

        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />

        <IconButton label="Undo" onClick={onUndo} disabled={!canUndo} className="disabled:opacity-35">
          <Undo2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Redo" onClick={onRedo} disabled={!canRedo} className="disabled:opacity-35">
          <Redo2 className="h-5 w-5" />
        </IconButton>
        <IconButton
          label="Clear canvas"
          onClick={onClear}
          disabled={!canClear}
          className="ml-auto text-danger disabled:opacity-35"
        >
          <Trash2 className="h-5 w-5" />
        </IconButton>
      </div>
    </div>
  );
}
