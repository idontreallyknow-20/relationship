"use client";

// The chat composer: auto-growing textarea with draft persistence, photo and
// video attach, voice note recording, and reply or edit context chips.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CornerUpLeft, ImagePlus, Mic, Pencil, X } from "lucide-react";
import { HeartIcon } from "@/components/hearts";
import { useToast } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import type { Person } from "@/lib/types";
import { isTouchDevice, kindPreview, type ChatMessage } from "./helpers";

const DRAFT_KEY = "chat";
const MAX_TEXTAREA_HEIGHT = 132;

function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function Composer({
  meP,
  partnerName,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSendText,
  onSaveEdit,
  onPickFile,
  onVoiceNote,
  onTyping,
}: {
  meP: Person;
  partnerName: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSendText: (body: string) => void;
  onSaveEdit: (body: string) => void;
  onPickFile: (file: File) => void;
  onVoiceNote: (blob: Blob, durationSeconds: number) => void;
  onTyping: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const textRef = useRef("");
  const stashRef = useRef<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const touch = useMemo(() => isTouchDevice(), []);

  // Voice recording state.
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const setBoth = (v: string) => {
    textRef.current = v;
    setText(v);
  };

  // Restore the saved draft once on mount.
  useEffect(() => {
    const draft = loadDraft<string>(DRAFT_KEY);
    if (draft) setBoth(draft);
  }, []);

  // Entering edit mode swaps the draft out; leaving restores it.
  useEffect(() => {
    if (editing) {
      stashRef.current = textRef.current;
      setBoth(editing.body ?? "");
      areaRef.current?.focus();
    } else if (stashRef.current !== null) {
      setBoth(stashRef.current);
      stashRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  useEffect(() => {
    if (replyTo) areaRef.current?.focus();
  }, [replyTo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-grow the textarea with the content.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  // Stop any live recording when the composer unmounts.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, []);

  const handleChange = (v: string) => {
    setBoth(v);
    if (!editing) saveDraft(DRAFT_KEY, v);
    onTyping();
  };

  const submit = () => {
    const body = textRef.current.trim();
    if (!body) return;
    if (editing) {
      onSaveEdit(body);
    } else {
      onSendText(body);
      clearDraft(DRAFT_KEY);
    }
    setBoth("");
    areaRef.current?.focus();
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice notes are not supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (tickRef.current !== null) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setRecording(false);
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        if (cancelledRef.current) return;
        if (chunksRef.current.length === 0 || seconds < 1) {
          toast("That was too short. Hold on a moment longer next time.");
          return;
        }
        const type = mime || chunksRef.current[0].type || "audio/webm";
        onVoiceNote(new Blob(chunksRef.current, { type }), seconds);
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      recorder.start(300);
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch {
      toast("The microphone is not available. Allow mic access in your browser settings to send voice notes.");
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else setRecording(false);
  };

  const contextName = (m: ChatMessage) =>
    m.sender === meP ? "yourself" : partnerName;

  return (
    <div>
      {replyTo && !editing && (
        <div className="mx-3 mb-1.5 flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 shadow-soft">
          <CornerUpLeft className="h-4 w-4 shrink-0 text-rose-dark" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-berry">
              Replying to {contextName(replyTo)}
            </p>
            <p className="truncate text-xs text-berry-soft">{kindPreview(replyTo)}</p>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={onCancelReply}
            className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-berry-soft hover:bg-blush/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {editing && (
        <div className="mx-3 mb-1.5 flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 shadow-soft">
          <Pencil className="h-4 w-4 shrink-0 text-rose-dark" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-berry">Editing message</p>
            <p className="truncate text-xs text-berry-soft">{editing.body}</p>
          </div>
          <button
            type="button"
            aria-label="Cancel edit"
            onClick={onCancelEdit}
            className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-berry-soft hover:bg-blush/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 px-4 pb-3 pt-1.5">
          <span className="heart-pulse">
            <HeartIcon className="h-5 w-5 text-danger" />
          </span>
          <span className="text-sm font-semibold tabular-nums text-berry">
            {formatDuration(elapsed)}
          </span>
          <span className="flex-1 text-xs text-berry-soft">Recording a voice note</span>
          <button
            type="button"
            aria-label="Cancel recording"
            onClick={() => stopRecording(true)}
            className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-blush text-berry"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Finish and send voice note"
            onClick={() => stopRecording(false)}
            className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-rose-dark text-white"
          >
            <Check className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 pb-3 pt-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = "";
            }}
          />
          {!editing && (
            <button
              type="button"
              aria-label="Send a photo or video"
              onClick={() => fileRef.current?.click()}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-rose-dark"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
          )}
          <textarea
            ref={areaRef}
            rows={1}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !touch) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={editing ? "Edit your message" : "Write something sweet"}
            aria-label="Message"
            className="max-h-[132px] min-h-11 w-full flex-1 resize-none rounded-3xl border border-line bg-white px-4 py-2.5 text-[0.95rem] leading-snug text-berry placeholder:text-berry-soft/60 focus:border-rose focus:outline-none"
          />
          {text.trim() ? (
            <button
              type="button"
              aria-label={editing ? "Save edit" : "Send message"}
              onClick={submit}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-dark text-white"
            >
              {editing ? <Check className="h-5 w-5" /> : <HeartIcon className="h-5 w-5" />}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Record a voice note"
              onClick={() => void startRecording()}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-rose-dark"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
