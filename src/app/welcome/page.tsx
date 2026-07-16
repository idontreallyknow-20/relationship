"use client";

// The front door: "Who are you?" with the two profiles. Selecting a name is
// part of the experience, not the security; pairing requires an invite link
// or that person's PIN.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { pinLogin, pairingErrorMessage } from "@/lib/pairing";
import { displayName, type Person } from "@/lib/types";
import { Button, Card } from "@/components/ui";
import { HeartIcon, HeartDivider, HeartSpinner } from "@/components/hearts";

function ProfileChoice({
  person,
  onPick,
}: {
  person: Person;
  onPick: (p: Person) => void;
}) {
  const tint = person === "cami" ? "bg-blush" : "bg-lavender";
  return (
    <button
      onClick={() => onPick(person)}
      className="pressable flex flex-1 flex-col items-center gap-3 rounded-card border border-line bg-white px-4 py-8 shadow-soft hover:shadow-lift"
    >
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full ${tint} font-display text-4xl font-semibold text-plum`}
      >
        {displayName(person).charAt(0)}
      </span>
      <span className="font-display text-2xl font-semibold text-berry">
        {displayName(person)}
      </span>
    </button>
  );
}

function PinPad({
  person,
  onBack,
}: {
  person: Person;
  onBack: () => void;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pinLogin(person, pin);
      router.replace("/home");
    } catch (err) {
      setError(pairingErrorMessage((err as Error).message));
      setPin("");
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    if (d === "back") setPin((p) => p.slice(0, -1));
    else if (pin.length < 8) setPin((p) => p + d);
  };

  return (
    <Card className="mx-auto w-full max-w-sm space-y-5 p-6">
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-plum">
          Hi {displayName(person)}
        </p>
        <p className="mt-1 text-sm text-berry-soft">Enter your PIN to unlock</p>
      </div>

      <div className="flex justify-center gap-2.5" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <HeartIcon
            key={i}
            className={`h-4 w-4 ${i < pin.length ? "text-rose-deep" : "text-line"}`}
            filled={i < pin.length}
          />
        ))}
      </div>

      {error && <p className="text-center text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              aria-label={key === "back" ? "Delete digit" : key}
              onClick={() => press(key)}
              className="pressable mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream text-xl font-semibold text-berry hover:bg-blush"
            >
              {key === "back" ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <path d="m18 9-6 6M12 9l6 6" />
                </svg>
              ) : (
                key
              )}
            </button>
          ),
        )}
      </div>

      <Button className="w-full" size="lg" loading={busy} disabled={pin.length < 4} onClick={submit}>
        Unlock
      </Button>
      <button className="w-full text-center text-sm text-berry-soft underline" onClick={onBack}>
        Not {displayName(person)}? Go back
      </button>
    </Card>
  );
}

function WelcomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const revoked = params.get("revoked") === "1";
  const [picked, setPicked] = useState<Person | null>(null);
  const [pinReady, setPinReady] = useState<Record<Person, boolean>>({ cami: false, joseph: false });
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        router.replace("/home");
        return;
      }
      const [cami, joseph] = await Promise.all([
        sb.rpc("pin_available", { p: "cami" }),
        sb.rpc("pin_available", { p: "joseph" }),
      ]);
      setPinReady({ cami: cami.data === true, joseph: joseph.data === true });
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <HeartSpinner />
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12"
      style={{ paddingTop: "calc(3rem + var(--safe-top))", paddingBottom: "calc(3rem + var(--safe-bottom))" }}
    >
      <div className="text-center">
        <HeartIcon className="mx-auto h-8 w-8 text-rose-deep" />
        <h1 className="mt-3 font-display text-5xl font-semibold text-plum">
          Cami &amp; Joseph
        </h1>
        <p className="mt-2 text-berry-soft">Our little world</p>
      </div>

      {revoked && (
        <Card className="mt-6 border-danger/40">
          <p className="text-sm text-danger">
            This device was signed out. Pair it again with an invite link or
            your PIN.
          </p>
        </Card>
      )}

      <HeartDivider />

      {picked === null ? (
        <>
          <h2 className="mb-4 text-center font-display text-2xl font-semibold text-berry">
            Who are you?
          </h2>
          <div className="flex gap-4">
            <ProfileChoice person="cami" onPick={setPicked} />
            <ProfileChoice person="joseph" onPick={setPicked} />
          </div>
          <p className="mt-8 text-center text-sm text-berry-soft">
            First time here? Open the private invite link that was made for
            you, and this screen will take care of the rest.
          </p>
        </>
      ) : pinReady[picked] ? (
        <PinPad person={picked} onBack={() => setPicked(null)} />
      ) : (
        <Card className="mx-auto w-full max-w-sm space-y-4 p-6 text-center">
          <p className="font-display text-2xl font-semibold text-plum">
            Hi {displayName(picked)}
          </p>
          <p className="text-sm text-berry-soft">
            This device is not paired yet and no PIN has been set up for you.
            Open your private invite link on this device to get in. If your
            link expired, ask {displayName(picked === "cami" ? "joseph" : "cami")} to
            send a new one from Settings.
          </p>
          <button
            className="w-full text-center text-sm text-berry-soft underline"
            onClick={() => setPicked(null)}
          >
            Go back
          </button>
        </Card>
      )}
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-center justify-center"><HeartSpinner /></main>}>
      <WelcomeInner />
    </Suspense>
  );
}
