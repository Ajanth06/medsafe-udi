import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AuthBar from "./components/AuthBar";  // ✔️ RICHTIGER PFAD

export const metadata: Metadata = {
  title: "MedSafe-UDI",
  description: "Dezentrale UDI- & Dokumentenverwaltung für Medizinprodukte",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">

          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />

          <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">

            {/* HEADER */}
            <header className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-slate-950/60 backdrop-blur-2xl">

              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-base font-semibold text-slate-950 shadow-lg shadow-sky-900/50">
                  M
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-tight">MedSafe-UDI</div>
                  <div className="text-[11px] text-slate-300/80">UDI · DMR · Dokumenten-Cloud</div>
                </div>
              </div>

              {/* AuthBar rechts */}
              <div className="flex flex-col items-end gap-2">
                <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-slate-100/80 sm:flex">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/80" />
                  <span>Online · Supabase verbunden</span>
                </div>

                <AuthBar />   {/* ✔️ funktioniert */}
              </div>
            </header>

            {/* REST DEINES LAYOUTS ... */}
