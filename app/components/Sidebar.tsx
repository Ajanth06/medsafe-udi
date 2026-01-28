"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export default function Sidebar() {
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
    return (
      <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/70 backdrop-blur-2xl">
        <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-slate-300/80">
          Navigation
        </div>

        <div className="space-y-2 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-slate-200/80">
            Geräteübersicht <span className="text-[11px] text-slate-400">(Login erforderlich)</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-slate-200/80">
            Dokumente <span className="text-[11px] text-slate-400">(Login erforderlich)</span>
          </div>
        </div>

        <div className="rounded-2xl bg-black/40 px-3 py-3 text-[11px] text-slate-300/85">
          <div className="mb-1 font-medium">Pro-Funktionen vorbereitet</div>
          <div className="text-[11px] text-slate-400">
            UDI-Hash, Recall-Status, DMR/DHR-Links und IPFS-Archiv kannst du
            später direkt hier im Layout erweitern.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/70 backdrop-blur-2xl">
      <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-slate-300/80">
        Navigation
      </div>

      <nav className="space-y-1 text-sm">
        <a
          href="/"
          className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-slate-50 shadow-inner shadow-white/10"
        >
          <span>Geräteübersicht</span>
          <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
            Aktiv
          </span>
        </a>

        <a
          href="/docs"
          className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-slate-50 shadow-inner shadow-white/10"
        >
          <span>Dokumente</span>
          <span className="rounded-full bg-sky-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
            Aktiv
          </span>
        </a>
      </nav>

      <div className="mt-2 rounded-2xl bg-black/40 px-3 py-3 text-[11px] text-slate-300/85">
        <div className="mb-1 font-medium">Pro-Funktionen vorbereitet</div>
        <div className="text-[11px] text-slate-400">
          UDI-Hash, Recall-Status, DMR/DHR-Links und IPFS-Archiv kannst du später
          direkt hier im Layout erweitern.
        </div>
      </div>
    </div>
  );
}
