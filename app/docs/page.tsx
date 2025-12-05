"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient"; // ⬅️ WICHTIG: relativer Pfad!

type DocumentRow = {
  id: string;
  document_key: string;
  version: number;
  revision: string;
  created_at: string;
};

export default function DocsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDocs = async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, document_key, version, revision, created_at")
        .eq("is_current", true)
        .order("document_key", { ascending: true });

      if (error) {
        console.error("Fehler beim Laden der Dokumente:", error.message);
      } else if (data) {
        setDocs(data as DocumentRow[]);
      }

      setLoading(false);
    };

    loadDocs();
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-slate-200">
        Dokumente werden geladen …
      </div>
    );
  }

  return (
    <div className="text-slate-100 p-4">
      <h1 className="text-xl font-semibold mb-4">
        Dokumente (ISO 13485 – Versioniert)
      </h1>

      {docs.length === 0 && (
        <p className="text-sm text-slate-400">
          Noch keine Dokumente hochgeladen.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="border border-slate-600/60 bg-slate-800/50 backdrop-blur-md rounded-xl p-4 shadow-xl hover:bg-slate-800/70 transition"
          >
            <div className="text-sm font-semibold tracking-wide">
              {doc.document_key}
            </div>

            <div className="text-xs text-slate-400 mt-1">
              Version: {doc.version} · Revision: {doc.revision}
            </div>

            <div className="text-[11px] text-slate-500 mt-2">
              Erstellt: {new Date(doc.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
