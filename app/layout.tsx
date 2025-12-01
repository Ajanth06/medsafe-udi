// app/layout.tsx

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedSafe-UDI",
  description: "Dezentrale UDI- & Dokumentenverwaltung für Medizinprodukte",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        {/* Vollbild-Gradient-Hintergrund (Apple-/SaaS-Vibe) */}
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* Zentrale Breite */}
          <div className="mx-auto flex min-h-screen max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
            
            {/* --- Sidebar links --- */}
            <aside className="hidden w-64 flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-2xl md:flex">
              <div>
                {/* Logo / Titel-Block */}
                <div className="mb-8 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/90 shadow-lg shadow-sky-900/40">
                    <span className="text-lg font-semibold">M</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-tight">
                      MedSafe-UDI
                    </div>
                    <div className="text-[11px] text-slate-300/80">
                      UDI · DMR · Docs
                    </div>
                  </div>
                </div>

                {/* Navigation */}
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
                    href="#"
                    className="block rounded-2xl px-3 py-2 text-slate-200/80 hover:bg-white/5 hover:text-white"
                  >
                    Dokumente
                  </a>
                  <a
                    href="#"
                    className="block rounded-2xl px-3 py-2 text-slate-200/80 hover:bg-white/5 hover:text-white"
                  >
                    Chargen & Serien
                  </a>
                  <a
                    href="#"
                    className="block rounded-2xl px-3 py-2 text-slate-200/80 hover:bg-white/5 hover:text-white"
                  >
                    Audit-Log (bald)
                  </a>
                </nav>
              </div>

              {/* Sidebar-Footer */}
              <div className="mt-6 rounded-2xl bg-black/40 px-3 py-3 text-xs text-slate-300/80">
                <div className="mb-1 font-medium">Pro-Funktionen bereit</div>
                <div className="text-[11px] text-slate-400">
                  UDI-Hash, DMR/DHR, Recall-Status & IPFS-Archiv sind vorbereitet.
                </div>
              </div>
            </aside>

            {/* --- Hauptbereich: Header + Content-Card --- */}
            <div className="flex flex-1 flex-col gap-4">
              
              {/* Header oben (Apple/SaaS-Stil) */}
              <header className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-slate-950/50 backdrop-blur-2xl">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300/80">
                    Dashboard
                  </div>
                  <div className="text-sm font-semibold text-slate-50">
                    MedSafe-UDI · Geräte & UDI-Verwaltung
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-slate-100/80 sm:flex">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/80"></span>
                    <span>Online · Supabase verbunden</span>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-50 text-xs font-semibold text-slate-900">
                    AR
                  </div>
                </div>
              </header>

              {/* Content-Bereich wie im Screenshot: große Glas-Card */}
              <main className="flex-1 overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-slate-950/70 backdrop-blur-2xl sm:p-6">
                {children}
              </main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
