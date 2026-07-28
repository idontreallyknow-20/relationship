"use client";

// The Love Jar. A full incremental game that happens to live inside a couples
// app: everything it needs is local, it plays offline, and the rest of the app
// only ever adds optional bonuses on top.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { GameProvider, useGame } from "@/game/store";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, TopBar, useToast } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { SyncBadge } from "@/components/sync-status";
import { JarScreen } from "@/components/jar/jar-screen";
import { SkillsTab, UpgradesTab } from "@/components/jar/progress";
import { CharmsTab, PetsTab } from "@/components/jar/creatures";
import { ResetsTab, WorldsTab } from "@/components/jar/resets";
import {
  AchievementsTab, ChallengesTab, CollectionsTab, MissionsTab,
} from "@/components/jar/objectives";
import {
  CodexTab, EventsTab, LeaderboardTab, MinigamesTab, SettingsTab, ShopTab, StatsTab, WalletStrip,
} from "@/components/jar/extras";

const TABS = [
  { id: "jar", label: "Jar" },
  { id: "upgrades", label: "Upgrades" },
  { id: "skills", label: "Skills" },
  { id: "pets", label: "Pets" },
  { id: "charms", label: "Charms" },
  { id: "worlds", label: "Worlds" },
  { id: "rebirth", label: "Rebirth" },
  { id: "ascension", label: "Ascension" },
  { id: "challenges", label: "Challenges" },
  { id: "missions", label: "Missions" },
  { id: "achievements", label: "Achievements" },
  { id: "collections", label: "Collections" },
  { id: "minigames", label: "Mini-games" },
  { id: "events", label: "Events" },
  { id: "shop", label: "Shop" },
  { id: "stats", label: "Statistics" },
  { id: "leaderboard", label: "Together" },
  { id: "codex", label: "Codex" },
  { id: "settings", label: "Settings" },
] as const;

export default function Page() {
  return (
    <GameProvider>
      <JarApp />
    </GameProvider>
  );
}

function JarApp() {
  const { ready, loadError, state } = useGame();
  // Remember where you were between visits, without a mount-time render pass.
  const [tab, setTab] = useState<string>(() => {
    if (typeof sessionStorage === "undefined") return "jar";
    return sessionStorage.getItem("cj_jar_tab") ?? "jar";
  });
  useEffect(() => {
    sessionStorage.setItem("cj_jar_tab", tab);
  }, [tab]);

  if (loadError) {
    return (
      <>
        <TopBar title="Love Jar" />
        <main className="px-4 py-6">
          <p className="rounded-card border border-line bg-white p-4 text-sm text-berry-soft">
            Could not open the jar: {loadError}. Your progress is safe. Try again in a moment.
          </p>
        </main>
      </>
    );
  }

  if (!ready) {
    return (
      <>
        <TopBar title="Love Jar" />
        <main className="px-4 py-6">
          <HeartSpinner label="Opening the jar" />
          <div className="mt-4 space-y-2" aria-hidden="true">
            <div className="h-28 rounded-card bg-white/70" />
            <div className="h-16 rounded-card bg-white/70" />
            <div className="h-16 rounded-card bg-white/70" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Love Jar" action={<SyncBadge />} />

      <div className="sticky top-0 z-20 border-b border-line-soft bg-cream/95 px-4 pb-1.5 pt-1 backdrop-blur-sm">
        <WalletStrip />
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? "page" : undefined}
              className={`pressable shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === entry.id ? "bg-plum text-white" : "bg-white text-berry-soft"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex flex-col gap-4 px-4 py-4">
        {tab === "jar" && <JarScreen onOpenTab={setTab} />}
        {tab === "upgrades" && <UpgradesTab />}
        {tab === "skills" && <SkillsTab />}
        {tab === "pets" && <PetsTab />}
        {tab === "charms" && <CharmsTab />}
        {tab === "worlds" && <WorldsTab />}
        {tab === "rebirth" && <ResetsTab layer="rebirth" />}
        {tab === "ascension" && <ResetsTab layer="ascension" />}
        {tab === "challenges" && <ChallengesTab />}
        {tab === "missions" && <MissionsTab />}
        {tab === "achievements" && <AchievementsTab />}
        {tab === "collections" && <CollectionsTab />}
        {tab === "minigames" && <MinigamesTab />}
        {tab === "events" && <EventsTab />}
        {tab === "shop" && <ShopTab />}
        {tab === "stats" && <StatsTab />}
        {tab === "leaderboard" && <LeaderboardTab />}
        {tab === "codex" && <CodexTab />}
        {tab === "settings" && <SettingsTab />}
      </main>

      <OfflineDialog />
      <LegacyDialog />
      <NoticeStack />

      <p className="px-4 pb-6 text-center text-[0.65rem] text-berry-soft">
        Save version {state.version}. Everything you do is stored on this device first and synced
        when there is a connection.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome back                                                        */
/* ------------------------------------------------------------------ */

function OfflineDialog() {
  const { offlineReport, claimOfflineNow, dismissOffline, state } = useGame();
  if (!offlineReport) return null;
  const format = state.settings.numberFormat;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div className="fade-in absolute inset-0 bg-berry/40" />
      <div className="rise-in relative w-full max-w-sm rounded-card border border-line bg-white p-5 shadow-lift">
        <div className="flex items-center gap-2">
          <HeartIcon className="h-6 w-6 text-rose-dark" />
          <h2 className="font-display text-xl font-semibold text-plum">Welcome back</h2>
        </div>
        <p className="mt-2 text-sm text-berry-soft">
          The jar kept working for {formatDurationShort(offlineReport.countedMs)}
          {offlineReport.cappedByWindow && " (your offline window is full)"}.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-berry">
          <li>{formatNumber(offlineReport.hearts, format)} hearts</li>
          {offlineReport.golden > 0 && <li>{offlineReport.golden} golden hearts</li>}
          {offlineReport.treats > 0 && <li>{offlineReport.treats} pet treats</li>}
        </ul>
        {offlineReport.clockSuspicious && (
          <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-xs text-berry-soft">
            Your device clock moved backwards, so this window was not counted.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={claimOfflineNow}>
            Collect
          </Button>
          <Button variant="ghost" onClick={dismissOffline}>
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The old jar                                                         */
/* ------------------------------------------------------------------ */

function LegacyDialog() {
  const { legacyTaps, dismissLegacy } = useGame();
  if (legacyTaps === null) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div className="fade-in absolute inset-0 bg-berry/40" />
      <div className="rise-in relative w-full max-w-sm rounded-card border border-line bg-white p-5 shadow-lift">
        <h2 className="font-display text-xl font-semibold text-plum">Your old jar came with you</h2>
        <p className="mt-2 text-sm text-berry-soft">
          Every heart the two of you dropped in before today has been carried over:{" "}
          <span className="font-semibold text-berry">{legacyTaps.toLocaleString()}</span> of them.
          They count toward your lifetime total, and the Founding Jar skin is yours.
        </p>
        <p className="mt-2 text-xs text-berry-soft">
          Nothing was deleted. The old jar history is still on the home screen.
        </p>
        <Button className="mt-4 w-full" onClick={dismissLegacy}>
          Open the new jar
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notices                                                             */
/* ------------------------------------------------------------------ */

function NoticeStack() {
  const { notices, dismissNotice } = useGame();
  const toast = useToast();

  // Auto-dismiss so the stack never grows without bound.
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => dismissNotice(notices[0].id), 5_000);
    return () => clearTimeout(timer);
  }, [notices, dismissNotice]);

  if (notices.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[65] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(5.5rem + var(--safe-bottom))" }}
      aria-live="polite"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`rise-in pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-card border px-4 py-2.5 shadow-lift ${
            notice.kind === "warning"
              ? "border-danger/40 bg-white"
              : "border-line bg-white"
          }`}
          onClick={() => {
            if (notice.detail) toast(notice.detail);
          }}
        >
          <HeartIcon
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              notice.kind === "achievement" ? "text-rose-dark" : "text-lavender-deep"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-berry">{notice.title}</p>
            {notice.detail && <p className="text-xs text-berry-soft">{notice.detail}</p>}
          </div>
          <button
            aria-label="Dismiss"
            onClick={() => dismissNotice(notice.id)}
            className="shrink-0 text-berry-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
