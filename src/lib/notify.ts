import { supabase } from "./supabase";

// "note" is the only category the server still accepts; the rest remain in
// the type so the hidden legacy screens keep compiling.
export type NotifyCategory =
  | "note"
  | "messages" | "drawings" | "moods" | "thinking_of_you" | "questions"
  | "answers" | "letters" | "events" | "milestones" | "arrivals" | "plans";

/**
 * Ask the server to push a notification to the partner. The server enforces
 * preferences, quiet hours, private previews, and deduplication; failures
 * are silent because notifications are best-effort.
 */
export async function notifyPartner(
  category: NotifyCategory,
  dedupeKey: string,
  detail?: { title?: string; body?: string; url?: string },
): Promise<void> {
  try {
    await supabase().functions.invoke("notify", {
      body: { category, dedupe_key: dedupeKey, ...detail },
    });
  } catch {
    // Best effort only.
  }
}
