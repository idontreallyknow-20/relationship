// A link that does not go anywhere.
//
// Rare in an app with no public URLs, but an old push notification or a stale
// Home Screen shortcut can point at a route that has since been renamed, and
// the default is a bare framework page with no way back into the app.

import Link from "next/link";
import { Card } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Card className="w-full max-w-sm space-y-4 p-6 text-center">
        <HeartIcon className="mx-auto h-8 w-8 text-rose" />
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-plum">
            Nothing here
          </h1>
          <p className="text-sm text-berry-soft">
            This link does not lead anywhere in your little world.
          </p>
        </div>
        <Link href="/home" className="text-sm font-semibold text-rose-dark underline">
          Go home
        </Link>
      </Card>
    </main>
  );
}
