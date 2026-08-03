"use client";

import { CoupleProvider } from "@/lib/couple-context";
import { ToastProvider } from "@/components/ui";
import { BottomNav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CoupleProvider>
      <ToastProvider>
        <div
          className="mx-auto flex w-full max-w-lg flex-1 flex-col"
          style={{ paddingBottom: "calc(4.5rem + var(--safe-bottom))" }}
        >
          {children}
        </div>
        <BottomNav />
      </ToastProvider>
    </CoupleProvider>
  );
}
