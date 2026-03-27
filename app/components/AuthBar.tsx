"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { isAdminEmail } from "../../lib/adminAccess";

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [adminFormOpen, setAdminFormOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [createInfo, setCreateInfo] = useState<string | null>(null);
  const isAdmin = isAdminEmail(user?.email);

  //
  // Aktiven User laden + Listener starten
  //
  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error) setUser(data.user ?? null);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  //
  const handleLogin = async () => {
    if (!email) {
      setAuthInfo("Bitte E-Mail eingeben.");
      return;
    }
    if (!password) {
      setAuthInfo("Bitte Passwort eingeben.");
      return;
    }

    setLoading(true);
    setAuthInfo(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      console.error("signInWithPassword error:", error);
      setAuthInfo("Login fehlgeschlagen.");
      return;
    }

    setPassword("");
    setAuthInfo(null);
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setAuthInfo("Bitte zuerst deine E-Mail eingeben.");
      return;
    }

    setLoading(true);
    setAuthInfo(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });

    setLoading(false);

    if (error) {
      console.error("resetPasswordForEmail error:", error);
      setAuthInfo("Reset-Mail konnte nicht gesendet werden.");
      return;
    }

    setAuthInfo("Reset-Mail wurde an deine E-Mail geschickt.");
  };

  const handleCreateUser = async () => {
    if (!createEmail.trim()) {
      setCreateInfo("Bitte eine E-Mail eingeben.");
      return;
    }
    if (createPassword.length < 8) {
      setCreateInfo("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    setCreateInfo(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({
        email: createEmail.trim(),
        password: createPassword,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setCreateInfo(payload?.error || "Benutzer konnte nicht angelegt werden.");
      return;
    }

    setCreateInfo(`Benutzer ${payload?.user?.email || createEmail.trim()} wurde angelegt.`);
    setCreateEmail("");
    setCreatePassword("");
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) {
      setCreateInfo("Bitte eine E-Mail für die Passwortänderung eingeben.");
      return;
    }
    if (resetPassword.length < 8) {
      setCreateInfo("Neues Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    setCreateInfo(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({
        email: resetEmail.trim(),
        password: resetPassword,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setCreateInfo(payload?.error || "Passwort konnte nicht geändert werden.");
      return;
    }

    setCreateInfo(`Passwort aktualisiert für ${payload?.user?.email || resetEmail.trim()}.`);
    setResetEmail("");
    setResetPassword("");
  };

  //
  // Logout – Fehler (AuthSessionMissingError) ignorieren
  //
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    // Session fehlt? Nicht schlimm. Fehler ignorieren.
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("signOut error:", error);
      alert("Fehler beim Logout.");
      return;
    }

    setUser(null);
    setEmail("");

    // UI sauber neu laden
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  //
  // NICHT EINGELOGGT
  //
  if (!user) {
    return (
      <div className="flex w-full flex-col items-stretch gap-1 text-xs sm:w-auto sm:items-end">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            id="auth-email"
            type="email"
            placeholder="E-Mail"
            className="h-9 w-full rounded-full bg-slate-900/80 px-3 text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none sm:h-7 sm:w-auto sm:text-[11px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder="Passwort"
            className="h-9 w-full rounded-full bg-slate-900/80 px-3 text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none sm:h-7 sm:w-auto sm:text-[11px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={handleLogin}
            disabled={loading}
            className="
              h-9 rounded-full
              bg-sky-700
              px-3 text-[12px] font-medium text-white
              shadow-[0_0_8px_rgba(56,189,248,0.4)]
              hover:shadow-[0_0_12px_rgba(56,189,248,0.7)]
              hover:bg-sky-600
              transition-all duration-200
              disabled:opacity-60
              sm:h-7 sm:text-[11px]
            "
          >
            {loading ? "Prüfe…" : "Login"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-300 sm:self-end">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-400"
          />
          Passwort anzeigen
        </label>
        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={loading}
          className="text-[11px] text-sky-200/90 transition hover:text-sky-100 disabled:opacity-60"
        >
          Passwort vergessen?
        </button>
        {authInfo && <div className="text-[11px] text-slate-300">{authInfo}</div>}
      </div>
    );
  }

  //
  // EINGELOGGT
  //
  const initial = user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex flex-col items-end gap-2 text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-[11px] font-semibold text-white">
            {initial}
          </div>
          <span className="max-w-[180px] truncate text-[11px] text-slate-100">
            {user.email}
          </span>
        </div>

        {isAdmin && (
          <button
            onClick={() => setAdminFormOpen((prev) => !prev)}
            className="h-7 rounded-full border border-emerald-400/40 bg-emerald-500/14 px-3 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/20"
          >
            Benutzer anlegen
          </button>
        )}

        <button
          onClick={handleLogout}
          className="h-7 rounded-full bg-red-500/90 px-3 text-[11px] font-medium text-white hover:bg-red-400"
        >
          Logout
        </button>
      </div>

        {isAdmin && adminFormOpen && (
        <div className="w-full max-w-[340px] rounded-2xl border border-emerald-400/20 bg-slate-950/95 p-3 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">
            Admin · Benutzerverwaltung
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-2.5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                Neuer Benutzer
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  placeholder="Neue E-Mail"
                  className="h-9 rounded-full bg-slate-900/80 px-3 text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Neues Passwort"
                  className="h-9 rounded-full bg-slate-900/80 px-3 text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />
                <button
                  onClick={handleCreateUser}
                  disabled={loading}
                  className="h-9 rounded-full border border-emerald-400/40 bg-emerald-500/14 px-4 text-[12px] font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  {loading ? "Speichere…" : "Benutzer speichern"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-2.5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                Passwort ändern
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  placeholder="Benutzer-E-Mail"
                  className="h-9 rounded-full bg-slate-900/80 px-3 text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Neues Passwort"
                  className="h-9 rounded-full bg-slate-900/80 px-3 text-[12px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <button
                  onClick={handleResetPassword}
                  disabled={loading}
                  className="h-9 rounded-full border border-sky-400/40 bg-sky-500/14 px-4 text-[12px] font-medium text-sky-100 hover:bg-sky-500/20 disabled:opacity-60"
                >
                  {loading ? "Aktualisiere…" : "Passwort ändern"}
                </button>
              </div>
            </div>

            {createInfo && <div className="text-[11px] text-slate-300">{createInfo}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
