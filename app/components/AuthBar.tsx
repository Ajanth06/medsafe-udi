"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient"; // <-- Pfad korrekt für: app/components/AuthBar.tsx

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  // --- User laden & Listener aktivieren ---
  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("getUser error:", error);
        return;
      }
      setUser(data.user ?? null);
    };

    loadUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("onAuthStateChange:", event, session);
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // --- Login ---
  const handleLogin = async () => {
    if (!email) {
      alert("Bitte E-Mail eingeben.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin, // wichtig!
      },
    });

    setLoading(false);

    if (error) {
      console.error("signInWithOtp error:", error);
      alert("Login fehlgeschlagen");
      return;
    }

    alert("Login-Link wurde an deine E-Mail geschickt.");
  };

  // --- Logout ---
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("signOut error:", error);
      alert("Fehler beim Logout");
      return;
    }

    setUser(null);
    setEmail("");

    window.location.reload();
  };

  // --- Falls ausgeloggt ---
  if (!user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <input
          type="email"
          placeholder="E-Mail"
          className="h-7 rounded-full bg-slate-900/80 px-3 text-[11px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          className="h-7 rounded-full bg-sky-500 px-3 text-[11px] font-medium text-white hover:bg-sky-400 disabled:opacity-60"
        >
          {loading ? "Sende…" : "Login-Link"}
        </button>
      </div>
    );
  }

  // --- Eingeloggt ---
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-[11px] font-semibold text-white">
          {(user.email ?? "?")[0]?.toUpperCase()}
        </div>
        <span className="max-w-[180px] truncate text-[11px] text-slate-100">
          {user.email}
        </span>
      </div>
      <button
        onClick={handleLogout}
        className="h-7 rounded-full bg-red-500/90 px-3 text-[11px] font-medium text-white hover:bg-red-400"
      >
        Logout
      </button>
    </div>
  );
}
