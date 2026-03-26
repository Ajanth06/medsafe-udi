"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import AuthBar from "./AuthBar";
import HeaderAiLauncher from "./HeaderAiLauncher";

export default function AppHeader() {
  const [user, setUser] = useState<User | null>(null);

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

  if (!user) {
    return null;
  }

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
        <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-slate-100/80 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/80 animate-pulse" />
          <span>Online</span>
        </div>

        <AuthBar />
      </div>
    </header>
  );
}
