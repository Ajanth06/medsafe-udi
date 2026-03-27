"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export default function Sidebar() {
  const [user, setUser] = useState<User | null>(null);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [isUdiPulseActive, setIsUdiPulseActive] = useState(false);
  const [isDocsPulseActive, setIsDocsPulseActive] = useState(false);
  const [isAiPulseActive, setIsAiPulseActive] = useState(false);
  const [hash, setHash] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const isUdiControlActive = pathname === "/" && hash !== "#medsafe-ai";
  const isDocumentsActive = pathname?.startsWith("/docs");
  const isAiActive = pathname === "/" && hash === "#medsafe-ai";

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
    if (!user) return;

    const loadOverviewCounts = async () => {
      const [{ count: devices }, { count: docs }] = await Promise.all([
        supabase.from("devices").select("*", { count: "exact", head: true }),
        supabase.from("docs").select("*", { count: "exact", head: true }),
      ]);

      setDeviceCount(devices ?? 0);
      setDocumentCount(docs ?? 0);
    };

    loadOverviewCounts();
  }, [user]);

  useEffect(() => {
    const syncHash = () => {
      setHash(typeof window !== "undefined" ? window.location.hash : "");
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  const closeActiveDetailView = () => {
    window.dispatchEvent(new CustomEvent("medsafe:close-detail"));
  };

  const openUdiControl = () => {
    setIsUdiPulseActive(true);
    window.setTimeout(() => setIsUdiPulseActive(false), 900);
    closeActiveDetailView();
    if (pathname !== "/") {
      router.push("/");
      return;
    }
    window.history.pushState(null, "", "/");
    setHash("");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  if (!user) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/70 backdrop-blur-2xl">
      <nav className="grid gap-2 md:grid-cols-3 text-sm">
        <button
          type="button"
          onClick={() => {
            openUdiControl();
          }}
          className={
            "flex min-h-[96px] flex-col justify-between rounded-2xl px-5 py-4 text-slate-50 transition border border-emerald-400/50 bg-emerald-500/15 shadow-[0_0_24px_rgba(16,185,129,0.16)] " +
            (isUdiControlActive || isUdiPulseActive ? "animate-pulse" : "hover:bg-emerald-500/18")
          }
        >
          <div className="text-center">
            <div className="text-xl font-black tracking-[0.08em] uppercase text-slate-50">
              UDI Control
            </div>
            <div className="mt-2 text-xs font-medium leading-5 text-slate-300">
              Manage devices, generate UDI and ensure full traceability
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-300">
              <span>Geräte: {deviceCount ?? "–"}</span>
              <span className="text-slate-500">|</span>
              <span>UDI erstellt: {deviceCount ?? "–"}</span>
              <span className="text-slate-500">|</span>
              <span>Dokumente: {documentCount ?? "–"}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                System aktiv
              </span>
              <span className="rounded-full border border-slate-500/30 bg-white/5 px-2 py-1">
                UDI-Hash aktiv
              </span>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1">
                Cloud synchronisiert
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsDocsPulseActive(true);
            window.setTimeout(() => setIsDocsPulseActive(false), 900);
            closeActiveDetailView();
            router.push("/docs");
          }}
          className={
            "flex min-h-[96px] flex-col justify-between rounded-2xl px-5 py-4 text-slate-50 transition border border-sky-400/50 bg-sky-500/15 shadow-[0_0_24px_rgba(14,165,233,0.16)] " +
            (isDocumentsActive || isDocsPulseActive ? "animate-pulse" : "hover:bg-sky-500/18")
          }
        >
          <div className="text-center">
            <div className="text-xl font-black tracking-[0.08em] uppercase text-slate-50">
              Dokumente
            </div>
            <div className="mt-2 text-xs font-medium leading-5 text-slate-300">
              DHR, DMR und UDI-Unterlagen
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsAiPulseActive(true);
            window.setTimeout(() => setIsAiPulseActive(false), 900);
            closeActiveDetailView();
            if (pathname !== "/") {
              router.push("/#medsafe-ai");
              return;
            }
            window.location.hash = "medsafe-ai";
            setHash("#medsafe-ai");
          }}
          className={
            "flex min-h-[96px] flex-col justify-between rounded-2xl px-5 py-4 text-slate-50 transition border border-amber-400/40 bg-amber-500/12 shadow-[0_0_24px_rgba(245,158,11,0.14)] " +
            (isAiActive || isAiPulseActive ? "animate-pulse" : "hover:bg-amber-500/16")
          }
        >
          <div className="text-center">
            <div className="text-xl font-black tracking-[0.08em] uppercase text-slate-50">
              MedSafe AI
            </div>
            <div className="mt-2 text-xs font-medium leading-5 text-slate-300">
              Fragen und schnelle MDR Hinweise
            </div>
          </div>
        </button>
      </nav>
    </div>
  );
}
