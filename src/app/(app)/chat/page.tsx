"use client";

// The chat: realtime private messages with photos, videos, voice notes,
// drawings, replies, reactions, receipts, search, and presence.

import {
  Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import {
  Copy, CornerUpLeft, Pencil, Search, Trash2, X,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useCouple, useWho } from "@/lib/couple-context";
import type {
  Message, MessageReaction, MessageKind, Reaction,
} from "@/lib/types";
import { formatDay, formatRelative, formatShortDate, formatTime, sameDay } from "@/lib/format";
import { compressImage, uploadMedia, validateUpload, type MediaFolder } from "@/lib/media";
import { notifyPartner } from "@/lib/notify";
import {
  Avatar, ConfirmDialog, EmptyState, IconButton, Sheet, TopBar, useToast,
} from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import {
  REACTIONS, highlightMatches, kindPreview, useSignedUrl,
  type ChatMessage, type PendingState,
} from "@/components/chat/helpers";
import { MessageBubble } from "@/components/chat/bubble";
import { ImageViewer } from "@/components/chat/media";
import { Composer } from "@/components/chat/composer";

const PAGE_SIZE = 50;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

interface PendingEntry {
  insert: {
    client_id: string;
    sender: string;
    kind: MessageKind;
    body: string | null;
    media_path: string | null;
    media_meta: Message["media_meta"];
    drawing_id: string | null;
    reply_to: string | null;
  };
  /** Media still waiting to be uploaded before the row can be inserted. */
  blob?: Blob;
  folder?: MediaFolder;
}

interface PresenceMeta {
  person: string;
  typing: boolean;
  at: number;
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, "\\$&");
}

export default function Page() {
  const { me, partner } = useCouple();
  const { me: meP, partner: partnerP } = useWho();
  const toast = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const hasMoreRef = useRef(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadingEarlierRef = useRef(false);

  const pendingRef = useRef<Map<string, PendingEntry>>(new Map());
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [menuOpenedAt, setMenuOpenedAt] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const presenceRef = useRef<RealtimeChannel | null>(null);
  const typingClearRef = useRef<number | null>(null);
  const typingStopRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottomRef = useRef(true);

  const partnerName = partner?.display_name ?? "your love";
  const partnerAvatarUrl = useSignedUrl(partner?.avatar_path);

  /* ---------------------------------------------------------------- */
  /* State helpers                                                      */
  /* ---------------------------------------------------------------- */

  const mutate = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const setHasMoreBoth = useCallback((v: boolean) => {
    hasMoreRef.current = v;
    setHasMore(v);
  }, []);

  /** Insert or merge a server row, matching optimistic rows by client_id. */
  const upsertRow = useCallback((row: Message, insertIfMissing: boolean) => {
    mutate((prev) => {
      const i = prev.findIndex(
        (m) => m.id === row.id || (!!row.client_id && m.client_id === row.client_id),
      );
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], ...row, pending: undefined };
        return next.sort(byTime);
      }
      if (!insertIfMissing) return prev;
      return [...prev, row].sort(byTime);
    });
  }, [mutate]);

  const setPending = useCallback((clientId: string, state?: PendingState) => {
    mutate((prev) =>
      prev.map((m) =>
        m.client_id === clientId && m.pending ? { ...m, pending: state } : m,
      ),
    );
  }, [mutate]);

  const putReaction = useCallback((row: MessageReaction) => {
    setReactions((prev) => {
      const list = (prev[row.message_id] ?? []).filter((r) => r.person !== row.person);
      return { ...prev, [row.message_id]: [...list, row] };
    });
  }, []);

  const removeReaction = useCallback((messageId: string, person: string) => {
    setReactions((prev) => {
      const list = (prev[messageId] ?? []).filter((r) => r.person !== person);
      return { ...prev, [messageId]: list };
    });
  }, []);

  const fetchReactions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await supabase()
      .from("message_reactions")
      .select("*")
      .in("message_id", ids);
    if (!data) return;
    setReactions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = [];
      for (const row of data as MessageReaction[]) {
        next[row.message_id] = [...(next[row.message_id] ?? []), row];
      }
      return next;
    });
  }, []);

  /** Tell the sender their messages reached us, and were seen if visible. */
  const markIncoming = useCallback((rows: ChatMessage[]) => {
    const sb = supabase();
    const incoming = rows.filter((m) => m.sender === partnerP && !m.pending);
    const undelivered = incoming.filter((m) => !m.delivered_at).map((m) => m.id);
    if (undelivered.length > 0) {
      void sb.rpc("mark_messages_delivered", { ids: undelivered });
    }
    if (document.visibilityState === "visible") {
      const unread = incoming.filter((m) => !m.read_at).map((m) => m.id);
      if (unread.length > 0) void sb.rpc("mark_messages_read", { ids: unread });
    }
  }, [partnerP]);

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Initial load                                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase()
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!active) return;
      if (error || !data) {
        toast("Could not load messages.");
        setLoaded(true);
        return;
      }
      const rows = (data as Message[]).slice().reverse();
      mutate(() => rows);
      setHasMoreBoth(data.length === PAGE_SIZE);
      setLoaded(true);
      void fetchReactions(rows.map((r) => r.id));
      markIncoming(rows);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (loaded) scrollToBottom();
  }, [loaded, scrollToBottom]);

  // Coming back to the tab marks anything unread as read.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") markIncoming(messagesRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markIncoming]);

  /* ---------------------------------------------------------------- */
  /* Realtime: messages and reactions                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const sb = supabase();
    const channel = sb
      .channel("chat-db")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          upsertRow(row, true);
          if (row.sender === partnerP) {
            void sb.rpc("mark_messages_delivered", { ids: [row.id] });
            if (document.visibilityState === "visible") {
              void sb.rpc("mark_messages_read", { ids: [row.id] });
            }
            if (stickBottomRef.current) scrollToBottom(true);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          // Merge edits, deletions, and receipt timestamps for loaded rows.
          upsertRow(payload.new as Message, false);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<MessageReaction>;
            if (old.message_id && old.person) removeReaction(old.message_id, old.person);
          } else {
            putReaction(payload.new as MessageReaction);
          }
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [partnerP, upsertRow, putReaction, removeReaction, scrollToBottom]);

  /* ---------------------------------------------------------------- */
  /* Presence: online dot and typing indicator                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const sb = supabase();
    const channel = sb.channel("chat-presence", {
      config: { presence: { key: meP } },
    });
    presenceRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceMeta>();
        const metas = state[partnerP] ?? [];
        setPartnerOnline(metas.length > 0);
        const typing = metas.some((entry) => entry.typing);
        setPartnerTyping(typing);
        if (typingClearRef.current !== null) window.clearTimeout(typingClearRef.current);
        if (typing) {
          // Safety net in case the partner disappears mid-keystroke.
          typingClearRef.current = window.setTimeout(() => setPartnerTyping(false), 9000);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ person: meP, typing: false, at: Date.now() });
        }
      });
    return () => {
      presenceRef.current = null;
      if (typingClearRef.current !== null) window.clearTimeout(typingClearRef.current);
      if (typingStopRef.current !== null) window.clearTimeout(typingStopRef.current);
      void sb.removeChannel(channel);
    };
  }, [meP, partnerP]);

  const sendTyping = useCallback(() => {
    const channel = presenceRef.current;
    if (!channel) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      void channel.track({ person: meP, typing: true, at: now });
    }
    if (typingStopRef.current !== null) window.clearTimeout(typingStopRef.current);
    typingStopRef.current = window.setTimeout(() => {
      void presenceRef.current?.track({ person: meP, typing: false, at: Date.now() });
    }, 2800);
  }, [meP]);

  const stopTyping = useCallback(() => {
    if (typingStopRef.current !== null) window.clearTimeout(typingStopRef.current);
    void presenceRef.current?.track({ person: meP, typing: false, at: Date.now() });
  }, [meP]);

  /* ---------------------------------------------------------------- */
  /* Sending                                                            */
  /* ---------------------------------------------------------------- */

  const attemptSend = useCallback(async (clientId: string) => {
    const entry = pendingRef.current.get(clientId);
    if (!entry) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPending(clientId, "failed");
      toast("You are offline. It will send once you are back.");
      return;
    }
    setPending(clientId, "sending");
    const sb = supabase();
    try {
      if (entry.blob && !entry.insert.media_path) {
        entry.insert.media_path = await uploadMedia(
          entry.folder ?? "chat",
          meP,
          entry.blob,
        );
        entry.blob = undefined;
      }
      let row: Message | null = null;
      const { data, error } = await sb
        .from("messages")
        .insert(entry.insert)
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          // A previous attempt actually landed; the unique client_id caught it.
          const res = await sb
            .from("messages")
            .select("*")
            .eq("client_id", clientId)
            .single();
          row = (res.data as Message) ?? null;
        }
      } else {
        row = data as Message;
      }
      if (!row) throw new Error("send_failed");
      pendingRef.current.delete(clientId);
      upsertRow(row, true);
      void notifyPartner("messages", row.id, { body: kindPreview(row), url: "/chat" });
    } catch {
      setPending(clientId, "failed");
    }
  }, [meP, setPending, toast, upsertRow]);

  const queueSend = useCallback((opts: {
    kind: MessageKind;
    body?: string | null;
    media_meta?: Message["media_meta"];
    drawing_id?: string | null;
    blob?: Blob;
    folder?: MediaFolder;
    localUrl?: string;
  }) => {
    const clientId = crypto.randomUUID();
    const insert: PendingEntry["insert"] = {
      client_id: clientId,
      sender: meP,
      kind: opts.kind,
      body: opts.body ?? null,
      media_path: null,
      media_meta: opts.media_meta ?? null,
      drawing_id: opts.drawing_id ?? null,
      reply_to: replyTo?.id ?? null,
    };
    pendingRef.current.set(clientId, {
      insert,
      blob: opts.blob,
      folder: opts.folder,
    });
    const optimistic: ChatMessage = {
      ...insert,
      sender: meP,
      id: clientId,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      delivered_at: null,
      read_at: null,
      pending: "sending",
      localUrl: opts.localUrl,
    };
    mutate((prev) => [...prev, optimistic].sort(byTime));
    setReplyTo(null);
    stopTyping();
    scrollToBottom(true);
    void attemptSend(clientId);
  }, [meP, replyTo, mutate, stopTyping, scrollToBottom, attemptSend]);

  // Flush the failed queue as soon as the connection returns.
  useEffect(() => {
    const flush = () => {
      for (const clientId of pendingRef.current.keys()) {
        const msg = messagesRef.current.find((m) => m.client_id === clientId);
        if (msg?.pending === "failed") void attemptSend(clientId);
      }
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [attemptSend]);

  const handleSendText = useCallback((body: string) => {
    queueSend({ kind: "text", body });
  }, [queueSend]);

  const handlePickFile = useCallback(async (file: File) => {
    if (file.type.startsWith("video/")) {
      const err = validateUpload(file, "video");
      if (err) {
        toast(err);
        return;
      }
      queueSend({
        kind: "video",
        media_meta: { mime: file.type, size: file.size },
        blob: file,
        folder: "chat",
        localUrl: URL.createObjectURL(file),
      });
      return;
    }
    const err = validateUpload(file, "image");
    if (err) {
      toast(err);
      return;
    }
    try {
      const { blob, width, height } = await compressImage(file);
      queueSend({
        kind: "image",
        media_meta: {
          width: width || undefined,
          height: height || undefined,
          mime: blob.type || file.type,
          size: blob.size,
        },
        blob,
        folder: "chat",
        localUrl: URL.createObjectURL(blob),
      });
    } catch {
      toast("Could not read that image.");
    }
  }, [queueSend, toast]);

  const handleVoiceNote = useCallback((blob: Blob, duration: number) => {
    const err = validateUpload(blob, "audio");
    if (err) {
      toast(err);
      return;
    }
    queueSend({
      kind: "audio",
      media_meta: { duration, mime: blob.type, size: blob.size },
      blob,
      folder: "voice",
      localUrl: URL.createObjectURL(blob),
    });
  }, [queueSend, toast]);

  /* ---------------------------------------------------------------- */
  /* Edit, delete, reactions                                            */
  /* ---------------------------------------------------------------- */

  const handleSaveEdit = useCallback(async (body: string) => {
    const target = editing;
    if (!target) return;
    setEditing(null);
    const now = new Date().toISOString();
    mutate((prev) =>
      prev.map((m) => (m.id === target.id ? { ...m, body, edited_at: now } : m)),
    );
    const { error } = await supabase()
      .from("messages")
      .update({ body, edited_at: now })
      .eq("id", target.id);
    if (error) {
      mutate((prev) =>
        prev.map((m) =>
          m.id === target.id ? { ...m, body: target.body, edited_at: target.edited_at } : m,
        ),
      );
      toast("Could not save the edit.");
    }
  }, [editing, mutate, toast]);

  const handleDelete = useCallback(async (target: ChatMessage) => {
    const now = new Date().toISOString();
    mutate((prev) =>
      prev.map((m) => (m.id === target.id ? { ...m, deleted_at: now } : m)),
    );
    const { error } = await supabase()
      .from("messages")
      .update({ deleted_at: now })
      .eq("id", target.id);
    if (error) {
      mutate((prev) =>
        prev.map((m) => (m.id === target.id ? { ...m, deleted_at: null } : m)),
      );
      toast("Could not remove the message.");
      return;
    }
    toast("Message removed", () => {
      mutate((prev) =>
        prev.map((m) => (m.id === target.id ? { ...m, deleted_at: null } : m)),
      );
      void supabase().from("messages").update({ deleted_at: null }).eq("id", target.id);
    });
  }, [mutate, toast]);

  const toggleReaction = useCallback(async (m: ChatMessage, reaction: Reaction) => {
    if (m.pending) return;
    const sb = supabase();
    const mine = (reactions[m.id] ?? []).find((r) => r.person === meP);
    if (mine && mine.reaction === reaction) {
      removeReaction(m.id, meP);
      const { error } = await sb
        .from("message_reactions")
        .delete()
        .eq("message_id", m.id)
        .eq("person", meP);
      if (error) {
        putReaction(mine);
        toast("Could not remove the reaction.");
      }
    } else {
      putReaction({
        message_id: m.id,
        person: meP,
        reaction,
        created_at: new Date().toISOString(),
      });
      const { error } = await sb
        .from("message_reactions")
        .upsert(
          { message_id: m.id, person: meP, reaction },
          { onConflict: "message_id,person" },
        );
      if (error) {
        if (mine) putReaction(mine);
        else removeReaction(m.id, meP);
        toast("Could not add the reaction.");
      }
    }
  }, [reactions, meP, putReaction, removeReaction, toast]);

  /* ---------------------------------------------------------------- */
  /* Pagination and scroll-to-message                                   */
  /* ---------------------------------------------------------------- */

  const loadEarlier = useCallback(async (): Promise<boolean> => {
    if (loadingEarlierRef.current || !hasMoreRef.current) return false;
    loadingEarlierRef.current = true;
    setLoadingEarlier(true);
    try {
      const oldest = messagesRef.current.find((m) => !m.pending);
      let builder = supabase()
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (oldest) builder = builder.lt("created_at", oldest.created_at);
      const { data, error } = await builder;
      if (error || !data) {
        toast("Could not load earlier messages.");
        return false;
      }
      const older = (data as Message[]).slice().reverse();
      setHasMoreBoth(data.length === PAGE_SIZE);
      if (older.length === 0) return false;

      const el = listRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      const prevTop = el?.scrollTop ?? 0;
      mutate((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !known.has(m.id)), ...prev];
      });
      // Keep the viewport anchored on the message the reader was looking at.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
        });
      });
      void fetchReactions(older.map((m) => m.id));
      return true;
    } finally {
      loadingEarlierRef.current = false;
      setLoadingEarlier(false);
    }
  }, [mutate, fetchReactions, setHasMoreBoth, toast]);

  const scrollToMessage = useCallback(async (id: string) => {
    let guard = 0;
    while (
      !messagesRef.current.some((m) => m.id === id) &&
      hasMoreRef.current &&
      guard < 40
    ) {
      const got = await loadEarlier();
      if (!got) break;
      guard += 1;
    }
    if (!messagesRef.current.some((m) => m.id === id)) {
      toast("Could not find that message anymore.");
      return;
    }
    setFlashId(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`msg-${id}`)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      });
    });
    window.setTimeout(() => {
      setFlashId((current) => (current === id ? null : current));
    }, 2000);
  }, [loadEarlier, toast]);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    stickBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (el.scrollTop < 60 && hasMoreRef.current && !loadingEarlierRef.current) {
      void loadEarlier();
    }
  }, [loadEarlier]);

  /* ---------------------------------------------------------------- */
  /* Search                                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!searchOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const local = messagesRef.current.filter(
        (m) =>
          !m.deleted_at &&
          !m.pending &&
          m.body &&
          m.body.toLowerCase().includes(q.toLowerCase()),
      );
      const { data } = await supabase()
        .from("messages")
        .select("*")
        .ilike("body", `%${escapeLike(q)}%`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);
      const map = new Map<string, Message>();
      for (const m of [...local, ...((data ?? []) as Message[])]) map.set(m.id, m);
      setResults(
        [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
      setSearching(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Derived view data                                                  */
  /* ---------------------------------------------------------------- */

  const byId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const activeQuery = searchOpen ? query.trim() : "";

  const menuReaction = menuFor
    ? (reactions[menuFor.id] ?? []).find((r) => r.person === meP)?.reaction ?? null
    : null;

  const canEditMenu =
    !!menuFor &&
    menuFor.sender === meP &&
    menuFor.kind === "text" &&
    !menuFor.deleted_at &&
    menuOpenedAt - new Date(menuFor.created_at).getTime() < EDIT_WINDOW_MS;

  const presenceLine = !partner
    ? "waiting for them to pair"
    : partnerOnline
      ? "online now"
      : partner.last_seen_at
        ? `seen ${formatRelative(partner.last_seen_at)}`
        : "not here yet";

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <div
      className="flex min-h-0 flex-col"
      style={{ height: "calc(100dvh - 4.5rem - var(--safe-bottom))" }}
    >
      <TopBar
        title="Chat"
        action={
          <div className="flex items-center gap-1">
            <IconButton label="Search messages" onClick={() => setSearchOpen((v) => !v)}>
              <Search className="h-5 w-5" />
            </IconButton>
            <div className="flex items-center gap-2 pl-1">
              <div className="text-right">
                <p className="text-xs font-semibold leading-tight text-berry">
                  {partner?.display_name ?? "Just you"}
                </p>
                <p className="text-[0.68rem] leading-tight text-berry-soft">
                  {presenceLine}
                </p>
              </div>
              <Avatar
                name={partnerName}
                url={partnerAvatarUrl}
                size="sm"
                online={partnerOnline}
              />
            </div>
          </div>
        }
      />

      {searchOpen && (
        <div className="border-b border-line-soft bg-cream px-4 py-2">
          <div className="flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-berry-soft" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your messages"
              aria-label="Search messages"
              className="min-w-0 flex-1 bg-transparent text-sm text-berry outline-none placeholder:text-berry-soft/60"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={closeSearch}
              className="pressable flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-berry-soft hover:bg-blush/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {query.trim().length >= 2 && (
            <div className="mt-2 max-h-64 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line bg-white shadow-soft">
              {searching && results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-berry-soft">Searching</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-berry-soft">No matches found.</p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void scrollToMessage(r.id)}
                    className="pressable block w-full px-4 py-2.5 text-left hover:bg-blush/30"
                  >
                    <p className="text-xs font-semibold text-berry-soft">
                      {r.sender === meP ? me.display_name : partnerName}
                      <span className="font-normal">
                        {" "}on {formatShortDate(r.created_at)} at {formatTime(r.created_at)}
                      </span>
                    </p>
                    <p className="line-clamp-2 text-sm text-berry">
                      {highlightMatches(r.body ?? "", query)}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onListScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3"
      >
        {!loaded ? (
          <HeartSpinner label="Loading messages" />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            <EmptyState
              title="No messages yet"
              hint="This little chat is just for the two of you. Send the first hello and start the story."
              action={
                <button
                  type="button"
                  onClick={() => handleSendText("hello")}
                  className="pressable flex min-h-11 items-center gap-2 rounded-full bg-rose-dark px-5 font-semibold text-white"
                >
                  <HeartIcon className="h-4 w-4" />
                  Say hello
                </button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-3">
            {hasMore && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={() => void loadEarlier()}
                  className="pressable rounded-full border border-line bg-white px-4 py-1.5 text-xs font-semibold text-berry-soft shadow-soft"
                >
                  {loadingEarlier ? "Loading earlier messages" : "Load earlier messages"}
                </button>
              </div>
            )}
            {messages.map((m, i) => (
              <Fragment key={m.client_id || m.id}>
                {(i === 0 || !sameDay(messages[i - 1].created_at, m.created_at)) && (
                  <div className="my-1.5 flex items-center justify-center">
                    <span className="rounded-full bg-blush/70 px-3 py-1 text-[0.7rem] font-semibold text-berry-soft">
                      {formatDay(m.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  m={m}
                  own={m.sender === meP}
                  meP={meP}
                  meName={me.display_name}
                  partnerName={partnerName}
                  repliedTo={m.reply_to ? byId.get(m.reply_to) ?? null : null}
                  reactions={reactions[m.id] ?? []}
                  query={activeQuery}
                  flash={flashId === m.id}
                  onOpenMenu={setMenuFor}
                  onOpenImage={setViewerUrl}
                  onQuoteTap={(id) => void scrollToMessage(id)}
                  onToggleReaction={(msg, r) => void toggleReaction(msg, r)}
                  onRetry={(msg) => void attemptSend(msg.client_id)}
                />
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-line-soft bg-cream/95 backdrop-blur-sm">
        {partnerTyping && (
          <div className="flex items-center gap-1.5 px-4 pt-1.5 text-xs text-berry-soft">
            {partnerName} is typing
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="heart-pulse inline-flex"
                  style={{ animationDelay: `${i * 180}ms` }}
                >
                  <HeartIcon className="h-2.5 w-2.5 text-rose" />
                </span>
              ))}
            </span>
          </div>
        )}
        <Composer
          meP={meP}
          partnerName={partnerName}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSendText={handleSendText}
          onSaveEdit={(body) => void handleSaveEdit(body)}
          onPickFile={(file) => void handlePickFile(file)}
          onVoiceNote={handleVoiceNote}
          onTyping={sendTyping}
        />
      </div>

      {/* Message action sheet */}
      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title="Message">
        {menuFor && (
          <div className="flex flex-col gap-5 pt-1">
            <div className="flex justify-between gap-1">
              {REACTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    void toggleReaction(menuFor, r.value);
                    setMenuFor(null);
                  }}
                  className={`pressable flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-2.5 ${
                    menuReaction === r.value ? "bg-blush" : "hover:bg-blush/40"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      menuReaction === r.value
                        ? "bg-rose-dark text-white"
                        : "bg-blush text-rose-dark"
                    }`}
                  >
                    <r.Icon className="h-5 w-5" fill={r.fill ? "currentColor" : "none"} />
                  </span>
                  <span className="text-xs font-semibold text-berry">{r.label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setReplyTo(menuFor);
                  setEditing(null);
                  setMenuFor(null);
                }}
                className="pressable flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-semibold text-berry hover:bg-blush/50"
              >
                <CornerUpLeft className="h-4.5 w-4.5 text-berry-soft" />
                Reply
              </button>
              {menuFor.kind === "text" && menuFor.body && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(menuFor.body ?? "");
                    toast("Copied to clipboard");
                    setMenuFor(null);
                  }}
                  className="pressable flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-semibold text-berry hover:bg-blush/50"
                >
                  <Copy className="h-4.5 w-4.5 text-berry-soft" />
                  Copy text
                </button>
              )}
              {canEditMenu && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(menuFor);
                    setReplyTo(null);
                    setMenuFor(null);
                  }}
                  className="pressable flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-semibold text-berry hover:bg-blush/50"
                >
                  <Pencil className="h-4.5 w-4.5 text-berry-soft" />
                  Edit
                </button>
              )}
              {menuFor.sender === meP && !menuFor.deleted_at && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(menuFor);
                    setMenuFor(null);
                  }}
                  className="pressable flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-semibold text-danger hover:bg-blush/50"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete message"
        message="This message will be removed for both of you."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) void handleDelete(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
