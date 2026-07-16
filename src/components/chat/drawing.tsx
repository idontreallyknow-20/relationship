"use client";

// Drawing message body: preview image when available, otherwise the strokes
// rendered onto a small canvas, plus a link to keep drawing together.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Drawing } from "@/lib/types";
import { HeartIcon } from "@/components/hearts";
import { useSignedUrl, type ChatMessage } from "./helpers";

const CANVAS_W = 448;
const CANVAS_H = 336;

function StrokeCanvas({ drawing }: { drawing: Drawing }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of drawing.strokes ?? []) {
      if (!stroke.points?.length) continue;
      ctx.strokeStyle = stroke.erase ? "#FFFFFF" : stroke.color;
      // Stroke sizes were chosen on a full canvas; scale them down gently.
      ctx.lineWidth = Math.max(1, stroke.size * (CANVAS_W / 400));
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => {
        const px = x * CANVAS_W;
        const py = y * CANVAS_H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0];
        ctx.lineTo(x * CANVAS_W + 0.5, y * CANVAS_H + 0.5);
      }
      ctx.stroke();
    }
  }, [drawing]);

  return (
    <canvas
      ref={ref}
      width={CANVAS_W}
      height={CANVAS_H}
      className="h-full w-full"
      aria-label="Drawing preview"
    />
  );
}

export function DrawingBody({ m, own }: { m: ChatMessage; own: boolean }) {
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [missing, setMissing] = useState(false);
  const previewUrl = useSignedUrl(drawing?.preview_path);

  useEffect(() => {
    let active = true;
    if (!m.drawing_id) {
      setMissing(true);
      return;
    }
    void supabase()
      .from("drawings")
      .select("*")
      .eq("id", m.drawing_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) setDrawing(data as Drawing);
        else setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [m.drawing_id]);

  return (
    <div className="w-60 max-w-full">
      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-line bg-white"
        style={{ aspectRatio: "4 / 3" }}
      >
        {missing ? (
          <p className="px-3 text-center text-xs text-berry-soft">
            This drawing is no longer available.
          </p>
        ) : !drawing ? (
          <HeartIcon className="heart-pulse h-6 w-6 text-rose/70" />
        ) : drawing.preview_path ? (
          previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="Drawing" className="h-full w-full object-cover" />
          ) : (
            <HeartIcon className="heart-pulse h-6 w-6 text-rose/70" />
          )
        ) : (
          <StrokeCanvas drawing={drawing} />
        )}
      </div>
      {drawing?.caption && (
        <p className={`mt-1 px-0.5 text-sm ${own ? "text-white/90" : "text-berry"}`}>
          {drawing.caption}
        </p>
      )}
      {m.drawing_id && !missing && (
        <Link
          href={`/draw?id=${m.drawing_id}`}
          className={`pressable mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs font-semibold ${
            own ? "bg-white/15 text-white" : "bg-blush text-rose-dark"
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Continue drawing
        </Link>
      )}
    </div>
  );
}
