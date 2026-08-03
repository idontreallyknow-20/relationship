"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        router.replace(data.session ? "/another-life" : "/welcome");
      });
  }, [router]);

  // Stay black while deciding where to go, so the app never flashes cream.
  return <main className="min-h-dvh bg-black" />;
}
