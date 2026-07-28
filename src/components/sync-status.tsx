"use client";

// The one place the app tells you what is and is not saved. Deliberately
// quiet: nothing appears at all while everything is synced and online.

import { useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useSyncStatus } from "@/lib/offline/provider";
import { discardFailed, retryFailed } from "@/lib/offline/outbox";
import { formatRelative } from "@/lib/format";
import { Button, Sheet } from "./ui";

export function SyncBadge() {
  const { online, pending, failed, syncing, lastSyncedAt, ops } = useSyncStatus();
  const [open, setOpen] = useState(false);

  if (online && pending === 0 && failed === 0) return null;

  const label = failed > 0
    ? `${failed} not saved`
    : !online
      ? pending > 0 ? `Offline, ${pending} waiting` : "Offline"
      : syncing ? "Saving" : `${pending} waiting`;

  const tone = failed > 0
    ? "border-danger/40 bg-danger/10 text-danger"
    : online
      ? "border-line bg-white text-berry-soft"
      : "border-line bg-blush/60 text-berry";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`pressable flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
      >
        {failed > 0 ? (
          <TriangleAlert className="h-3.5 w-3.5" />
        ) : online ? (
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        ) : (
          <CloudOff className="h-3.5 w-3.5" />
        )}
        {label}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Syncing">
        <div className="space-y-4 pt-1">
          <p className="text-sm text-berry-soft">
            {online
              ? "Connected. Anything waiting is being sent now."
              : "You are offline. Everything you do is saved on this device and will send itself when you are back."}
          </p>
          {lastSyncedAt && (
            <p className="text-xs text-berry-soft">
              Last successful sync {formatRelative(new Date(lastSyncedAt))}.
            </p>
          )}

          {ops.length === 0 ? (
            <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-berry-soft">
              Nothing is waiting. Everything you have done is saved.
            </p>
          ) : (
            <ul className="space-y-2">
              {ops.map((op) => (
                <li
                  key={op.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-berry">{op.label}</p>
                    <p className="text-xs text-berry-soft">
                      {op.status === "failed"
                        ? op.last_error ?? "Could not save"
                        : op.attempts > 0
                          ? `Retrying, attempt ${op.attempts + 1}`
                          : "Waiting to send"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                      op.status === "failed"
                        ? "bg-danger/15 text-danger"
                        : "bg-blush text-rose-dark"
                    }`}
                  >
                    {op.status === "failed" ? "Failed" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {failed > 0 && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void retryFailed()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => void discardFailed()}>
                Discard
              </Button>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** A small inline marker for a single row that has not been sent yet. */
export function PendingDot({ label = "Waiting to send" }: { label?: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex h-2 w-2 shrink-0 rounded-full bg-rose/60"
    />
  );
}
