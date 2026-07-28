"use client";

// Wires the offline machinery into the app: network watching, draining the
// outbox when we come back, and a single place for screens to read sync state.

import { createContext, useContext, useEffect, useState } from "react";
import { drain, subscribeOutbox, type OutboxOp, type SyncState } from "./outbox";
import { startNetWatch, subscribeNet, useOnline } from "./net";

interface OfflineContextValue extends SyncState {
  online: boolean;
  ops: OutboxOp[];
}

const OfflineContext = createContext<OfflineContextValue>({
  online: true,
  pending: 0,
  failed: 0,
  syncing: false,
  lastSyncedAt: null,
  ops: [],
});

export function useSyncStatus(): OfflineContextValue {
  return useContext(OfflineContext);
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const [sync, setSync] = useState<SyncState>({
    pending: 0,
    failed: 0,
    syncing: false,
    lastSyncedAt: null,
  });
  const [ops, setOps] = useState<OutboxOp[]>([]);

  useEffect(() => {
    startNetWatch();
    const unsubscribe = subscribeOutbox((state, queued) => {
      setSync(state);
      setOps(queued);
    });
    void drain();
    return unsubscribe;
  }, []);

  // Any transition back to online is a reason to try again immediately.
  useEffect(() => {
    return subscribeNet((next) => {
      if (next) void drain();
    });
  }, []);

  // A periodic nudge covers the case where the browser never fires an online
  // event but connectivity quietly returned.
  useEffect(() => {
    const interval = setInterval(() => {
      void drain();
    }, 45_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <OfflineContext.Provider value={{ ...sync, online, ops }}>
      {children}
    </OfflineContext.Provider>
  );
}
