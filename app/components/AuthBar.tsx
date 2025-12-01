"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // User laden & auf Änderungen hören
  useEffect(() => {
    let ignore = false;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!ignore) {
        setUser(data.user ?? null);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim()) {
      setMessage("Bitte E-Mail eintragen.");
      return;
    }
    setLoading(true);
    setMessage("Login-Link wird gesendet …");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        console.error(error);
        setMessage("Fehler beim Senden des Login-Links: " + error.message);
      } else {
        setMessage("Magic-Link gesendet. Postfach prüfen.");
      }
    } catch (e: any) {
      console.error(e);
      setMessage("Login-Fehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await supabase.auth.signOut();
      setMessage("Abgemeldet.");
    } catch (e: any) {
      console.error(e);
      setMessage("Logout-Fehler.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-end gap-1 text-xs md:text-sm">
      {user ? (
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-200">
            Eingeloggt als{" "}
            <span className="font-semibold">
              {user.email || user.id.slice(0, 8)}
            </span>
          </div>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="rounded-lg border border-slate-700 px-3 py-1 bg-slate-900 hover:border-rose-500 disabled:opacity-60"
          >
            Logout
          </button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-end gap-2">
          <input
            type="email"
            placeholder="E-Mail für Login"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-slate-900 rounded-lg px-3 py-1 border border-slate-700 text-xs md:text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleLogin}
            disabled={loading}
            className="rounded-lg border border-slate-700 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-xs md:text-sm font-medium disabled:opacity-60"
          >
            {loading ? "…" : "Login-Link schicken"}
          </button>
        </div>
      )}
      {message && (
        <div className="text-[11px] text-slate-400 max-w-xs text-right">
          {message}
        </div>
      )}
    </div>
  );
}
