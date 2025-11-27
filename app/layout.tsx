import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedSafe-UDI",
  description: "Dezentrale UDI- & Dokumentenverwaltung für Medizinprodukte",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
