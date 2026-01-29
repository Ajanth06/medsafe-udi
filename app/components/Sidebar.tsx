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
            Dokumente (DMR → DHR → NC → Audit){" "}
            <span className="text-[11px] text-slate-400">(Login erforderlich)</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-slate-300 shadow-[0_0_18px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-[0.2em] text-slate-300">
            <span>PLATFORM STATUS</span>
            <span className="flex items-center gap-2 text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              <span>Online</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
            <span className="text-slate-400">System:</span>
            <span className="text-slate-200">Aktiv</span>
            <span className="text-slate-400">Security:</span>
            <span className="text-slate-200">UDI-Hash aktiv</span>
            <span className="text-slate-400">Storage:</span>
            <span className="text-slate-200">Cloud bereit</span>
            <span className="text-slate-400">Region:</span>
            <span className="text-slate-200">EU (Frankfurt)</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-slate-300 shadow-[0_0_18px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-slate-300">
            TRUST &amp; COMPLIANCE
          </div>
          <div className="space-y-1 text-[12px] text-slate-300">
            <div>MDR-konzipierte Architektur</div>
            <div>ISO 13485-orientiert</div>
            <div>Audit-Trail vorbereitet</div>
            <div>EU-Datenhaltung</div>
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

      <nav className="space-y-3 text-sm">
        <a
          href="/"
          className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-slate-50 shadow-inner shadow-white/10"
        >
          <span>Geräteübersicht</span>
          <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
            Aktiv
          </span>
        </a>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-200/90">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300/80">
            Dokumente – Process Hub
          </div>
          <div className="mt-2 space-y-2 text-[12px]">
            <a className="block hover:text-white" href="/#dmr">
              DMR – Design Master Record
              <div className="text-[10px] text-slate-400">
                Freigegebene Dokumente, SOP/IFU, Zeichnungen
              </div>
            </a>
            <a className="block hover:text-white" href="/#dhr">
              DHR – Device History Record
              <div className="text-[10px] text-slate-400">
                Gerätebezogene Dokumente, Service, Prüfprotokolle
              </div>
            </a>
            <a className="block hover:text-white" href="/#nc">
              NC – Nonconformity
              <div className="text-[10px] text-slate-400">
                Abweichungen mit Dokumentenbezug
              </div>
            </a>
            <a className="block hover:text-white" href="/#audit">
              Audit‑Trail
              <div className="text-[10px] text-slate-400">
                Revisionssichere Historie
              </div>
            </a>
          </div>
        </div>
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
