"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { House, Images, MessageCircle, Pencil, Smile, Camera, Mail, CalendarHeart, ListChecks } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWho } from "@/lib/couple-context";
import { HeartIcon } from "./hearts";
import { Sheet } from "./ui";

function useUnreadCount(): number {
  const { partner } = useWho();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sb = supabase();
    let active = true;

    const refresh = async () => {
      const { count: n } = await sb
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("sender", partner)
        .is("read_at", null)
        .is("deleted_at", null);
      if (active) setCount(n ?? 0);
    };
    void refresh();

    const channel = sb
      .channel("nav-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      active = false;
      void sb.removeChannel(channel);
    };
  }, [partner]);

  return count;
}

function NavLink({
  href,
  label,
  active,
  children,
  badge = 0,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-label={badge > 0 ? `${label}, ${badge} unread` : label}
      aria-current={active ? "page" : undefined}
      className={`pressable relative flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[0.68rem] font-semibold ${
        active ? "text-rose-dark" : "text-berry-soft"
      }`}
    >
      <span className="relative">
        {children}
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-dark px-1 text-[0.6rem] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {label}
      {active && <HeartIcon className="absolute -bottom-1 h-1.5 w-1.5 text-rose-dark" />}
    </Link>
  );
}

const CREATE_ACTIONS = [
  { href: "/draw", label: "Drawing", icon: Pencil },
  { href: "/moods?new=1", label: "Mood", icon: Smile },
  { href: "/memories?new=1", label: "Memory", icon: Camera },
  { href: "/letters?new=1", label: "Letter", icon: Mail },
  { href: "/plans?new=event", label: "Plan", icon: CalendarHeart },
  { href: "/plans?new=bucket", label: "Bucket list", icon: ListChecks },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const unread = useUnreadCount();

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-sm"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
          <NavLink href="/home" label="Home" active={pathname === "/home"}>
            <House className="h-5.5 w-5.5" />
          </NavLink>
          <NavLink href="/chat" label="Chat" active={pathname === "/chat"} badge={unread}>
            <MessageCircle className="h-5.5 w-5.5" />
          </NavLink>
          <button
            aria-label="Create"
            onClick={() => setCreateOpen(true)}
            className="pressable -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-rose-dark text-white shadow-lift"
          >
            <HeartIcon className="h-6 w-6" />
          </button>
          <NavLink href="/memories" label="Memories" active={pathname.startsWith("/memories")}>
            <Images className="h-5.5 w-5.5" />
          </NavLink>
          <NavLink href="/us" label="Us" active={pathname.startsWith("/us")}>
            <svg viewBox="0 0 28 24" className="h-5.5 w-5.5" aria-hidden="true">
              <path
                d="M9 19c-.5-.4-7-5-7-9.4A3.9 3.9 0 0 1 9 6.7a3.9 3.9 0 0 1 7 2.9C16 14 9.5 18.6 9 19z"
                fill="currentColor"
              />
              <path
                d="M20 21c-.4-.3-5.5-3.9-5.5-7.4a3.1 3.1 0 0 1 5.5-2.3 3.1 3.1 0 0 1 5.5 2.3c0 3.5-5.1 7.1-5.5 7.4z"
                fill="currentColor"
                opacity="0.55"
              />
            </svg>
          </NavLink>
        </div>
      </nav>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Create">
        <div className="grid grid-cols-3 gap-3 pt-2">
          {CREATE_ACTIONS.map((action) => (
            <button
              key={action.href}
              onClick={() => {
                setCreateOpen(false);
                router.push(action.href);
              }}
              className="pressable flex flex-col items-center gap-2 rounded-card border border-line bg-white px-2 py-4 shadow-soft"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blush text-rose-dark">
                <action.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-berry">{action.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
