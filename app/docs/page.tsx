"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

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

export default function QmsDocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [documentKey, setDocumentKey] = useState("");
  const [revision, setRevision] = useState("R1");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // User ID holen (für created_by)
  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    };
    loadUser();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("document_key", { ascending: true })
        .order("version", { ascending: false });

      if (error) throw error;

      setDocs((data || []) as DocumentRow[]);
    } catch (e: any) {
      console.error("Fehler beim Laden der documents:", e);
      setMessage("Fehler beim Laden der Dokumente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!documentKey.trim()) {
      setMessage(
        "Bitte einen document_key eingeben (z.B. SOP_7.1_Freigabeprozess)."
      );
      return;
    }
    if (!file) {
      setMessage("Bitte eine Datei auswählen.");
      return;
    }

    setUploading(true);
    setMessage("Upload läuft …");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentKey", documentKey.trim());
      formData.append("revision", revision.trim() || "R1");
      if (userId) formData.append("userId", userId);

      const res = await fetch("/api/qms-documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload fehlgeschlagen.");
      }

      const newDoc: DocumentRow = data.doc;
      setDocs((prev) => [newDoc, ...prev]);

      setMessage(
        `Dokument für "${documentKey}" als Version ${newDoc.version} gespeichert.`
      );
      setFile(null);
      setRevision("R1");
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Fehler beim Upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleOpenDoc = async (doc: DocumentRow) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 60 * 30); // 30 Minuten

      if (error || !data?.signedUrl) {
        console.error("Signed URL Fehler:", error);
        setMessage("Dokument konnte nicht geöffnet werden.");
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      setMessage("Fehler beim Öffnen des Dokuments.");
    }
  };

  const filteredDocs = docs.filter((d) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    const haystack = [
      d.document_key,
      d.revision,
      d.file_name,
      d.sha256,
      d.mime_type,
      d.is_current ? "current" : "old",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <main className="min-h-screen text-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Kopfbereich */}
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">
            Zentrale Dokumentenübersicht
          </h1>
          <p className="text-sm text-slate-400">
            ISO-13485 Dokumente, versioniert und zentral verwaltet.
          </p>
        </header>

        {message && (
          <div className="rounded-md bg-slate-900 border border-slate-700 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        {/* Upload-Formular */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Neues Dokument / neue Version</h2>

          <form onSubmit={handleUpload} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="document_key (z.B. SOP_7.1_Freigabeprozess)"
                value={documentKey}
                onChange={(e) => setDocumentKey(e.target.value)}
              />
              <input
                className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="Revision (z.B. R1)"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
              />
              <input
                type="file"
                onChange={handleFileChange}
                className="text-sm text-slate-200"
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-medium"
            >
              {uploading ? "Upload läuft …" : "Dokument speichern"}
            </button>
          </form>
        </section>

        {/* Liste */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-semibold">Dokumentenregister</h2>
            <div className="flex gap-2">
              <input
                className="w-full md:w-64 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="Suche nach document_key, Revision, Hash…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                onClick={loadDocuments}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm border border-slate-600 hover:border-emerald-500"
              >
                Aktualisieren
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Lade Dokumente …</p>
          ) : filteredDocs.length === 0 ? (
            <p className="text-sm text-slate-400">
              Noch keine Dokumente oder keine Treffer zur Suche.
            </p>
          ) : (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 pr-2">document_key</th>
                    <th className="text-left py-2 pr-2">Version</th>
                    <th className="text-left py-2 pr-2">Revision</th>
                    <th className="text-left py-2 pr-2">Aktiv</th>
                    <th className="text-left py-2 pr-2">Datei</th>
                    <th className="text-left py-2 pr-2">Hash (kurz)</th>
                    <th className="text-left py-2 pr-2">Größe</th>
                    <th className="text-left py-2 pr-2">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d) => (
                    <tr key={d.id} className="border-b border-slate-800">
                      <td className="py-1 pr-2 break-all">{d.document_key}</td>
                      <td className="py-1 pr-2">V{d.version}</td>
                      <td className="py-1 pr-2">{d.revision}</td>
                      <td className="py-1 pr-2">
                        {d.is_current ? "✅" : ""}
                      </td>
                      <td className="py-1 pr-2 break-all">{d.file_name}</td>
                      <td className="py-1 pr-2 break-all">
                        {d.sha256 ? d.sha256.slice(0, 10) + "…" : "–"}
                      </td>
                      <td className="py-1 pr-2">
                        {(d.size_bytes / 1024).toFixed(1)} kB
                      </td>
                      <td className="py-1 pr-2">
                        <button
                          onClick={() => handleOpenDoc(d)}
                          className="text-emerald-400 underline"
                        >
                          Öffnen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
