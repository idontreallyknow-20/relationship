import { HeartIcon } from "@/components/hearts";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <HeartIcon className="h-10 w-10 text-blush-deep" />
      <h1 className="font-display text-3xl font-semibold text-plum">You are offline</h1>
      <p className="max-w-xs text-berry-soft">
        Your little world needs a connection. Anything you were writing is kept
        as a draft and will be here when you are back.
      </p>
    </main>
  );
}
