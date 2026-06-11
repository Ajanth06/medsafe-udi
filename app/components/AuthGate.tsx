"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { loadUserWithTimeout } from "../../lib/authBootstrap";
import LandingLoginPanel from "./LandingLoginPanel";

type AuthGateProps = {
  children: (user: User) => ReactNode;
  title?: string;
};

export default function AuthGate({ children, title }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setUser(await loadUserWithTimeout());
      setLoading(false);
    };

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-center text-slate-300">
        Sitzung wird geladen …
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {title && (
          <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        )}
        <LandingLoginPanel />
      </div>
    );
  }

  return <>{children(user)}</>;
}
