"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LandingLoginPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim()) {
      setInfo("Bitte eine E-Mail eingeben.");
      return;
    }
    if (!password.trim()) {
      setInfo("Bitte ein Passwort eingeben.");
      return;
    }

    setLoading(true);
    setInfo(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      console.error("landing signInWithPassword error:", error);
      setInfo("Login fehlgeschlagen.");
      return;
    }

    setInfo("Login erfolgreich.");
    setEmail("");
    setPassword("");
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setInfo("Bitte zuerst deine E-Mail eingeben.");
      return;
    }

    setLoading(true);
    setInfo(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });

    setLoading(false);

    if (error) {
      console.error("resetPasswordForEmail error:", error);
      setInfo("Reset-Mail konnte nicht gesendet werden.");
      return;
    }

    setInfo("Reset-Mail wurde an deine E-Mail geschickt.");
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-emerald-500/20 bg-slate-950/90 p-3 shadow-[0_0_24px_rgba(16,185,129,0.08)] sm:p-4">
      <div className="flex flex-col gap-2">
        <input
          id="auth-email"
          type="email"
          placeholder="E-Mail"
          className="h-11 flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder:text-slate-500 caret-emerald-300 [color-scheme:dark] autofill:bg-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 [-webkit-text-fill-color:#f8fafc] [-webkit-box-shadow:0_0_0px_1000px_rgb(15,23,42)_inset] [transition:background-color_9999s_ease-in-out_0s]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          id="auth-password"
          type={showPassword ? "text" : "password"}
          placeholder="Passwort"
          className="h-11 flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder:text-slate-500 caret-emerald-300 [color-scheme:dark] autofill:bg-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 [-webkit-text-fill-color:#f8fafc] [-webkit-box-shadow:0_0_0px_1000px_rgb(15,23,42)_inset] [transition:background-color_9999s_ease-in-out_0s]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleLogin();
            }
          }}
        />
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="h-11 rounded-full border border-emerald-400/35 bg-emerald-500/14 px-5 text-sm font-medium text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.12)] hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {loading ? "Prüfe…" : "Login"}
        </button>
      </div>
      <label className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
          className="h-3.5 w-3.5 accent-emerald-400"
        />
        Passwort anzeigen
      </label>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={loading}
          className="text-xs text-sky-200/90 transition hover:text-sky-100 disabled:opacity-60"
        >
          Passwort vergessen?
        </button>
      </div>
      {info && <div className="mt-2 text-center text-xs text-slate-300">{info}</div>}
    </div>
  );
}
