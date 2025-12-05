"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type DocStatus = "Draft" | "Controlled" | "Final";

type DocumentRow = {
  id: string;
  document_key: string;
  version: number;
  revision: string;
  file_name: string;
  file_path: string;
  sha256: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  created_by: string | null;
  is_current: boolean;
};

export default function DocsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("document_key", { ascending: true })
      .order("version", { ascending: false });

    if (!error && data) {
      setDocs(data);
    }
    setIsLoading(false);
  };

  //
  // Bei Seitenaufruf Daten laden
  //
  useEffect(() => {
    loadDocs();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header>
          <h1 className="text-3xl font-bold">Zentrale Dokumentenübersicht</h1>
          <p className="text-slate-400 text-sm mt-1">
            ISO-13485 Dokumente, versioniert und zentral verwaltet.
          </p>
        </header>


        {/* STATUS MESSAGE */}
        {isLoading && (
          <div className="rounded-xl bg-slate-800 border border-slate-600 p-4">
            Dokumente werden geladen …
          </div>
        )}

        {!isLoading && docs.length === 0 && (
          <div className="rounded-xl bg-slate-800 border border-slate-600 p-4 text-sm">
            Noch keine Dokumente hochgeladen.
          </div>
        )}


        {/* LISTE */}
        {!isLoading && docs.length > 0 && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="py-2">Dokument-Key</th>
                  <th className="py-2">Version</th>
                  <th className="py-2">Revision</th>
                  <th className="py-2">Datei</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">SHA-256</th>
                  <th className="py-2">Datum</th>
                </tr>
              </thead>

              <tbody>
                {docs.map((doc) => {
                  const shortHash = doc.sha256.slice(0, 10) + "…";
                  return (
                    <tr
                      key={doc.id}
                      className="border-b border-slate-800 hover:bg-slate-800/60"
                    >
                      <td className="py-2">{doc.document_key}</td>
                      <td className="py-2">V{doc.version}</td>
                      <td className="py-2">{doc.revision}</td>
                      <td className="py-2 break-all">{doc.file_name}</td>
                      <td className="py-2">
                        {doc.is_current ? (
                          <span className="text-emerald-400">Aktiv</span>
                        ) : (
                          <span className="text-slate-500">Alt</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-slate-400">
                        {shortHash}
                      </td>
                      <td className="py-2">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Reload Button */}
        <button
          onClick={loadDocs}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm"
        >
          Liste aktualisieren
        </button>

      </div>
    </main>
  );
}
