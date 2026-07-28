"use client";

import { usePathname } from "next/navigation";
import { CoupleProvider } from "@/lib/couple-context";
import { OfflineProvider } from "@/lib/offline/provider";
import { ToastProvider } from "@/components/ui";
import { BottomNav } from "@/components/nav";

/**
 * Screens that are worth more than a phone's width on a desktop.
 *
 * Everything else stays a centred column on purpose: chat, memories, letters
 * and questions are reading-shaped, and a line of text five hundred pixels
 * wider is a line of text that is harder to read. The jar is the exception
 * because it is the one screen with two things to look at, a tree and the
 * panel describing what you tapped, and on a wide window they belong side by
 * side rather than stacked with one of them off the bottom of the screen.
 */
const WIDE = ["/jar"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = WIDE.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  return (
    <OfflineProvider>
      <CoupleProvider>
        <ToastProvider>
          <div
            className={`mx-auto flex w-full flex-1 flex-col ${wide ? "max-w-lg lg:max-w-6xl" : "max-w-lg"}`}
            style={{ paddingBottom: "calc(4.5rem + var(--safe-bottom))" }}
          >
            {children}
          </div>
          <BottomNav />
        </ToastProvider>
      </CoupleProvider>
    </OfflineProvider>
  );
}
