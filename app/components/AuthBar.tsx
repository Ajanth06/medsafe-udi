"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient"; // <- wie in deinem alten Code

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("onAuthStateChange:", event, session);
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    if (!email) {
      alert("Bitte E-Mail eingeben.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setLoading(false);

    if (error) {
      console.error("signInWithOtp error:", error);
      alert("Fehler beim Senden des Login-Links.");
      return;
    }

    alert("Login-Link wurde an deine E-Mail geschickt.");
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("signOut error:", error);
      alert("Fehler beim Logout.");
      return;
    }

    setUser(null);
    setEmail("");

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  // nicht eingeloggt
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

  // eingeloggt
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-[11px] font-semibold text-white">
  M
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
