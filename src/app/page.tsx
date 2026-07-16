"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { HeartSpinner } from "@/components/hearts";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        router.replace(data.session ? "/home" : "/welcome");
      });
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <HeartSpinner />
    </main>
  );
}
