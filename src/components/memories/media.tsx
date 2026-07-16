"use client";

// Media helpers for memory cards and the full-screen viewer.

import { useEffect, useState } from "react";
import { signedUrl } from "@/lib/media";
import { HeartSpinner } from "@/components/hearts";
import type { Memory } from "@/lib/types";

/** Resolve a storage path to a short-lived signed URL. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

/** Renders a memory's photo, drawing image, or video player. */
export function MemoryMedia({
  memory,
  className = "",
  controls = false,
}: {
  memory: Memory;
  className?: string;
  controls?: boolean;
}) {
  const url = useSignedUrl(memory.media_path);
  if (!memory.media_path) return null;
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-blush/40 ${className}`}>
        <HeartSpinner label="Loading media" />
      </div>
    );
  }
  if (memory.kind === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        controls={controls}
        preload="metadata"
        playsInline
        className={`w-full bg-berry/10 ${className}`}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={memory.title ?? memory.caption ?? "Memory"}
      loading="lazy"
      className={`w-full object-cover ${className}`}
    />
  );
}
