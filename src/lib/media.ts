import { supabase } from "./supabase";
import type { Person } from "./types";

export type MediaFolder = "chat" | "memories" | "drawings" | "avatars" | "voice" | "attachments";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"]);

export function validateUpload(file: Blob, kind: "image" | "video" | "audio"): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is larger than 50 MB.";
  const allowed = kind === "image" ? IMAGE_TYPES : kind === "video" ? VIDEO_TYPES : AUDIO_TYPES;
  const base = (file.type || "").split(";")[0];
  if (!allowed.has(base)) return "That file type is not supported.";
  return null;
}

/** Downscale and recompress an image before upload. Keeps GIFs untouched. */
export async function compressImage(
  file: File,
  maxDimension = 1800,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.type === "image/gif") {
    return { blob: file, width: 0, height: 0 };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) return { blob: file, width, height };
  // If recompression somehow grew the file, keep the original.
  return blob.size < file.size
    ? { blob, width, height }
    : { blob: file, width, height };
}

function extensionFor(mime: string): string {
  const base = mime.split(";")[0];
  switch (base) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "video/mp4": return "mp4";
    case "video/webm": return "webm";
    case "video/quicktime": return "mov";
    case "audio/webm": return "weba";
    case "audio/mp4": return "m4a";
    case "audio/mpeg": return "mp3";
    case "audio/ogg": return "ogg";
    case "audio/wav": return "wav";
    default: return "bin";
  }
}

/** Upload to the private media bucket; returns the storage path. */
export async function uploadMedia(
  folder: MediaFolder,
  person: Person,
  blob: Blob,
): Promise<string> {
  const ext = extensionFor(blob.type || "application/octet-stream");
  const path = `${folder}/${person}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase()
    .storage.from("media")
    .upload(path, blob, { contentType: blob.type || undefined, upsert: false });
  if (error) throw new Error("upload_failed");
  return path;
}

// Signed URLs are cached briefly so lists render without hammering storage.
const urlCache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(path: string, ttlSeconds = 3600): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now() + 30_000) return cached.url;
  const { data, error } = await supabase()
    .storage.from("media")
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + ttlSeconds * 1000 });
  return data.signedUrl;
}

export async function deleteMedia(path: string): Promise<void> {
  await supabase().storage.from("media").remove([path]);
  urlCache.delete(path);
}
