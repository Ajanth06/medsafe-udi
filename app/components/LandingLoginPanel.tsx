"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LandingLoginPanel() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim()) {
      setInfo("Bitte eine E-Mail eingeben.");
      return;
    }

    setLoading(true);
    setInfo(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });

    setLoading(false);

    if (error) {
      console.error("landing signInWithOtp error:", error);
      setInfo("Fehler beim Senden des Login-Links.");
      return;
    }

    setInfo("Login-Link wurde an deine E-Mail geschickt.");
    setEmail("");
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-emerald-500/20 bg-slate-950/90 p-3 shadow-[0_0_24px_rgba(16,185,129,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="auth-email"
          type="email"
          placeholder="E-Mail"
          className="h-11 flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="h-11 rounded-full border border-emerald-400/35 bg-emerald-500/14 px-5 text-sm font-medium text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.12)] hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {loading ? "Sende…" : "Login-Link"}
        </button>
      </div>
      {info && <div className="mt-2 text-center text-xs text-slate-300">{info}</div>}
    </div>
  );
}
