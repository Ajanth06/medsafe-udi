"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DialogTone = "emerald" | "amber" | "rose";

type MedSafeDialogCardProps = {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requirePin?: boolean;
  pinDescription?: string;
  tone?: DialogTone;
  validatePin?: (pin: string) => boolean;
  onConfirm: (pin?: string) => void;
  onCancel: () => void;
};

const TONE_STYLES: Record<
  DialogTone,
  {
    card: string;
    title: string;
    confirm: string;
    pinFocus: string;
  }
> = {
  emerald: {
    card: "border-emerald-300/40 shadow-[0_0_34px_rgba(16,185,129,0.32)]",
    title: "text-emerald-100",
    confirm: "bg-emerald-600 hover:bg-emerald-500",
    pinFocus: "focus:border-emerald-500",
  },
  amber: {
    card: "border-amber-400/40 shadow-[0_0_34px_rgba(245,158,11,0.28)]",
    title: "text-amber-100",
    confirm: "bg-amber-600 hover:bg-amber-500",
    pinFocus: "focus:border-amber-400",
  },
  rose: {
    card: "border-rose-400/40 shadow-[0_0_34px_rgba(244,63,94,0.28)]",
    title: "text-rose-100",
    confirm: "bg-rose-600 hover:bg-rose-500",
    pinFocus: "focus:border-rose-400",
  },
};

function MedSafeLogoBadge() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-300/50 bg-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.28)]">
      <img
        src="/partners/roche.png?v=20260327-2"
        alt="MedSafe Logo"
        className="h-6 w-auto object-contain"
      />
    </div>
  );
}

export default function MedSafeDialogCard({
  open,
  title,
  text,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  requirePin = false,
  pinDescription = "Admin-PIN eingeben (nicht dein Login-Passwort).",
  tone = "emerald",
  validatePin,
  onConfirm,
  onCancel,
}: MedSafeDialogCardProps) {
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = TONE_STYLES[tone];

  useEffect(() => {
    if (!open) return;
    setPin("");
    setPinError("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (requirePin) {
      const normalizedPin = pin.trim();
      if (!normalizedPin) return;
      if (validatePin && !validatePin(normalizedPin)) {
        setPinError("Admin-PIN falsch. Bitte erneut versuchen.");
        return;
      }
      onConfirm(normalizedPin);
      return;
    }
    onConfirm();
  };

  const textBlocks = text
    ? text.split("\n\n").map((block) => block.trim()).filter(Boolean)
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className={
          "w-full max-w-md rounded-2xl border bg-slate-950/95 px-5 py-4 text-slate-100 backdrop-blur-xl " +
          styles.card
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="medsafe-dialog-title"
      >
        <div className="flex items-start gap-3">
          <MedSafeLogoBadge />
          <div className="min-w-0 flex-1">
            <h3 id="medsafe-dialog-title" className={"text-sm font-semibold " + styles.title}>
              {title}
            </h3>
            {textBlocks.length > 0 && (
              <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                {textBlocks.map((block) => (
                  <p key={block}>{block}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {requirePin && (
          <div className="mt-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                Admin-PIN
              </span>
              {pinDescription && (
                <span className="mt-0.5 block text-[11px] text-slate-400">{pinDescription}</span>
              )}
              <input
                ref={inputRef}
                type="password"
                autoComplete="off"
                className={
                  "mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none " +
                  styles.pinFocus
                }
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value);
                  if (pinError) setPinError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleConfirm();
                  if (event.key === "Escape") onCancel();
                }}
              />
            </label>
            {pinError && <p className="mt-1.5 text-xs text-rose-300">{pinError}</p>}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={requirePin && !pin.trim()}
            onClick={handleConfirm}
            className={
              "rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50 " +
              styles.confirm
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
