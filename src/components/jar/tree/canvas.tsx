"use client";

// A tree you can move around in.
//
// The old one was a horizontally scrolling strip of 116x72 rectangles. You
// could see about four of them at a time on a phone, there was no way out to
// look at the whole shape, and the only thing you could do with a node was buy
// it. Asked for directly: circular nodes, and being able to move around the
// tree and go down a path, the way Antimatter Dimensions does it.
//
// So: one SVG, one camera, and everything drawn in world coordinates. Drag to
// pan, pinch or wheel to zoom, and a button to fit the whole thing on screen.
// Tapping a node selects it rather than buying it, because a node is a circle
// forty pixels across on a phone and "I meant to read that, not spend eight
// hundred million hearts" is not a recoverable mistake. What you tapped is
// spelled out underneath with its own buy button.
//
// Generic over what is in it, because there are six of these trees: Cami's,
// Joseph's, the shared one, and the moon, star and drop trees, which were flat
// scrolling lists until this existed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Maximize2, Minus, Plus } from "lucide-react";
import { layoutGraph, type LayoutInput } from "./layout";
import { formatNumber } from "@/game/numbers";
import type { NumberFormat } from "@/game/numbers";

export interface TreeNodeView extends LayoutInput {
  name: string;
  /** One short line: what buying it does. */
  effect: string;
  description: string;
  level: number;
  max: number;
  cost: number;
  buyCount: number;
  currencyShort: string;
  /** The node's own colour, taken from the currency it is bought with. */
  colour: string;
  unlocked: boolean;
  affordable: boolean;
  lockReason?: string;
}

const COLUMN = 112;
const ROW = 124;
const RADIUS = 30;
const PADDING = 70;

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;

interface Camera {
  x: number;
  y: number;
  k: number;
}

function clampScale(k: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

/**
 * The arc for "level out of max", drawn clockwise from the top.
 *
 * A full circle cannot be expressed as a single arc (start and end coincide and
 * the renderer draws nothing), so anything at or past full is handed back as
 * two half circles.
 */
function ring(cx: number, cy: number, r: number, fraction: number): string {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return "";
  if (f >= 1) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} `
      + `A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
  }
  const angle = f * Math.PI * 2 - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y}`;
}

/** Names are drawn as SVG text, which does not wrap. Two lines, on a word. */
function wrap(name: string): string[] {
  if (name.length <= 13) return [name];
  const words = name.split(" ");
  if (words.length === 1) return [name.slice(0, 12) + "…"];
  const lines: string[] = ["", ""];
  let index = 0;
  for (const word of words) {
    if (index === 0 && lines[0] && (lines[0] + " " + word).length > 13) index = 1;
    lines[index] = lines[index] ? `${lines[index]} ${word}` : word;
  }
  return lines[1] ? lines : [lines[0]];
}

export function TreeCanvas({
  nodes,
  format,
  onBuy,
  reducedMotion,
  height = 420,
  label,
}: {
  nodes: TreeNodeView[];
  format: NumberFormat;
  onBuy: (id: string) => void;
  reducedMotion: boolean;
  height?: number;
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: height });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const fitted = useRef(false);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Positions only change when the set of nodes changes, not when a level does.
  const shape = useMemo(
    () => layoutGraph(nodes.map((n) => ({ id: n.id, after: n.after }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.map((n) => n.id).join("|")],
  );

  const world = useMemo(() => ({
    w: (shape.columns - 1) * COLUMN + PADDING * 2,
    h: (shape.rows - 1) * ROW + PADDING * 2,
  }), [shape]);

  const px = useCallback((x: number) => PADDING + x * COLUMN, []);
  const py = useCallback((y: number) => PADDING + y * ROW, []);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !world.w) return;
    const k = clampScale(Math.min(size.w / world.w, size.h / world.h));
    setCamera({ x: (size.w - world.w * k) / 2, y: (size.h - world.h * k) / 2, k });
  }, [size, world]);

  // Fit once, on the first real measurement. Refitting on every change would
  // undo the player's own panning every time they bought something.
  useEffect(() => {
    if (fitted.current || size.w <= 1) return;
    fitted.current = true;
    fit();
  }, [fit, size.w]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setCamera((c) => {
      const k = clampScale(c.k * factor);
      const scale = k / c.k;
      return { k, x: sx - (sx - c.x) * scale, y: sy - (sy - c.y) * scale };
    });
  }, []);

  /* --------------------------------------------------------------- */
  /* Pointers: one drags, two pinch                                   */
  /* --------------------------------------------------------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; cx: number; cy: number } | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged.current = false;
    if (pointers.current.size === 1) {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = wrapRef.current?.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - (rect?.left ?? 0);
      const cy = (a.y + b.y) / 2 - (rect?.top ?? 0);
      if (pinch.current && pinch.current.distance > 0) {
        zoomAt(distance / pinch.current.distance, cx, cy);
      }
      pinch.current = { distance, cx, cy };
      dragged.current = true;
      return;
    }

    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
    setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onWheel = (event: React.WheelEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(
      Math.exp(-event.deltaY * 0.0015),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  };

  const chosen = selected ? byId.get(selected) ?? null : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapRef}
        className="relative touch-none overflow-hidden rounded-card border border-line bg-cream"
        style={{ height }}
      >
        <svg
          width="100%"
          height="100%"
          role="application"
          aria-label={`${label}. Drag to move, pinch to zoom.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          style={{ cursor: "grab", touchAction: "none" }}
        >
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
            {/* Edges first, so the circles sit on top of them. */}
            <g fill="none" strokeLinecap="round">
              {shape.nodes.map((node) =>
                node.parents.map((parentId) => {
                  const parent = shape.byId.get(parentId);
                  if (!parent) return null;
                  const owned = (byId.get(node.id)?.level ?? 0) > 0;
                  const alive = owned && (byId.get(parentId)?.level ?? 0) > 0;
                  const x1 = px(parent.x);
                  const y1 = py(parent.y) + RADIUS;
                  const x2 = px(node.x);
                  const y2 = py(node.y) - RADIUS;
                  const mid = (y1 + y2) / 2;
                  return (
                    <path
                      key={`${parentId}->${node.id}`}
                      className={alive && !reducedMotion ? "branch-glow" : undefined}
                      d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                      stroke={owned ? "var(--color-rose-dark)" : "var(--color-line)"}
                      strokeWidth={owned ? 3 : 2}
                    />
                  );
                }),
              )}
            </g>

            {shape.nodes.map((placed) => {
              const node = byId.get(placed.id);
              if (!node) return null;
              const cx = px(placed.x);
              const cy = py(placed.y);
              const owned = node.level > 0;
              const atMax = node.max !== Infinity && node.level >= node.max;
              const fraction = node.max === Infinity
                ? Math.min(1, node.level / 100)
                : node.level / node.max;
              const isSelected = selected === node.id;

              const fill = !node.unlocked
                ? "var(--color-line-soft)"
                : owned
                  ? "#ffffff"
                  : node.affordable
                    ? "#ffffff"
                    : "var(--color-cream)";

              return (
                <g
                  key={node.id}
                  transform={`translate(${cx} ${cy})`}
                  style={{ cursor: "pointer" }}
                  onPointerUp={() => {
                    if (dragged.current) return;
                    setSelected(node.id);
                  }}
                >
                  {/* A ring that breathes when you can afford it. The single
                      most useful thing to see at a glance in a tree this size. */}
                  {node.affordable && !atMax && !reducedMotion && (
                    <circle r={RADIUS + 7} fill="none" stroke={node.colour} strokeWidth={2} opacity={0.5}>
                      <animate attributeName="r" values={`${RADIUS + 3};${RADIUS + 9};${RADIUS + 3}`} dur="2.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.55;0.1;0.55" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {isSelected && (
                    <circle r={RADIUS + 5} fill="none" stroke="var(--color-plum)" strokeWidth={2.5} />
                  )}

                  <circle
                    r={RADIUS}
                    fill={fill}
                    stroke={owned ? node.colour : "var(--color-line)"}
                    strokeWidth={owned ? 2.5 : 2}
                    opacity={node.unlocked ? 1 : 0.65}
                  />

                  {/* How far through this node's levels you are. */}
                  {owned && (
                    <path
                      d={ring(0, 0, RADIUS - 5, fraction)}
                      fill="none"
                      stroke={node.colour}
                      strokeWidth={4}
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  )}

                  {!node.unlocked ? (
                    <g transform="translate(-8 -8)" opacity={0.75}>
                      <Lock className="h-4 w-4 text-berry-soft" />
                    </g>
                  ) : (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-display"
                      fontSize={atMax ? 13 : 17}
                      fontWeight={700}
                      fill={owned ? "var(--color-berry)" : "var(--color-berry-soft)"}
                    >
                      {atMax ? "MAX" : node.level}
                    </text>
                  )}

                  {wrap(node.name).map((line, i) => (
                    <text
                      key={i}
                      y={RADIUS + 16 + i * 12}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--color-berry)"
                      opacity={node.unlocked ? 1 : 0.6}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-2 right-2 flex flex-col gap-1">
          {[
            { icon: Plus, label: "Zoom in", act: () => zoomAt(1.3, size.w / 2, size.h / 2) },
            { icon: Minus, label: "Zoom out", act: () => zoomAt(1 / 1.3, size.w / 2, size.h / 2) },
            { icon: Maximize2, label: "Fit the whole tree", act: fit },
          ].map(({ icon: Icon, label: name, act }) => (
            <button
              key={name}
              type="button"
              onClick={act}
              aria-label={name}
              title={name}
              className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/90 text-berry shadow-soft"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* What you tapped, spelled out. The tree itself has room for a number
          and a name; everything else belongs here. */}
      {chosen ? (
        <div className="rounded-card border border-line bg-white p-3 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight text-plum">{chosen.name}</p>
              <p className="text-sm text-berry-soft">{chosen.description}</p>
            </div>
            <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-berry-soft">
              {chosen.max === Infinity ? chosen.level : `${chosen.level} / ${chosen.max}`}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-rose-deep">{chosen.effect}</p>
            {chosen.max !== Infinity && chosen.level >= chosen.max ? (
              <span className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-berry-soft">Maxed</span>
            ) : !chosen.unlocked ? (
              <span className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-berry-soft">
                {chosen.lockReason ?? "Not yet"}
              </span>
            ) : (
              <button
                type="button"
                disabled={!chosen.affordable}
                onClick={() => onBuy(chosen.id)}
                className={`pressable shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${
                  chosen.affordable ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                }`}
              >
                {formatNumber(chosen.cost, format)} {chosen.currencyShort}
                {chosen.buyCount > 1 ? ` x${chosen.buyCount}` : ""}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="px-1 text-xs text-berry-soft">
          Drag to move around. Pinch or scroll to zoom. Tap a circle to read it.
        </p>
      )}
    </div>
  );
}
