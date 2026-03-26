import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppHeader from "./components/AppHeader";
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
            <AppHeader />

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
