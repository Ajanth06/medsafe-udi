"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };

    loadUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

 const handleLogin = async () => {
  if (!email) {
    alert("Bitte E-Mail eingeben.");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // wichtig: immer auf die aktuelle Origin zurück
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error(error);
    alert("Fehler beim Senden des Login-Links");
    return;
  }

  alert("Login-Link wurde an deine E-Mail geschickt.");
};


    const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(error);
      alert("Fehler beim Logout");
      return;
    }

    // Frontend-Status zurücksetzen
    setUser(null);
    setEmail("");

    // Seite neu laden, damit alles sauber ist
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };


  if (!user) {
    return (
      <div className="text-xs">
        <input
          type="email"
          placeholder="E-Mail"
          className="text-black rounded px-2 py-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          onClick={handleLogin}
          className="ml-2 px-2 py-1 bg-sky-500 rounded"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs">
      Eingeloggt als {user.email}
      <button
        onClick={handleLogout}
        className="ml-2 px-2 py-1 bg-red-500 rounded"
      >
        Logout
      </button>
    </div>
  );
}
