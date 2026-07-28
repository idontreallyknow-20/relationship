"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { HeartSpinner } from "@/components/hearts";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // A rejection here used to leave the root route on a spinner forever with
    // no retry and no way out. `getSession` reads localStorage but can still
    // reject while refreshing an expired token with no connection, and this is
    // the first thing the app does. Sending an unknown session to the welcome
    // screen is right: it is the one screen that can recover from either
    // answer.
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        router.replace(data.session ? "/home" : "/welcome");
      })
      .catch(() => router.replace("/welcome"));
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <HeartSpinner />
    </main>
  );
}
