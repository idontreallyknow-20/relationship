"use client";

// Photo and video message bodies, plus the full-screen photo viewer.

import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { HeartIcon } from "@/components/hearts";
import { useSignedUrl, type ChatMessage } from "./helpers";

function MediaPlaceholder({ ratio }: { ratio: string }) {
  return (
    <div
      className="flex w-full items-center justify-center rounded-xl bg-blush/60"
      style={{ aspectRatio: ratio }}
    >
      <HeartIcon className="heart-pulse h-6 w-6 text-rose/70" />
    </div>
  );
}

export function ImageBody({
  m,
  onOpen,
}: {
  m: ChatMessage;
  onOpen: (url: string) => void;
}) {
  const remote = useSignedUrl(m.media_path);
  const url = remote ?? m.localUrl ?? null;
  const w = m.media_meta?.width || 4;
  const h = m.media_meta?.height || 3;
  // Clamp extreme shapes so one photo never dominates the thread.
  const ratio = Math.min(1.9, Math.max(0.62, w / h));

  return (
    <div className="w-60 max-w-full">
      {url ? (
        <button
          type="button"
          aria-label="View photo"
          className="pressable block w-full overflow-hidden rounded-xl"
          style={{ aspectRatio: `${ratio}` }}
          onClick={() => onOpen(url)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Shared photo" className="h-full w-full object-cover" />
        </button>
      ) : (
        <MediaPlaceholder ratio={`${ratio}`} />
      )}
    </div>
  );
}

export function VideoBody({ m }: { m: ChatMessage }) {
  const remote = useSignedUrl(m.media_path);
  const url = remote ?? m.localUrl ?? null;

  return (
    <div className="w-64 max-w-full">
      {url ? (
        <video
          controls
          preload="metadata"
          src={url}
          className="w-full rounded-xl bg-berry/90"
          style={{ maxHeight: "20rem" }}
        />
      ) : (
        <MediaPlaceholder ratio="16 / 10" />
      )}
    </div>
  );
}

export function ImageViewer({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fade-in fixed inset-0 z-[80] flex flex-col bg-black">
      <div
        className="flex items-center justify-between px-3 pb-2"
        style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}
      >
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="pressable flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white/90"
        >
          <Download className="h-4.5 w-4.5" />
          Save
        </a>
        <button
          aria-label="Close photo"
          onClick={onClose}
          className="pressable flex h-11 w-11 items-center justify-center rounded-full text-white/90"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <button
        aria-label="Close photo"
        className="flex min-h-0 flex-1 cursor-default items-center justify-center overflow-hidden p-2"
        onClick={onClose}
        style={{ paddingBottom: "calc(0.5rem + var(--safe-bottom))" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Shared photo" className="max-h-full max-w-full object-contain" />
      </button>
    </div>,
    document.body,
  );
}
