"use client";

// Small drawing previews: the uploaded PNG when one exists, otherwise a
// live render of the stored strokes.

import { useEffect, useRef, useState } from "react";
import type { Drawing, Stroke } from "@/lib/types";
import { signedUrl } from "@/lib/media";
import { type DrawBackground, renderScene } from "./render";

export function StrokeThumb({
  strokes,
  background,
  className = "",
}: {
  strokes: Stroke[];
  background: DrawBackground;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const css = canvas.getBoundingClientRect().width || 112;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, strokes, background, css, css);
  }, [strokes, background]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`block aspect-square w-full bg-white ${className}`}
    />
  );
}

export function DrawingThumb({
  drawing,
  className = "",
}: {
  drawing: Drawing;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (drawing.preview_path) {
      void signedUrl(drawing.preview_path).then((u) => {
        if (alive) setUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [drawing.preview_path]);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={drawing.caption ?? "Drawing"}
        className={`block aspect-square w-full bg-white object-cover ${className}`}
      />
    );
  }
  return (
    <StrokeThumb
      strokes={drawing.strokes ?? []}
      background={drawing.background}
      className={className}
    />
  );
}
