"use client";

import {
  correctGtinCheckDigit,
  isLikelyGtin,
  validateGtinCheckDigit,
} from "../../lib/udiCore";

type GtinValidationBadgeProps = {
  gtin: string;
  className?: string;
  onCorrect?: (corrected: string) => void;
};

export default function GtinValidationBadge({
  gtin,
  className = "",
  onCorrect,
}: GtinValidationBadgeProps) {
  if (!gtin.trim()) return null;

  if (!isLikelyGtin(gtin)) {
    return (
      <span
        className={
          "inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-300 " +
          className
        }
      >
        Keine numerische GTIN
      </span>
    );
  }

  const result = validateGtinCheckDigit(gtin);

  if (result.valid) {
    return (
      <span
        className={
          "inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-900/30 px-2 py-0.5 text-[10px] text-emerald-100 " +
          className
        }
      >
        <span aria-hidden="true">✓</span>
        GTIN gültig — Prüfziffer korrekt
      </span>
    );
  }

  const corrected = correctGtinCheckDigit(gtin);
  const canAutoFix = validateGtinCheckDigit(corrected).valid;

  return (
    <span className={"inline-flex flex-wrap items-center gap-2 " + className}>
      <span
        className={
          "inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-900/30 px-2 py-0.5 text-[10px] text-rose-100"
        }
      >
        <span aria-hidden="true">✗</span>
        {result.message}
      </span>
      {canAutoFix && onCorrect && (
        <button
          type="button"
          onClick={() => onCorrect(corrected)}
          className="rounded-full border border-amber-500/40 bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-800/40"
        >
          Prüfziffer korrigieren → {corrected}
        </button>
      )}
    </span>
  );
}
