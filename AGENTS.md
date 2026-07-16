# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices. Key ones already in effect here: async `params`/`searchParams`,
Turbopack by default, `app/manifest.ts` for the PWA manifest, `viewport`
export for theme color, no `eslint` key in next.config.

# Project conventions

- Private two-person couples app; see README.md for architecture.
- All pages are client components using the shared Supabase browser client
  (`src/lib/supabase.ts`) and the `CoupleProvider` context.
- Design rules: no emojis, no em dashes in UI copy, no gradients. Palette and
  utilities are defined in `src/app/globals.css` (@theme tokens). Headings
  use `font-display`, hearts are the recurring motif (`src/components/hearts.tsx`).
- Database schema and RLS: `supabase/migrations/`. Edge functions:
  `supabase/functions/` (Deno, excluded from tsconfig).
- Never put service-role keys or private secrets in this repo or the
  frontend. The only env vars are the public ones in `.env.example`.
