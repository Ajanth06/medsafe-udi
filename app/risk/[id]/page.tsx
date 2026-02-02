"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import FmeaTable from "../../components/FmeaTable";
import type { FmeaRowDb } from "../../../utils/riskFmea";

type RiskPageProps = {
  params: { id: string };
};

export default function RiskDetailPage({ params }: RiskPageProps) {
  const [rows, setRows] = useState<FmeaRowDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadRows = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setMessage("Bitte einloggen, um FMEA-Daten zu sehen.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("fmea_rows")
        .select("*")
        .eq("risk_analysis_id", params.id)
        .order("created_at", { ascending: true });

      if (error) {
        setMessage("FMEA-Daten konnten nicht geladen werden.");
      } else {
        setRows((data || []) as FmeaRowDb[]);
      }
      setLoading(false);
    };

    loadRows();
  }, [params.id]);

  if (loading) {
    return <div className="text-slate-200">Lade …</div>;
  }

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100">
      <div className="space-y-6 p-6">
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-lg shadow-black/20 backdrop-blur-2xl">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Risk Analysis
          </div>
          <h1 className="text-2xl font-semibold">FMEA Table</h1>
          <div className="text-sm text-slate-400 mt-1">
            Live RPN / Risk / Acceptability mit serverseitiger Validierung.
          </div>
        </section>

        {message && (
          <div className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        <FmeaTable riskAnalysisId={params.id} initialRows={rows} />
      </div>
    </main>
  );
}
