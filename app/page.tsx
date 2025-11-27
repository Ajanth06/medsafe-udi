// app/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";

type DeviceEntry = {
  id: string;
  name: string;
  udiDi: string;
  serial: string;
  hash: string;
  ipfsHash?: string;
  createdAt: string;
};

const STORAGE_KEY = "medsafe-udi-devices-v1";

// Hilfsfunktion für SHA-256 im Browser
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function HomePage() {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [name, setName] = useState("");
  const [udiDi, setUdiDi] = useState("");
  const [serial, setSerial] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Geräte aus localStorage laden
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setDevices(JSON.parse(raw));
      }
    } catch (e) {
      console.error("Fehler beim Laden aus localStorage", e);
    }
  }, []);

  // Geräte in localStorage speichern
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    } catch (e) {
      console.error("Fehler beim Speichern in localStorage", e);
    }
  }, [devices]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!udiDi || !serial) {
      setError("Bitte mindestens UDI-DI und Seriennummer eingeben.");
      return;
    }

    setIsUploading(true);
    try {
      let ipfsHash: string | undefined;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload fehlgeschlagen");
        }

        const data = await res.json();
        ipfsHash = data.ipfsHash;
      }

      const hash = await sha256(`${udiDi}|${serial}`);
      const newEntry: DeviceEntry = {
        id: crypto.randomUUID(),
        name: name || "Unbenanntes Gerät",
        udiDi,
        serial,
        hash,
        ipfsHash,
        createdAt: new Date().toISOString(),
      };

      setDevices((prev) => [newEntry, ...prev]);

      // Formular zurücksetzen
      setName("");
      setUdiDi("");
      setSerial("");
      setFile(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unbekannter Fehler");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDelete(id: string) {
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">MedSafe-UDI Dashboard</h1>
          <p className="text-slate-300 text-sm">
            Offline-Verwaltung deiner Medizinprodukte im Browser + Upload der
            Dokumente zu Pinata (IPFS). Kein Login, keine Passwörter – volle
            Kontrolle.
          </p>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Neues Gerät erfassen</h2>
          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-700/60 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">
                  Gerätename / Typ
                </label>
                <input
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Freezo FZ-380"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">UDI-DI *</label>
                <input
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  value={udiDi}
                  onChange={(e) => setUdiDi(e.target.value)}
                  placeholder="Basis-UDI-DI"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">
                  Seriennummer *
                </label>
                <input
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="Seriennummer"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">
                  Datei für Pinata (optional)
                </label>
                <input
                  type="file"
                  className="w-full text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-emerald-400"
                  onChange={(e) =>
                    setFile(e.target.files ? e.target.files[0] : null)
                  }
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isUploading ? "Wird hochgeladen..." : "Gerät speichern"}
            </button>
          </form>
        </section>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Gespeicherte Geräte</h2>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-400">
              Noch keine Einträge. Erfasse oben dein erstes Gerät.
            </p>
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">UDI-DI</th>
                    <th className="px-3 py-2 text-left">Serien-Nr.</th>
                    <th className="px-3 py-2 text-left">UDI-Hash</th>
                    <th className="px-3 py-2 text-left">IPFS / Pinata</th>
                    <th className="px-3 py-2 text-left">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr
                      key={d.id}
                      className="border-t border-slate-800 odd:bg-slate-950/40"
                    >
                      <td className="px-3 py-2">{d.name}</td>
                      <td className="px-3 py-2">{d.udiDi}</td>
                      <td className="px-3 py-2">{d.serial}</td>
                      <td className="px-3 py-2 max-w-xs truncate">
                        <code className="text-xs">{d.hash}</code>
                      </td>
                      <td className="px-3 py-2">
                        {d.ipfsHash ? (
                          <a
                            href={`https://gateway.pinata.cloud/ipfs/${d.ipfsHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 underline"
                          >
                            {d.ipfsHash.slice(0, 8)}…
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">
                            keine Datei
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Löschen
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
