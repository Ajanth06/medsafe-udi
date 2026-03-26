"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function HeaderAiLauncher() {
  const pathname = usePathname();
  const router = useRouter();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const syncHash = () => {
      setIsActive(pathname === "/" && window.location.hash === "#medsafe-ai");
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  const openAiAssistant = () => {
    window.dispatchEvent(new CustomEvent("medsafe:close-detail"));

    if (pathname !== "/") {
      router.push("/#medsafe-ai");
      return;
    }

    window.location.hash = "medsafe-ai";
  };

  return (
    <button
      type="button"
      onClick={openAiAssistant}
      className={
        "group flex min-w-[170px] flex-col justify-center rounded-2xl border px-4 py-3 text-left transition " +
        (isActive
          ? "border-amber-400/40 bg-slate-950 shadow-[0_0_22px_rgba(245,158,11,0.18)]"
          : "border-amber-500/25 bg-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.1)] hover:border-amber-400/35 hover:bg-slate-900")
      }
    >
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-200">
        MedSafe AI
      </div>
      <div className="mt-1 text-xs font-medium leading-5 text-slate-200">
        Fragen und schnelle MDR Hinweise
      </div>
    </button>
  );
}
