// Public client configuration. These values are safe to publish: the anon
// key only grants access that Row Level Security allows, and the VAPID key
// is the public half of the push keypair. Environment variables override
// them when set, but the app works with no deployment configuration at all.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vahhsjtxhjddohtgqtaj.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhaGhzanR4aGpkZG9odGdxdGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNTg0MzEsImV4cCI6MjA5NDYzNDQzMX0.SDDmEnGyqdeQGE5h25InmW3KtUOjWDmwfjOyis8Lopo";

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BAMXgBLjaVnZOXO63Zww6yQQwNLTvupNNyJNMMoGLqrqEHSV4pAhL3XYjJyfy8fRJjjDfjdBzDDRA9zRYfHE8NU";
