import Link from "next/link";
import { HeartIcon } from "@/components/hearts";

// The last resort screen. It only appears when a page was never cached; every
// page you have already opened still works with no connection, so the links
// here go straight back into the app rather than leaving you stuck.

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <HeartIcon className="h-10 w-10 text-blush-deep" />
      <h1 className="font-display text-3xl font-semibold text-plum">No connection</h1>
      <p className="max-w-xs text-berry-soft">
        This page has not been opened on this device yet, so there is nothing saved
        to show. Everything you have already visited still works, and anything you
        write is kept here until you are back.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/home"
          className="pressable rounded-full bg-rose-dark px-5 py-2.5 font-semibold text-white"
        >
          Go home
        </Link>
        <Link
          href="/jar"
          className="pressable rounded-full bg-blush px-5 py-2.5 font-semibold text-rose-dark"
        >
          Play the Love Jar
        </Link>
      </div>
    </main>
  );
}
