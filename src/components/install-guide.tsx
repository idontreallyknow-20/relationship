"use client";

// Install and notification onboarding, shared by the invite page and the
// home screen reminder. Handles the iPhone add-to-home-screen tutorial,
// the Android install prompt, and the explicit notification button.

import { useEffect, useState } from "react";
import { Bell, Plus, Share, SquarePlus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { enablePush, isIos, isStandalone, pushAvailableNow, pushStatus } from "@/lib/push";
import type { Person } from "@/lib/types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

/** True when the current browser is an in-app webview that cannot install. */
export function isEmbeddedBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|Instagram|Line\/|Snapchat|GSA\/|Twitter|TikTok|Messenger/i.test(
    navigator.userAgent,
  );
}

/**
 * `person` is null before pairing, when the guide is shown to explain how to
 * move out of an embedded browser and nobody has said who they are yet. Push
 * cannot be enabled without one, because `enablePush` writes it to the
 * subscription row; the invite page used to pass "cami" outright rather than
 * admit it did not know.
 */
export function InstallGuide({ person, onDone }: { person: Person | null; onDone?: () => void }) {
  const [installed, setInstalled] = useState(false);
  const [notifState, setNotifState] = useState<string>("default");

  useEffect(() => {
    setInstalled(isStandalone());
    setNotifState(pushStatus());
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  const ios = isIos();
  const embedded = isEmbeddedBrowser();

  if (embedded) {
    return (
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-plum">
          First, open this in your real browser
        </h2>
        <p className="text-sm text-berry-soft">
          This link opened inside another app, which cannot install your little
          world. It only takes a moment to move over:
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-berry">
          <li>
            Tap the three dots or share icon in the corner of this screen
          </li>
          <li>{ios ? "Choose Open in Safari" : "Choose Open in Chrome or Open in browser"}</li>
          <li>Then come right back to these steps</li>
        </ol>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!installed && ios && (
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-plum">
            Add it to your Home Screen
          </h2>
          <p className="text-sm text-berry-soft">
            Installing keeps you signed in and lets notifications through. In
            Safari:
          </p>
          <ol className="space-y-3 text-sm text-berry">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender text-plum">
                <Share className="h-4.5 w-4.5" />
              </span>
              Tap the Share button at the bottom of Safari
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender text-plum">
                <SquarePlus className="h-4.5 w-4.5" />
              </span>
              Scroll down and tap Add to Home Screen
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender text-plum">
                <Plus className="h-4.5 w-4.5" />
              </span>
              Tap Add, then open the new heart icon on your Home Screen
            </li>
          </ol>
        </Card>
      )}

      {!installed && !ios && (
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-plum">Install the app</h2>
          <p className="text-sm text-berry-soft">
            Installing adds the app to your phone so it opens full screen and
            stays signed in.
          </p>
          <Button
            onClick={async () => {
              if (deferredPrompt) {
                await deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice.outcome === "accepted") setInstalled(true);
                deferredPrompt = null;
              }
            }}
          >
            Install now
          </Button>
          <p className="text-xs text-berry-soft">
            If nothing happens, open your browser menu and choose Add to Home
            screen or Install app.
          </p>
        </Card>
      )}

      {(installed || !ios) && notifState !== "granted" && (
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-plum">
            Turn on notifications
          </h2>
          <p className="text-sm text-berry-soft">
            Get a gentle nudge for new messages, letters, and thinking-of-you
            moments. Nothing private ever shows on your lock screen.
          </p>
          {pushAvailableNow() && person ? (
            <Button
              onClick={async () => {
                const ok = await enablePush(person);
                setNotifState(ok ? "granted" : pushStatus());
              }}
            >
              <Bell className="h-4 w-4" />
              Enable notifications
            </Button>
          ) : (
            <p className="text-sm text-berry-soft">
              {ios
                ? "Install the app first, then enable notifications from Settings inside the app."
                : "Notifications are not available in this browser."}
            </p>
          )}
          {notifState === "denied" && (
            <p className="text-xs text-danger">
              Notifications are blocked in your device settings. You can allow
              them later under Settings for this app.
            </p>
          )}
        </Card>
      )}

      {notifState === "granted" && (
        <Card>
          <p className="text-sm font-semibold text-success">Notifications are on.</p>
        </Card>
      )}

      {onDone && (
        <Button size="lg" className="w-full" onClick={onDone}>
          Open our little world
        </Button>
      )}
    </div>
  );
}
