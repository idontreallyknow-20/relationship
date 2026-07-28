"use client";

// Invite redemption. The token travels in the URL fragment (never sent to
// any server or logged) and is exchanged exactly once for a session. After
// pairing, the guided install and notification steps run.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { redeemInvite, pairingErrorMessage } from "@/lib/pairing";
import { displayName, type Person } from "@/lib/types";
import { Button, Card } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { InstallGuide, isEmbeddedBrowser } from "@/components/install-guide";
import { isIos, isStandalone } from "@/lib/push";

type Stage = "checking" | "embedded" | "ready" | "working" | "done" | "error" | "already";

export default function InvitePage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [error, setError] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const token = useRef<string>("");

  useEffect(() => {
    // Accept both /invite#token and /invite?t=token forms.
    const hash = window.location.hash.replace(/^#/, "");
    const query = new URLSearchParams(window.location.search).get("t") ?? "";
    token.current = hash || query;

    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setStage("already");
          return;
        }
        if (!token.current) {
          setError("This invite link is missing its code. Ask for a fresh link.");
          setStage("error");
          return;
        }
        if (isEmbeddedBrowser()) {
          setStage("embedded");
          return;
        }
        setStage("ready");
      })
      // Without this, a rejection left the page on "checking" forever. The
      // token is in the URL and redeeming it is what actually needs the
      // network, so falling through to the button is both recoverable and
      // honest: it fails with a message instead of never failing at all.
      .catch(() => {
        if (!token.current) {
          setError("This invite link is missing its code. Ask for a fresh link.");
          setStage("error");
          return;
        }
        setStage(isEmbeddedBrowser() ? "embedded" : "ready");
      });
  }, []);

  const pair = async () => {
    setStage("working");
    try {
      const p = await redeemInvite(token.current);
      // Scrub the token from the address bar and history.
      window.history.replaceState(null, "", "/invite");
      setPerson(p);
      setStage("done");
    } catch (err) {
      setError(pairingErrorMessage((err as Error).message));
      setStage("error");
    }
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-10"
      style={{ paddingTop: "calc(2.5rem + var(--safe-top))", paddingBottom: "calc(2.5rem + var(--safe-bottom))" }}
    >
      <div className="mb-6 text-center">
        <HeartIcon className="mx-auto h-8 w-8 text-rose-deep" />
        <h1 className="mt-3 font-display text-4xl font-semibold text-plum">
          Cami &amp; Joseph
        </h1>
        <p className="mt-1 text-berry-soft">Our little world</p>
      </div>

      {stage === "checking" && <HeartSpinner />}

      {stage === "embedded" && (
        <div className="space-y-4">
          {/* No person is known yet; this branch runs before pairing. The
              guide used to be handed "cami" outright, which is the value
              `enablePush` writes to the row's person column. */}
          <InstallGuide person={null} />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setStage("ready")}
          >
            I opened it in my browser, continue here anyway
          </Button>
        </div>
      )}

      {stage === "ready" && (
        <Card className="space-y-4 p-6 text-center">
          <p className="font-display text-2xl font-semibold text-berry">
            You have been invited
          </p>
          <p className="text-sm text-berry-soft">
            This private link pairs this device to your shared space. It works
            exactly once, on this device.
          </p>
          <Button size="lg" className="w-full" onClick={pair}>
            Pair this device
          </Button>
        </Card>
      )}

      {stage === "working" && <HeartSpinner label="Pairing" />}

      {stage === "done" && person && (
        <div className="space-y-4">
          <Card className="p-6 text-center">
            <p className="font-display text-2xl font-semibold text-success">
              Welcome, {displayName(person)}
            </p>
            <p className="mt-1 text-sm text-berry-soft">
              This device is paired and will stay signed in.
            </p>
          </Card>
          {/* `InstallGuide` decides for itself whether there is anything to
              show, so the branch here was the same component with the same
              props on both sides of the question. */}
          <InstallGuide person={person} onDone={() => router.replace("/home")} />
        </div>
      )}

      {stage === "already" && (
        <Card className="space-y-4 p-6 text-center">
          <p className="font-display text-xl font-semibold text-berry">
            This device is already paired
          </p>
          <Button size="lg" className="w-full" onClick={() => router.replace("/home")}>
            Open our little world
          </Button>
        </Card>
      )}

      {stage === "error" && (
        <Card className="space-y-4 p-6 text-center">
          <p className="font-display text-xl font-semibold text-danger">
            This link did not work
          </p>
          <p className="text-sm text-berry-soft">{error}</p>
          <Button variant="secondary" className="w-full" onClick={() => router.replace("/welcome")}>
            Go to the welcome screen
          </Button>
        </Card>
      )}
    </main>
  );
}
