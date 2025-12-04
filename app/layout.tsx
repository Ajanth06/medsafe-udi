import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AuthBar from "./components/AuthBar";

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
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* weiche Farb-Blobs */}
          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />

          <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
            {/* HEADER */}
           <header className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-slate-950/60 backdrop-blur-2xl">
  {/* Links: MEDSAFE-Card + Vogel */}
  <div className="flex items-center gap-4">
    {/* Glow-Card MEDSAFE-UDI */}
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 shadow-[0_0_20px_rgba(0,150,255,0.3)] backdrop-blur-xl">
      <div className="text-lg font-bold tracking-wide text-sky-100">
        MEDSAFE-UDI
      </div>
      <div className="text-[11px] text-slate-300/80 mt-0.5">
        UDI · MDR · DOCUMENT CLOUD
      </div>
    </div>

    {/* Vogel mit Glow + Bounce */}
   <div className="relative w-20 h-20 flex items-center justify-center">
  {/* Glow-Kreis */}
  <div className="absolute inset-0 rounded-full bg-sky-500/30 animate-ping" />

  {/* Innerer Kreis + Vogel */}
  <div className="relative w-18 h-18 rounded-full bg-slate-900 border border-sky-400 flex items-center justify-center float-soft">
    <img
      src="/icons/red-bird.svg"
      alt="MedSafe Bird"
      className="h-70 w-70"
    />
  </div>
</div>


  </div>

  {/* Rechts: Online-Status + AuthBar */}
    <div className="flex flex-col items-end gap-2 mr-3 sm:mr-6">
    <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-slate-100/80 sm:flex">
      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/80 animate-pulse" />
      <span>Online</span>
    </div>

    <AuthBar />
  </div>
</header>


            {/* Layout mit Sidebar + Inhalt */}
            <div className="flex flex-1 flex-col gap-4 md:flex-row">
              {/* Sidebar */}
              <aside className="md:w-64">
  <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/70 backdrop-blur-2xl">
    <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-slate-300/80">
      Navigation
    </div>

<nav className="space-y-1 text-sm">
  <a href="/" className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-slate-50 shadow-inner shadow-white/10">
    <span>Geräteübersicht</span>
    <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">Aktiv</span>
  </a>

  <a href="/docs" className="flex items-center justify-between rounded-2xl px-3 py-2 text-slate-200/80 hover:bg-white/5 hover:text-white">
    <span>Dokumente</span>
    <span className="text-[10px] text-slate-400">DMR/DHR</span>
  </a>
</nav>



                  <div className="mt-2 rounded-2xl bg-black/40 px-3 py-3 text-[11px] text-slate-300/85">
                    <div className="mb-1 font-medium">
                      Pro-Funktionen vorbereitet
                    </div>
                    <div className="text-[11px] text-slate-400">
                      UDI-Hash, Recall-Status, DMR/DHR-Links und IPFS-Archiv
                      kannst du später direkt hier im Layout erweitern.
                    </div>
                  </div>
                </div>
              </aside>

              {/* Inhalt */}
              <section className="flex-1">
                <div className="flex h-full flex-col gap-4">
                  {/* Top-Karten */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm shadow-lg shadow-slate-950/60 backdrop-blur-2xl">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300/80">
                        Überblick
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-50">
                        Geräte &amp; UDI-Verwaltung
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-300/85">
                        Deine zentrale Übersicht für UDI-DI, UDI-PI,
                        Seriennummern, Chargen und verknüpfte Dokumente.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm shadow-lg shadow-emerald-900/50 backdrop-blur-2xl">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/90">
                        Integrität
                      </div>
                      <div className="mt-1 text-sm font-semibold text-emerald-50">
                        UDI-Hash aktiv
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/85">
                        Geräte werden mit kryptografischem Hash gespeichert –
                        ideal für MDR-/ISO-13485-Audits.
                      </p>
                    </div>
                    

                    <div className="rounded-3xl border border-sky-500/25 bg-sky-500/10 p-4 text-sm shadow-lg shadow-sky-900/50 backdrop-blur-2xl">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-sky-100/90">
                        Status
                      </div>
                      <div className="mt-1 text-sm font-semibold text-sky-50">
                        Cloud-Register
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-sky-100/85">
                        Supabase als sicheres Backend. Bereit für Recall-Logik,
                        Blockierung und Archivierung.
                      </p>
                    </div>
                  </div>

                  {/* Seiteninhalt */}
                  <main className="flex-1 overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-slate-950/70 backdrop-blur-2xl sm:p-6">
                    {children}
                  </main>
                </div>
              </section>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}


