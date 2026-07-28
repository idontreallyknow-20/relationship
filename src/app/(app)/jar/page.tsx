"use client";

// The Love Jar. A full incremental game that happens to live inside a couples
// app: everything it needs is local, it plays offline, and the rest of the app
// only ever adds optional bonuses on top.

import { useEffect, useState } from "react";
import { Settings2, X } from "lucide-react";
import { GameProvider, useGame } from "@/game/store";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, TopBar, useToast } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { SyncBadge } from "@/components/sync-status";
import { JarScreen } from "@/components/jar/jar-screen";
import { AbilitiesTab, UpgradesTab } from "@/components/jar/progress";
import { AutomationTab, DepthsTab } from "@/components/jar/depths";
import { CreaturesTab } from "@/components/jar/creatures";
import { ResetsTab, VesselsTab } from "@/components/jar/resets";
import {
  AchievementsTab, ChallengesTab, CollectionsTab, MissionsTab,
} from "@/components/jar/objectives";
import {
  CodexTab, MinigamesTab, SettingsTab, StatsTab, UsTab, WalletStrip,
} from "@/components/jar/extras";
import { Tour } from "@/components/jar/tour";
import { StageAnnounce } from "@/components/jar/explain";
import type { Feature } from "@/game/config/stages";

/**
 * Five groups, not nineteen tabs.
 *
 * Nineteen was a scrolling strip that nobody could hold in their head, and it
 * buried the jar itself among admin screens. The jar is first and alone,
 * because tapping it is the game; everything else is filed under where you
 * would look for it.
 */
const GROUPS = [
  { id: "jar", label: "Jar", tabs: [] },
  {
    id: "grow",
    label: "Grow",
    tabs: [
      { id: "depths", label: "The chain", needs: "chain" },
      { id: "upgrades", label: "Upgrades", needs: "upgrades" },
      { id: "automation", label: "Automation", needs: "automation" },
      { id: "abilities", label: "Abilities", needs: "abilities" },
    ],
  },
  {
    id: "jarful",
    label: "The jar",
    tabs: [
      { id: "creatures", label: "Creatures", needs: "pets" },
      { id: "vessels", label: "Vessels", needs: "vessels" },
      { id: "collections", label: "Collections", needs: "pets" },
      { id: "codex", label: "Codex", needs: "pets" },
    ],
  },
  {
    id: "us",
    label: "Us",
    tabs: [
      { id: "us", label: "Together", needs: "us" },
      { id: "missions", label: "Missions", needs: "missions" },
      { id: "challenges", label: "Challenges", needs: "challenges" },
      { id: "achievements", label: "Achievements", needs: "missions" },
      { id: "minigames", label: "Mini-games", needs: "pets" },
    ],
  },
  {
    id: "deeper",
    label: "Deeper",
    tabs: [
      { id: "tide", label: "Tide change", needs: "tideChange" },
      { id: "water", label: "New water", needs: "newWater" },
      { id: "sea", label: "The Sea", needs: "sea" },
      { id: "stats", label: "Statistics", needs: "tideChange" },
    ],
  },
] as const;

const GROUP_FOR_TAB: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((group) => group.tabs.map((tab) => [tab.id, group.id])),
);

/**
 * The groups and tabs that exist yet.
 *
 * A tab with no `needs` is always there; the rest appear as the stages open.
 * A group with nothing in it does not render at all, so the first run shows
 * exactly one word: Jar.
 */
function visibleGroups(features: Set<Feature>) {
  return GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => !("needs" in tab) || features.has(tab.needs as Feature)),
  })).filter((group) => group.id === "jar" || group.tabs.length > 0);
}

export default function Page() {
  return (
    <GameProvider>
      <JarApp />
    </GameProvider>
  );
}

function JarApp() {
  const { ready, loadError, state, derived } = useGame();
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

  const groups = visibleGroups(derived.features);
  // A tab remembered from last visit can have been hidden since, either by a
  // reset dropping the stage or by this being a fresh save on the same device.
  const visible = tab === "jar" || tab === "settings"
    || groups.some((g) => g.tabs.some((x) => x.id === tab));
  const current = visible ? tab : "jar";

  return (
    <>
      <TopBar
        title="Love Jar"
        action={
          <span className="flex items-center gap-1.5">
            <SyncBadge />
            <button
              aria-label="Settings"
              onClick={() => setTab("settings")}
              className="pressable text-berry-soft"
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </span>
        }
      />

      <div className="sticky top-0 z-20 border-b border-line-soft bg-cream/95 px-4 pb-1.5 pt-1 backdrop-blur-sm">
        <WalletStrip />
        <div data-tour="tabs" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {groups.map((entry) => {
            const active = entry.id === "jar" ? current === "jar" : GROUP_FOR_TAB[current] === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => setTab(entry.id === "jar" ? "jar" : entry.tabs[0].id)}
                aria-current={active ? "page" : undefined}
                className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  active ? "bg-plum text-white" : "bg-white text-berry-soft"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        {/* The second row only appears once you are inside a group. */}
        {GROUP_FOR_TAB[current] && groups.some((g) => g.id === GROUP_FOR_TAB[current]) && (
          <div className="no-scrollbar -mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4">
            {groups.find((g) => g.id === GROUP_FOR_TAB[current])?.tabs.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setTab(entry.id)}
                aria-current={current === entry.id ? "page" : undefined}
                className={`pressable shrink-0 rounded-full px-3 py-1 text-[0.7rem] font-semibold ${
                  current === entry.id ? "bg-blush text-rose-dark" : "bg-white/70 text-berry-soft"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="flex flex-col gap-3 px-4 py-3">
        {current === "jar" && <JarScreen onOpenTab={setTab} />}
        {current === "depths" && <DepthsTab />}
        {current === "automation" && <AutomationTab />}
        {current === "upgrades" && <UpgradesTab />}
        {current === "abilities" && <AbilitiesTab />}
        {current === "creatures" && <CreaturesTab />}
        {current === "vessels" && <VesselsTab />}
        {current === "tide" && <ResetsTab layer="tide" />}
        {current === "water" && <ResetsTab layer="water" />}
        {current === "sea" && <ResetsTab layer="sea" />}
        {current === "us" && <UsTab />}
        {current === "missions" && <MissionsTab />}
        {current === "challenges" && <ChallengesTab />}
        {current === "achievements" && <AchievementsTab />}
        {current === "collections" && <CollectionsTab />}
        {current === "minigames" && <MinigamesTab />}
        {current === "stats" && <StatsTab />}
        {current === "codex" && <CodexTab />}
        {current === "settings" && <SettingsTab />}
      </main>

      <OfflineDialog />
      <LegacyDialog />
      <NoticeStack />
      <Tour onOpenTab={setTab} />
      <StageAnnounce />

      <p className="px-4 pb-6 text-center text-[0.65rem] text-berry-soft">
        Save {state.version}. Stored on this device, synced when there is a connection.
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
          {offlineReport.shells > 0 && <li>{formatNumber(offlineReport.shells, format)} shells</li>}
          {offlineReport.glass > 0 && <li>{formatNumber(offlineReport.glass, format)} sea glass</li>}
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
          <span className="font-semibold text-berry">{legacyTaps.toLocaleString()}</span> hearts
          carried over. The old jar history is still on the home screen.
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
  const { notices, dismissNotice, state } = useGame();
  const toast = useToast();
  // The tour already owns the screen; notices behind it only read as clutter.
  const hidden = !state.settings.tutorialDone;

  // Auto-dismiss so the stack never grows without bound.
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => dismissNotice(notices[0].id), 5_000);
    return () => clearTimeout(timer);
  }, [notices, dismissNotice]);

  if (notices.length === 0 || hidden) return null;

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
