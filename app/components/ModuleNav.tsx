"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const MODULE_LINKS = [
  { href: "/#udi", label: "UDI", match: (p: string, h: string) => p === "/" && h === "#udi" },
  { href: "/docs", label: "Dokumente", match: (p: string) => p.startsWith("/docs") },
  { href: "/batches", label: "Chargen", match: (p: string) => p.startsWith("/batches") },
  { href: "/audit-log", label: "Audit-Log", match: (p: string) => p.startsWith("/audit-log") },
  { href: "/risk-analysis", label: "Risiko", match: (p: string) => p.startsWith("/risk-analysis") },
  { href: "/#medsafe-ai", label: "KI", match: (p: string, h: string) => p === "/" && h === "#medsafe-ai" },
] as const;

export default function ModuleNav() {
  const pathname = usePathname() || "";
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {MODULE_LINKS.map((link) => {
        const active = link.match(pathname, hash);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-medium transition " +
              (active
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10")
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
