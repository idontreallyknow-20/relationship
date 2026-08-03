"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CoupleProvider } from "@/lib/couple-context";

// The whole app is the in-another-life screen now. Any other inner route
// (a restored tab, an old bookmark, a notification link) stays black and
// is sent to the counter, so nothing can appear over it.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const takeover = pathname !== "/another-life";

  useEffect(() => {
    if (takeover) router.replace("/another-life");
  }, [takeover, router]);

  return (
    <CoupleProvider>
      {takeover ? (
        <div className="fixed inset-0 z-[100] bg-black" aria-hidden="true" />
      ) : (
        children
      )}
    </CoupleProvider>
  );
}
