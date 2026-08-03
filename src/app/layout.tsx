import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Nunito_Sans } from "next/font/google";
import "./globals.css";
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
  title: "Cami & Joseph",
  description: "Our little world",
  applicationName: "Cami & Joseph",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Cami & Joseph",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
