// Pure canvas rendering for drawings. Strokes are stored normalized to
// 0..1 coordinates and sizes are fractions of the canvas width, so both
// phones (and the exported PNG) render identically at any pixel size.

import type { Stroke, Drawing } from "@/lib/types";

export type DrawBackground = Drawing["background"];

/** Light guide-line color used for lined and grid backgrounds. */
export const GUIDE_COLOR = "#ECDAE1";

/** The limited app palette, plus white for corrections. */
export const PALETTE: { color: string; name: string }[] = [
  { color: "#43273B", name: "Berry" },
  { color: "#5A3D66", name: "Plum" },
  { color: "#8F4560", name: "Deep rose" },
  { color: "#C28092", name: "Rose" },
  { color: "#7C6BA8", name: "Lavender" },
  { color: "#3E7D5B", name: "Green" },
  { color: "#FFFFFF", name: "White" },
];

/** Pen widths as a fraction of canvas width: fine, regular, bold. */
export const PEN_SIZES: { size: number; name: string }[] = [
  { size: 0.008, name: "Fine" },
  { size: 0.016, name: "Regular" },
  { size: 0.03, name: "Bold" },
];

/** Pixel width of a stroke at a given canvas width. Erase is 2x. */
export function strokeWidth(stroke: Pick<Stroke, "size" | "erase">, width: number): number {
  return Math.max(1, stroke.size * width * (stroke.erase ? 2 : 1));
}

export function strokeColor(stroke: Pick<Stroke, "color" | "erase">): string {
  return stroke.erase ? "#FFFFFF" : stroke.color;
}

/** White fill plus the optional lined or grid guides. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: DrawBackground,
): void {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  if (background === "plain") return;

  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = Math.max(1, width / 420);
  const step = width / 12;
  ctx.beginPath();
  for (let y = step; y < height - 1; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  if (background === "grid") {
    for (let x = step; x < width - 1; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
  }
  ctx.stroke();
}

/** Draw one complete stroke with midpoint smoothing. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
): void {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;
  const lw = strokeWidth(stroke, width);
  ctx.strokeStyle = strokeColor(stroke);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;

  if (pts.length === 1) {
    // A tap becomes a dot.
    ctx.beginPath();
    ctx.arc(pts[0][0] * width, pts[0][1] * height, lw / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0][0] * width, pts[0][1] * height);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = ((pts[i][0] + pts[i + 1][0]) / 2) * width;
    const midY = ((pts[i][1] + pts[i + 1][1]) / 2) * height;
    ctx.quadraticCurveTo(pts[i][0] * width, pts[i][1] * height, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0] * width, last[1] * height);
  ctx.stroke();
}

/** Full scene: background then every stroke in order. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  background: DrawBackground,
  width: number,
  height: number,
): void {
  drawBackground(ctx, width, height, background);
  for (const stroke of strokes) drawStroke(ctx, stroke, width, height);
}

/** Render the final drawing to a PNG blob on a white background. */
export function renderPngBlob(
  strokes: Stroke[],
  background: DrawBackground,
  size = 1024,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas_unavailable"));
  renderScene(ctx, strokes, background, size, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("png_failed"))),
      "image/png",
    );
  });
}
