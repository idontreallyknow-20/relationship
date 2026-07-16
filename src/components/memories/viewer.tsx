"use client";

// Full-screen view of a single memory: large media, details, favorites,
// comments, download, and edit or delete for memories you created.

import { useCallback, useEffect, useState } from "react";
import {
  Download, MapPin, Pencil, Send, Trash2, X,
} from "lucide-react";
import {
  Avatar, Button, ConfirmDialog, IconButton, Input, Label, Sheet, useToast,
} from "@/components/ui";
import { HeartDivider, HeartIcon, HeartSpinner } from "@/components/hearts";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/media";
import { formatRelative, formatShortDate } from "@/lib/format";
import { displayName, type Memory, type MemoryComment, type Person } from "@/lib/types";
import { Textarea } from "@/components/ui";
import { FavoriteHearts, KIND_LABELS, memoryDate } from "./card";
import { MemoryMedia } from "./media";

export function MemoryViewer({
  memory,
  me,
  favoritedBy,
  commentsBump,
  onClose,
  onToggleFavorite,
  onSaveEdit,
  onDelete,
}: {
  memory: Memory;
  me: Person;
  favoritedBy: Person[];
  commentsBump: number;
  onClose: () => void;
  onToggleFavorite: () => void;
  onSaveEdit: (
    id: string,
    fields: { title: string | null; caption: string | null; happened_on: string | null; location: string | null },
  ) => Promise<void>;
  onDelete: () => void;
}) {
  const toast = useToast();
  const mine = memory.created_by === me;
  const [comments, setComments] = useState<MemoryComment[] | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(memory.title ?? "");
  const [editCaption, setEditCaption] = useState(memory.caption ?? "");
  const [editDate, setEditDate] = useState(memory.happened_on ?? "");
  const [editLocation, setEditLocation] = useState(memory.location ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadComments = useCallback(async () => {
    const { data } = await supabase()
      .from("memory_comments")
      .select("*")
      .eq("memory_id", memory.id)
      .order("created_at", { ascending: true });
    if (data) setComments(data as MemoryComment[]);
  }, [memory.id]);

  useEffect(() => {
    void loadComments();
  }, [loadComments, commentsBump]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sendComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await supabase()
      .from("memory_comments")
      .insert({ memory_id: memory.id, person: me, body })
      .select()
      .single();
    setSending(false);
    if (error || !data) {
      toast("Could not post that comment.");
      return;
    }
    setComments((prev) => [...(prev ?? []), data as MemoryComment]);
    setCommentText("");
  };

  const removeComment = async (id: string) => {
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    await supabase().from("memory_comments").delete().eq("id", id);
    toast("Comment deleted");
  };

  const download = async () => {
    if (!memory.media_path) return;
    const url = await signedUrl(memory.media_path, 300);
    if (!url) {
      toast("Could not prepare the download.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = memory.title?.replace(/\s+/g, "-") || "memory";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      await onSaveEdit(memory.id, {
        title: editTitle.trim() || null,
        caption: editCaption.trim() || null,
        happened_on: editDate || null,
        location: editLocation.trim() || null,
      });
      setEditOpen(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const hasMedia = !!memory.media_path;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream" role="dialog" aria-modal="true" aria-label={memory.title ?? "Memory"}>
      <header
        className="flex items-center gap-1 border-b border-line-soft bg-cream px-3"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="flex h-14 w-full items-center gap-1">
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
          <h2 className="flex-1 truncate font-display text-xl font-semibold text-plum">
            {memory.title ?? KIND_LABELS[memory.kind]}
          </h2>
          {hasMedia && (
            <IconButton label="Download original" onClick={() => void download()}>
              <Download className="h-5 w-5" />
            </IconButton>
          )}
          {mine && (
            <>
              <IconButton label="Edit memory" onClick={() => setEditOpen(true)}>
                <Pencil className="h-5 w-5" />
              </IconButton>
              <IconButton label="Delete memory" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-5 w-5 text-danger" />
              </IconButton>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {hasMedia && <MemoryMedia memory={memory} controls className="max-h-[60dvh] bg-berry/5 object-contain" />}
        {memory.kind === "milestone" && (
          <div className="flex flex-col items-center gap-2 bg-blush px-4 py-8 text-center">
            <HeartIcon className="heart-pulse h-8 w-8 text-rose-dark" />
            <p className="font-display text-3xl font-semibold text-plum">
              {memory.title ?? "A milestone"}
            </p>
          </div>
        )}

        <div className="mx-auto w-full max-w-lg px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-berry-soft">
            <span className="rounded-full bg-blush px-2.5 py-0.5 font-semibold text-berry">
              {KIND_LABELS[memory.kind]}
            </span>
            <span>{formatShortDate(memoryDate(memory))}</span>
            {memory.location && (
              <span className="flex items-center gap-1 rounded-full bg-lavender px-2 py-0.5 font-semibold text-lavender-deep">
                <MapPin className="h-3 w-3" />
                {memory.location}
              </span>
            )}
            <span>by {displayName(memory.created_by)}</span>
            {memory.edited_at && <span>edited</span>}
          </div>

          {memory.title && memory.kind !== "milestone" && (
            <h3 className="mt-3 font-display text-2xl font-semibold text-plum">{memory.title}</h3>
          )}
          {memory.caption && (
            <p className="mt-2 whitespace-pre-line text-[0.95rem] text-berry">{memory.caption}</p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <FavoriteHearts
              count={favoritedBy.length}
              mine={favoritedBy.includes(me)}
              onToggle={onToggleFavorite}
            />
            <span className="text-xs text-berry-soft">
              {favoritedBy.length === 0
                ? "Tap the heart if you love this one"
                : favoritedBy.length === 2
                  ? "You both love this"
                  : `Loved by ${displayName(favoritedBy[0])}`}
            </span>
          </div>

          <HeartDivider />

          <h4 className="font-display text-lg font-semibold text-plum">Comments</h4>
          {comments === null ? (
            <HeartSpinner label="Loading comments" />
          ) : comments.length === 0 ? (
            <p className="mt-2 text-sm text-berry-soft">No comments yet. Say something sweet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={displayName(c.person)} size="sm" />
                  <div className="min-w-0 flex-1 rounded-2xl bg-blush/50 px-3.5 py-2.5">
                    <p className="text-sm text-berry">{c.body}</p>
                    <p className="mt-0.5 text-[11px] text-berry-soft">{formatRelative(c.created_at)}</p>
                  </div>
                  {c.person === me && (
                    <IconButton label="Delete comment" onClick={() => setDeleteCommentId(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className="border-t border-line-soft bg-cream px-4 pt-2"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-lg items-center gap-2">
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendComment();
            }}
            placeholder="Add a comment"
            aria-label="Add a comment"
            maxLength={1000}
          />
          <IconButton
            label="Send comment"
            className="bg-rose-dark text-white hover:bg-rose-deep"
            disabled={sending || !commentText.trim()}
            onClick={() => void sendComment()}
          >
            <Send className="h-5 w-5" />
          </IconButton>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this memory?"
        message="It will disappear from your shared timeline. You can undo right after."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />

      <ConfirmDialog
        open={deleteCommentId !== null}
        title="Delete this comment?"
        message="Your comment will be removed."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteCommentId(null)}
        onConfirm={() => {
          if (deleteCommentId) void removeComment(deleteCommentId);
          setDeleteCommentId(null);
        }}
      />

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit memory">
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="edit-caption">Caption</Label>
            <Textarea id="edit-caption" value={editCaption} onChange={(e) => setEditCaption(e.target.value)} maxLength={4000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-date">When</Label>
              <Input id="edit-date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-location">Where</Label>
              <Input id="edit-location" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} maxLength={120} />
            </div>
          </div>
          <Button className="w-full" loading={savingEdit} onClick={() => void saveEdit()}>
            Save changes
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
