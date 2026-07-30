import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { Breakup } from "@/components/breakup";
import { SwRegister } from "@/components/sw-register";

const display = Cormorant_Garamond({
  variable: "--font-display-src",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Nunito_Sans({
  variable: "--font-sans-src",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "maybe in another life",
  description: "It's over",
  applicationName: "maybe in another life",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "maybe in another life",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Every route now ends at the same screen. The routed children are
// deliberately not rendered: the rest of the app is still in the repo, just
// no longer reachable.
export default function RootLayout() {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Breakup />
        <SwRegister />
      </body>
    </html>
  );
}
