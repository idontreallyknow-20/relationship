import { createClient, SupabaseClient } from "@supabase/supabase-js";

// One browser-wide client. Sessions persist in localStorage and refresh
// automatically, so a paired device stays signed in.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        realtime: { params: { eventsPerSecond: 12 } },
      },
    );
  }
  return client;
}
