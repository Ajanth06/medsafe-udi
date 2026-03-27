"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { isAdminEmail } from "../../lib/adminAccess";
import AuthBar from "./AuthBar";
import HeaderAiLauncher from "./HeaderAiLauncher";

type OnlineUser = {
  id: string;
  email: string;
};

export default function AppHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error) setUser(data.user ?? null);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id || !user.email) return;

    const channel = supabase.channel("medsafe-online-users", {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    const syncPresence = () => {
      const state = channel.presenceState<Record<string, unknown>[]>();
      const users = Object.entries(state)
        .map(([id, entries]) => {
          const firstEntry = Array.isArray(entries) ? entries[0] : null;
          const email =
            firstEntry &&
            typeof firstEntry === "object" &&
            "email" in firstEntry &&
            typeof firstEntry.email === "string"
              ? firstEntry.email
              : "";

          return {
            id,
            email,
          };
        })
        .filter((entry) => entry.email)
        .sort((a, b) => a.email.localeCompare(b.email));

      setOnlineUsers(users);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          email: user.email,
        });
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [user?.email, user?.id]);

  if (!user) {
    return null;
  }

  const isAdmin = isAdminEmail(user.email);

  return (
    <header className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-slate-950/60 backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-1 rounded-full bg-sky-500/10 blur-md" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/60 bg-slate-900 shadow-[0_0_16px_rgba(56,189,248,0.12)] float-soft">
            <img
              src="/icons/red-bird.svg"
              alt="MedSafe Bird"
              className="h-70 w-70"
            />
          </div>
        </div>

        <HeaderAiLauncher />
      </div>

      <div className="ml-auto flex flex-col items-end gap-2">
        <div className="flex flex-col items-end gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-slate-100/80 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/80 animate-pulse" />
            <span>{isAdmin ? `${onlineUsers.length} online` : "Online"}</span>
          </div>

          {isAdmin && onlineUsers.length > 0 && (
            <div className="hidden min-w-[240px] rounded-2xl border border-emerald-400/20 bg-slate-950/90 px-3 py-2 shadow-[0_0_18px_rgba(16,185,129,0.08)] sm:block">
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">
                Aktuell online
              </div>
              <div className="flex flex-col gap-1.5">
                {onlineUsers.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 text-[11px] text-slate-200"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.9)]" />
                    <span className="truncate">{entry.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <AuthBar />
      </div>
    </header>
  );
}
