import type { NextConfig } from "next";

const SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co").origin;
const SUPABASE_WS = SUPABASE_ORIGIN.replace("https://", "wss://");

// Strict-but-workable CSP: no third-party scripts at all. 'unsafe-inline'
// is required by Next.js hydration inline scripts and Tailwind inline styles.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS}`,
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  `media-src 'self' blob: ${SUPABASE_ORIGIN}`,
  "font-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
