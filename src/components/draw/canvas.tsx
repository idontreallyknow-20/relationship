"use client";

// Touch-first drawing surface. Captures pointer input (finger, stylus,
// mouse), draws the in-progress stroke live, and reports each completed
// stroke normalized to 0..1 coordinates.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke } from "@/lib/types";
import {
  type DrawBackground,
  renderScene,
  strokeColor,
  strokeWidth,
} from "./render";

interface Tool {
  color: string;
  size: number;
  erase: boolean;
}

const MIN_POINT_DISTANCE = 0.004; // normalized; skips jittery duplicates
const MAX_POINTS = 2000;

export function DrawCanvas({
  strokes,
  background,
  tool,
  onStroke,
  disabled = false,
}: {
  strokes: Stroke[];
  background: DrawBackground;
  tool: Tool;
  onStroke: (stroke: Stroke) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssSize, setCssSize] = useState(0);

  // In-progress stroke, kept in refs so drawing never re-renders React.
  const activePointer = useRef<number | null>(null);
  const activeStroke = useRef<Stroke | null>(null);

  // Track the container width; the canvas is square.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCssSize(Math.round(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Repaint whenever size, strokes, or background change. The backing
  // store follows devicePixelRatio so lines stay crisp on retina screens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssSize === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(cssSize * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, strokes, background, cssSize, cssSize);
    // Repaint the stroke currently under the finger, if any.
    const live = activeStroke.current;
    if (live) {
      for (let i = 1; i < live.points.length; i++) {
        paintSegment(ctx, live, live.points[i - 1], live.points[i], cssSize);
      }
    }
  }, [strokes, background, cssSize]);

  const pointFromEvent = useCallback((e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    // Keep stored payloads small.
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  }, []);

  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || activePointer.current !== null) return;
      // Only the primary mouse button draws; fingers and pens always do.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointer.current = e.pointerId;
      activeStroke.current = {
        color: tool.color,
        size: tool.size,
        ...(tool.erase ? { erase: true } : {}),
        points: [pointFromEvent(e)],
      };
    },
    [disabled, tool, pointFromEvent],
  );

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStroke.current;
      if (!stroke || e.pointerId !== activePointer.current) return;
      e.preventDefault();
      if (stroke.points.length >= MAX_POINTS) return;
      const pt = pointFromEvent(e);
      const prev = stroke.points[stroke.points.length - 1];
      const dx = pt[0] - prev[0];
      const dy = pt[1] - prev[1];
      if (Math.hypot(dx, dy) < MIN_POINT_DISTANCE) return;
      stroke.points.push(pt);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && cssSize > 0) paintSegment(ctx, stroke, prev, pt, cssSize);
    },
    [pointFromEvent, cssSize],
  );

  const handleUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStroke.current;
      if (!stroke || e.pointerId !== activePointer.current) return;
      e.preventDefault();
      activePointer.current = null;
      activeStroke.current = null;
      onStroke(stroke);
    },
    [onStroke],
  );

  const handleCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointer.current) return;
      // Treat a cancel like a finished stroke so ink is never lost mid-line.
      handleUp(e);
    },
    [handleUp],
  );

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="touch-draw block w-full rounded-card border border-line bg-white shadow-soft"
        style={{ height: cssSize > 0 ? cssSize : undefined, aspectRatio: "1 / 1" }}
        aria-label="Drawing canvas"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

/** Fast segment paint for the in-progress stroke (smoothed on commit). */
function paintSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  from: [number, number],
  to: [number, number],
  size: number,
): void {
  ctx.strokeStyle = strokeColor(stroke);
  ctx.lineWidth = strokeWidth(stroke, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from[0] * size, from[1] * size);
  ctx.lineTo(to[0] * size, to[1] * size);
  ctx.stroke();
}
