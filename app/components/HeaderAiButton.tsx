"use client";

export default function HeaderAiButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("medsafe:close-detail"));
        window.dispatchEvent(new CustomEvent("medsafe:open-ai-modal"));
      }}
      className="rounded-2xl border border-amber-400/40 bg-amber-500/12 px-4 py-3 text-left shadow-[0_0_20px_rgba(245,158,11,0.16)] transition hover:bg-amber-500/18"
    >
      <div className="text-sm font-black uppercase tracking-[0.08em] text-amber-100">
        MedSafe AI
      </div>
      <div className="mt-1 text-[11px] leading-5 text-amber-100/80">
        Copilot, Fragen und schnelle UDI-Hinweise
      </div>
    </button>
  );
}
