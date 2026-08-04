"use client";

// Settings: profiles, relationship details, security and devices, invites,
// notification preferences, and data ownership (export and deletion).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Copy, Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCouple } from "@/lib/couple-context";
import { signOutDevice } from "@/lib/pairing";
import { compressImage, signedUrl, uploadMedia, validateUpload } from "@/lib/media";
import { disablePush, enablePush, pushAvailableNow, pushStatus } from "@/lib/push";
import { formatRelative } from "@/lib/format";
import { displayName, partnerOf, type Device, type NotificationPrefs } from "@/lib/types";
import {
  Avatar, Button, Card, ConfirmDialog, Input, Label, Select, Sheet, TopBar, useToast,
} from "@/components/ui";
import { HeartSpinner } from "@/components/hearts";

const CATEGORY_LABELS: Record<string, string> = {
  messages: "New messages",
  drawings: "New drawings",
  moods: "Mood updates",
  thinking_of_you: "Thinking of you",
  questions: "Daily questions",
  answers: "Both answers ready",
  letters: "Letters",
  events: "Calendar reminders",
  milestones: "Milestones",
  arrivals: "Arrived and made it home",
  plans: "Shared plan updates",
};

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC",
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 font-display text-xl font-semibold text-plum">{children}</h2>
  );
}

export default function SettingsPage() {
  const { me, partner, couple, deviceId, refresh } = useCouple();
  const toast = useToast();
  const router = useRouter();
  const partnerPerson = partnerOf(me.person);
  const partnerName = partner?.display_name ?? displayName(partnerPerson);

  // Profile
  const [name, setName] = useState(me.display_name);
  const [birthday, setBirthday] = useState(me.birthday ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Relationship
  const [startDate, setStartDate] = useState(couple.start_date ?? "");
  const [timezone, setTimezone] = useState(couple.timezone);

  // Security
  const [devices, setDevices] = useState<Device[]>([]);
  const [pinSheet, setPinSheet] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [phraseSheet, setPhraseSheet] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [phraseBusy, setPhraseBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null);
  const [signOutAllConfirm, setSignOutAllConfirm] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [invitePerson, setInvitePerson] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Notifications
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [pushState, setPushState] = useState<string>("default");

  // Data
  const [exporting, setExporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState<string[]>([]);

  const loadDevices = useCallback(async () => {
    const { data } = await supabase()
      .from("devices")
      .select("*")
      .is("revoked_at", null)
      .order("last_active_at", { ascending: false });
    setDevices((data ?? []) as Device[]);
  }, []);

  useEffect(() => {
    void loadDevices();
    void (async () => {
      if (me.avatar_path) setAvatarUrl(await signedUrl(me.avatar_path));
      const { data } = await supabase()
        .from("notification_prefs")
        .select("*")
        .eq("person", me.person)
        .maybeSingle();
      if (data) setPrefs(data as NotificationPrefs);
      const { data: delReqs } = await supabase().from("deletion_requests").select("person");
      setDeletionRequested((delReqs ?? []).map((r) => r.person as string));
      setPushState(pushStatus());
    })();
  }, [me.person, me.avatar_path, loadDevices]);

  const saveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase()
      .from("profiles")
      .update({
        display_name: name.trim() || me.display_name,
        birthday: birthday || null,
      })
      .eq("id", me.id);
    setSavingProfile(false);
    if (error) toast("Could not save. Try again.");
    else {
      toast("Profile saved");
      void refresh();
    }
  };

  const uploadAvatar = async (file: File) => {
    const invalid = validateUpload(file, "image");
    if (invalid) {
      toast(invalid);
      return;
    }
    try {
      const { blob } = await compressImage(file, 600, 0.85);
      const path = await uploadMedia("avatars", me.person, blob);
      await supabase().from("profiles").update({ avatar_path: path }).eq("id", me.id);
      setAvatarUrl(await signedUrl(path));
      toast("Photo updated");
      void refresh();
    } catch {
      toast("Upload failed. Try again.");
    }
  };

  const saveRelationship = async () => {
    const { error } = await supabase()
      .from("couple")
      .update({ start_date: startDate || null, timezone })
      .eq("id", 1);
    if (error) toast("Could not save. Try again.");
    else {
      toast("Saved");
      void refresh();
    }
  };

  const createInvite = async (forPerson: string) => {
    setInviteBusy(true);
    try {
      const { data, error } = await supabase().functions.invoke<{ token?: string; error?: string }>(
        "couple-admin",
        { body: { action: "create-invite", for_person: forPerson } },
      );
      if (error || !data?.token) throw new Error();
      const link = `${window.location.origin}/invite#${data.token}`;
      setInviteLink(link);
      setInvitePerson(forPerson);
    } catch {
      toast("Could not create the invite. Try again.");
    }
    setInviteBusy(false);
  };

  const savePin = async () => {
    if (!/^\d{4,8}$/.test(pin)) {
      toast("PIN must be 4 to 8 digits");
      return;
    }
    if (pin !== pinConfirm) {
      toast("PINs do not match");
      return;
    }
    setPinBusy(true);
    try {
      const { data, error } = await supabase().functions.invoke<{ ok?: boolean }>("couple-admin", {
        body: { action: "set-pin", pin },
      });
      if (error || !data?.ok) throw new Error();
      toast("PIN saved");
      setPinSheet(false);
      setPin("");
      setPinConfirm("");
    } catch {
      toast("Could not save the PIN. Try again.");
    }
    setPinBusy(false);
  };

  const savePhrase = async () => {
    const normalized = phrase.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalized.length < 8) {
      toast("Use at least 8 characters");
      return;
    }
    setPhraseBusy(true);
    try {
      const { data, error } = await supabase().functions.invoke<{ ok?: boolean }>("couple-admin", {
        body: { action: "set-phrase", phrase: normalized },
      });
      if (error || !data?.ok) throw new Error();
      toast("Secret password saved");
      setPhraseSheet(false);
      setPhrase("");
    } catch {
      toast("Could not save it. Try again.");
    }
    setPhraseBusy(false);
  };

  const revokeDevice = async (device: Device) => {
    await supabase().rpc("revoke_device", { device: device.id });
    setRevokeTarget(null);
    toast(`${device.name} signed out`);
    if (device.id === deviceId) {
      await signOutDevice();
      router.replace("/welcome");
    } else {
      void loadDevices();
    }
  };

  const signOutEverywhere = async () => {
    setSignOutAllConfirm(false);
    try {
      await supabase().functions.invoke("couple-admin", { body: { action: "sign-out-everywhere" } });
    } finally {
      localStorage.removeItem("cj_device_id");
      await supabase().auth.signOut();
      router.replace("/welcome");
    }
  };

  const updatePrefs = async (patch: Partial<NotificationPrefs>) => {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { error } = await supabase().from("notification_prefs").upsert({
      person: me.person,
      categories: next.categories,
      quiet_start: next.quiet_start,
      quiet_end: next.quiet_end,
      private_previews: next.private_previews,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      // Never show a toggle state the server did not accept.
      setPrefs(previous);
      toast("Could not save notification settings");
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase().functions.invoke("couple-admin", {
        body: { action: "export-data" },
      });
      if (error) throw new Error();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cami-and-joseph-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Export downloaded");
    } catch {
      toast("Export failed. Try again.");
    }
    setExporting(false);
  };

  const requestDelete = async () => {
    setDeleteConfirm(false);
    try {
      const { data, error } = await supabase().functions.invoke<{ deleted?: boolean }>("couple-admin", {
        body: { action: "request-delete" },
      });
      if (error) throw new Error();
      if (data?.deleted) {
        localStorage.clear();
        await supabase().auth.signOut();
        router.replace("/welcome");
      } else {
        setDeletionRequested((prev) => [...new Set([...prev, me.person])]);
        toast(`Waiting for ${partnerName} to confirm too`);
      }
    } catch {
      toast("Could not request deletion. Try again.");
    }
  };

  const cancelDelete = async () => {
    await supabase().functions.invoke("couple-admin", { body: { action: "cancel-delete" } });
    setDeletionRequested((prev) => prev.filter((p) => p !== me.person));
    toast("Deletion request withdrawn");
  };

  if (!prefs) {
    return (
      <>
        <TopBar title="Settings" back={() => router.push("/us")} />
        <HeartSpinner />
      </>
    );
  }

  return (
    <>
      <TopBar title="Settings" back={() => router.push("/us")} />
      <main className="flex flex-col gap-4 px-4 pb-8 pt-2">
        {/* Profile */}
        <SectionTitle>Your profile</SectionTitle>
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar name={me.display_name} url={avatarUrl} size="xl" />
            <label className="pressable cursor-pointer rounded-full bg-blush px-4 py-2 text-sm font-semibold text-berry hover:bg-blush-deep">
              Change photo
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div>
            <Label htmlFor="display-name">Name</Label>
            <Input id="display-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="birthday">Birthday</Label>
            <Input id="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </div>
          <Button onClick={saveProfile} loading={savingProfile}>Save profile</Button>
        </Card>

        {/* Relationship */}
        <SectionTitle>Our relationship</SectionTitle>
        <Card className="space-y-4">
          <div>
            <Label htmlFor="start-date">The day we became us</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="timezone">Our timezone</Label>
            <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
              ))}
            </Select>
          </div>
          <Button onClick={saveRelationship}>Save</Button>
        </Card>

        {/* Invites */}
        <SectionTitle>Invite a device</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-berry-soft">
            One-time links. Send them privately.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={inviteBusy} onClick={() => createInvite(partnerPerson)}>
              Invite link for {partnerName}
            </Button>
            <Button variant="ghost" size="sm" loading={inviteBusy} onClick={() => createInvite(me.person)}>
              Link for my other device
            </Button>
          </div>
          {inviteLink && (
            <div className="space-y-2 rounded-xl bg-cream p-3">
              <p className="text-xs font-semibold text-berry">
                One-time link for {invitePerson === me.person ? "you" : displayName(invitePerson as "cami" | "joseph")}:
              </p>
              <p className="break-all text-xs text-berry-soft">{inviteLink}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                    toast("Link copied");
                  } catch {
                    toast("Copy failed, select and copy the text above");
                  }
                }}
              >
                <Copy className="h-4 w-4" /> Copy link
              </Button>
            </div>
          )}
        </Card>

        {/* Security */}
        <SectionTitle>Security and devices</SectionTitle>
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPinSheet(true)}>
              <ShieldCheck className="h-4 w-4" /> Set or change my PIN
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPhraseSheet(true)}>
              Change our secret password
            </Button>
          </div>
          <div className="space-y-2 border-t border-line-soft pt-3">
            <p className="text-sm font-semibold text-berry">Paired devices</p>
            {devices.length === 0 && <p className="text-sm text-berry-soft">No active devices.</p>}
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl bg-cream px-3 py-2.5">
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-berry">
                    {d.name}
                    {d.id === deviceId && <span className="ml-1.5 text-xs font-normal text-success">This device</span>}
                  </span>
                  <span className="text-xs text-berry-soft">
                    {displayName(d.person)}, active {formatRelative(d.last_active_at)}
                  </span>
                </span>
                <button
                  className="text-xs font-semibold text-danger underline"
                  onClick={() => setRevokeTarget(d)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
            <Button variant="ghost" size="sm" onClick={() => void signOutDevice().then(() => router.replace("/welcome"))}>
              <LogOut className="h-4 w-4" /> Sign out this device
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSignOutAllConfirm(true)}>
              Sign out everywhere
            </Button>
          </div>
        </Card>

        {/* Notifications */}
        <SectionTitle>Notifications</SectionTitle>
        <Card className="space-y-3">
          {pushState !== "granted" ? (
            <div className="space-y-2">
              <p className="text-sm text-berry-soft">
                Notifications are off on this device.
              </p>
              {pushAvailableNow() ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    const ok = await enablePush(me.person);
                    setPushState(ok ? "granted" : pushStatus());
                    toast(ok ? "Notifications on" : "Could not enable notifications");
                  }}
                >
                  <Bell className="h-4 w-4" /> Enable on this device
                </Button>
              ) : (
                <p className="text-xs text-berry-soft">
                  On iPhone, first add the app to your Home Screen from Safari,
                  then enable notifications here inside the installed app.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-success">Notifications are on for this device</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await disablePush();
                  setPushState("default");
                  toast("Notifications off on this device");
                }}
              >
                Turn off
              </Button>
            </div>
          )}

          <div className="space-y-1.5 border-t border-line-soft pt-3">
            <p className="text-sm font-semibold text-berry">What to be notified about</p>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <label key={key} className="flex min-h-10 cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-berry">{label}</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#8f4560]"
                  checked={prefs.categories[key] !== false}
                  onChange={(e) =>
                    void updatePrefs({
                      categories: { ...prefs.categories, [key]: e.target.checked },
                    })
                  }
                />
              </label>
            ))}
          </div>

          <div className="space-y-2 border-t border-line-soft pt-3">
            <p className="text-sm font-semibold text-berry">Quiet hours</p>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="Quiet hours start"
                value={prefs.quiet_start ?? ""}
                onChange={(e) => void updatePrefs({ quiet_start: e.target.value || null })}
              />
              <span className="text-sm text-berry-soft">to</span>
              <Input
                type="time"
                aria-label="Quiet hours end"
                value={prefs.quiet_end ?? ""}
                onChange={(e) => void updatePrefs({ quiet_end: e.target.value || null })}
              />
            </div>
            <p className="text-xs text-berry-soft">Leave blank for no quiet hours.</p>
          </div>

          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 border-t border-line-soft pt-3">
            <span>
              <span className="block text-sm font-semibold text-berry">Private previews</span>
              <span className="text-xs text-berry-soft">
                Lock screen shows a generic note instead of the content.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#8f4560]"
              checked={prefs.private_previews}
              onChange={(e) => void updatePrefs({ private_previews: e.target.checked })}
            />
          </label>
        </Card>

        {/* Data */}
        <SectionTitle>Your data</SectionTitle>
        <Card className="space-y-3">
          <Button variant="secondary" size="sm" loading={exporting} onClick={exportData}>
            <Download className="h-4 w-4" /> Export everything as JSON
          </Button>
          <div className="border-t border-line-soft pt-3">
            {deletionRequested.includes(me.person) ? (
              <div className="space-y-2">
                <p className="text-sm text-danger">
                  You asked to delete everything. Waiting for {partnerName} to
                  confirm from their settings.
                </p>
                <Button variant="ghost" size="sm" onClick={cancelDelete}>
                  Cancel my request
                </Button>
              </div>
            ) : (
              <>
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 className="h-4 w-4" /> Delete our shared space
                </Button>
                <p className="mt-1.5 text-xs text-berry-soft">
                  Erases everything for both of you. Both people must confirm
                  before anything is deleted.
                  {deletionRequested.includes(partnerPerson)
                    ? ` ${partnerName} has already requested this.`
                    : ""}
                </p>
              </>
            )}
          </div>
        </Card>

        <p className="text-center text-xs text-berry-soft">
          Made only for Cami and Joseph. No ads, no trackers, no third parties.
        </p>
      </main>

      {/* PIN sheet */}
      <Sheet open={pinSheet} onClose={() => setPinSheet(false)} title="Set your PIN">
        <div className="space-y-4 pt-2">
          <p className="text-sm text-berry-soft">
            4 to 8 digits. You will use it to unlock new devices, so keep it to
            yourself.
          </p>
          <div>
            <Label htmlFor="new-pin">New PIN</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label htmlFor="confirm-pin">Repeat PIN</Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <Button className="w-full" loading={pinBusy} onClick={savePin}>
            Save PIN
          </Button>
        </div>
      </Sheet>

      <Sheet open={phraseSheet} onClose={() => setPhraseSheet(false)} title="Our secret password">
        <div className="space-y-4 pt-2">
          <p className="text-sm text-berry-soft">
            One shared password that unlocks the app for either of you from
            the welcome screen. It is saved in lowercase.
          </p>
          <Input
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            aria-label="New secret password"
            placeholder="at least 8 characters"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
          <Button className="w-full" loading={phraseBusy} onClick={savePhrase}>
            Save secret password
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke this device?"
        message={`${revokeTarget?.name ?? "The device"} will be signed out and will need an invite link or PIN to get back in.`}
        confirmLabel="Revoke"
        destructive
        onConfirm={() => revokeTarget && void revokeDevice(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
      />

      <ConfirmDialog
        open={signOutAllConfirm}
        title="Sign out everywhere?"
        message="All of your devices will be signed out, including this one. You will need an invite link or your PIN to sign back in."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => void signOutEverywhere()}
        onCancel={() => setSignOutAllConfirm(false)}
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete everything?"
        message={`This erases all messages, photos, memories, letters, and history for both of you. It only happens after ${partnerName} confirms too. This cannot be undone.`}
        confirmLabel="Request deletion"
        destructive
        onConfirm={() => void requestDelete()}
        onCancel={() => setDeleteConfirm(false)}
      />
    </>
  );
}
