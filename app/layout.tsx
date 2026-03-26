import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AuthBar from "./components/AuthBar";
import HeaderAiLauncher from "./components/HeaderAiLauncher";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "MedSafe-UDI",
  description: "Dezentrale UDI- & Dokumentenverwaltung für Medizinprodukte",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className="bg-slate-950">
      <body className="min-h-screen w-full bg-slate-950 text-slate-50 antialiased">
        <div className="relative min-h-screen w-full min-w-full overflow-visible bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* weiche Farb-Blobs */}
          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />

          <div className="relative mx-auto flex min-h-screen w-full min-w-0 max-w-[1800px] flex-col gap-5 px-6 py-6 sm:px-8 lg:px-10 2xl:px-10">
            {/* HEADER */}
           <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-slate-950/60 backdrop-blur-2xl gap-3">

  {/* Links: MEDSAFE-Card + Vogel */}
  <div className="flex flex-wrap items-center gap-4">
    {/* Vogel mit Glow + Bounce */}
   <div className="relative w-20 h-20 flex items-center justify-center">
  {/* Glow-Kreis */}
  <div className="absolute inset-1 rounded-full bg-sky-500/10 blur-md" />

  {/* Innerer Kreis + Vogel */}
  <div className="relative w-10 h-10 rounded-full bg-slate-900 border border-sky-400/60 shadow-[0_0_16px_rgba(56,189,248,0.12)] flex items-center justify-center float-soft">
    <img
      src="/icons/red-bird.svg"
      alt="MedSafe Bird"
      className="h-70 w-70"
    />
  </div>
</div>

    <HeaderAiLauncher />


  </div>

  {/* Rechts: Online-Status + AuthBar */}
  <div className="ml-auto flex flex-col items-end gap-2">
    <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-slate-100/80 sm:flex">
      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/80 animate-pulse" />
      <span>Online</span>
    </div>

    <AuthBar />
  </div>
</header>


            <Sidebar />

            <main className="flex-1 overflow-visible rounded-3xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-slate-950/70 backdrop-blur-2xl sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
