"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setReady(Boolean(data.session));
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setInfo("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (password !== confirmPassword) {
      setInfo("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    setInfo(null);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      console.error("updateUser password error:", error);
      setInfo("Passwort konnte nicht gesetzt werden.");
      return;
    }

    setInfo("Passwort wurde erfolgreich geändert.");
    setPassword("");
    setConfirmPassword("");
    window.setTimeout(async () => {
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    }, 1200);
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-sky-400/20 bg-slate-950/95 p-6 shadow-[0_0_32px_rgba(56,189,248,0.12)]">
        <div className="mb-5 text-center">
          <div className="text-xs uppercase tracking-[0.18em] text-sky-200/80">
            Passwort zurücksetzen
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">
            Neues Passwort setzen
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Öffne zuerst den Link aus deiner Reset-Mail und setze dann hier dein neues Passwort.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Neues Passwort"
            className="h-11 rounded-full border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready || loading}
          />
          <input
            type="password"
            placeholder="Passwort wiederholen"
            className="h-11 rounded-full border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={!ready || loading}
          />
          <button
            type="submit"
            disabled={!ready || loading}
            className="h-11 rounded-full border border-sky-400/35 bg-sky-500/14 px-5 text-sm font-medium text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.12)] hover:bg-sky-500/20 disabled:opacity-60"
          >
            {loading ? "Speichere…" : "Passwort speichern"}
          </button>
        </form>

        {!ready && (
          <div className="mt-3 text-center text-xs text-slate-400">
            Kein gültiger Recovery-Link erkannt.
          </div>
        )}

        {info && <div className="mt-3 text-center text-xs text-slate-300">{info}</div>}
      </div>
    </main>
  );
}
