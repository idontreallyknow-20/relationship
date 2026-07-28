"use client";

// What happens when a screen throws.
//
// Until this file existed, nothing did: there was no error boundary anywhere in
// the app, so a render-time throw on any screen produced the framework's own
// overlay in development and a blank page in production. In a browser that is
// recoverable, because there is a back button and an address bar. Installed to
// the Home Screen there is neither, and a blank page is the end of the session.
//
// So: say what happened in one sentence, offer the two things that actually
// recover (try again, go home), and keep the shape of the rest of the app so it
// does not read as the app having been replaced by something else.

import { useEffect } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // There is no error reporting service in this app and deliberately so, but
    // the console is worth having when one of the two of you can read it.
    console.error("Screen failed to render", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Card className="w-full max-w-sm space-y-4 p-6 text-center">
        <HeartIcon className="mx-auto h-8 w-8 text-rose" />
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-plum">
            Something went wrong
          </h1>
          <p className="text-sm text-berry-soft">
            This screen could not open. Nothing you have saved is affected.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/home" className="text-sm font-semibold text-rose-dark underline">
            Go home
          </Link>
        </div>
      </Card>
    </main>
  );
}
