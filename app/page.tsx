"use client";

import React, { useEffect, useState } from "react";

type Device = {
  id: string;
  name: string;       // Produktname
  udiDi: string;      // UDI-DI
  serial: string;     // Seriennummer
  udiHash: string;    // SHA-256 Hash aus UDI-DI + Seriennummer
  createdAt: string;

  // 🔥 NEU: UDI-PI / Batch / Datums-Codes
  batch?: string;          // z.B. 251127-01
  productionDate?: string; // YYMMDD
  expiryDate?: string;     // YYMMDD
  udiPi?: string;          // kompletter GS1-UDI-PI-String
};

type Doc = {
  id: string;
  deviceId: string;
  name: string;
  cid: string;
  url: string;
  createdAt: string;
  category?: string;  // Kategorie für MDR-Dokumente
};

type AuditEntry = {
  id: string;
  deviceId: string | null;
  action: string;
  message: string;
  timestamp: string;
};

const DEVICES_KEY = "medsafe_devices";
const DOCS_KEY = "medsafe_docs";
const AUDIT_KEY = "medsafe_audit";

// feste Kategorien für MDR-Dokumente
const DOC_CATEGORIES = [
  "Konformität / Declaration of Conformity",
  "Risikoanalyse",
  "Gebrauchsanweisung / IFU",
  "Servicebericht",
  "Wartungsprotokoll",
  "IQ/OQ/PQ",
  "Firmware / Software",
  "Sonstiges",
];

// 🔐 UDI-Hash berechnen (läuft im Browser)
async function hashUdi(udiDi: string, serial: string): Promise<string> {
  const input = `${udiDi}|${serial}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

// 🔥 NEU: Datums-Codes im GS1-Format (YYMMDD)
function formatDateYYMMDD(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export default function MedSafePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [newProductName, setNewProductName] = useState("");
  const [newUdi, setNewUdi] = useState("");
  const [newSerial, setNewSerial] = useState("");

  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 🔁 Beim Laden: Geräte, Dokumente & Audit-Log aus localStorage holen
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedDevices = window.localStorage.getItem(DEVICES_KEY);
      const storedDocs = window.localStorage.getItem(DOCS_KEY);
      const storedAudit = window.localStorage.getItem(AUDIT_KEY);

      if (storedDevices) {
        setDevices(JSON.parse(storedDevices));
      }
      if (storedDocs) {
        setDocs(JSON.parse(storedDocs));
      }
      if (storedAudit) {
        setAudit(JSON.parse(storedAudit));
      }
    } catch (err) {
      console.error("Fehler beim Laden aus localStorage:", err);
    }
  }, []);

  // 📜 Helfer: neuen Audit-Eintrag hinzufügen
  const addAuditEntry = (
    deviceId: string | null,
    action: string,
    message: string
  ) => {
    setAudit((prev) => {
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        deviceId,
        action,
        message,
        timestamp: new Date().toISOString(),
      };
      const updated = [entry, ...prev]; // neueste zuerst
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUDIT_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // 💾 Gerät speichern (inkl. UDI-Hash + UDI-PI + Audit-Eintrag)
  const handleSaveDevice = async () => {
    if (!newProductName || !newUdi || !newSerial) {
      setMessage("Bitte Produktname, UDI-DI und Seriennummer eingeben.");
      return;
    }

    // 1) UDI-Hash
    const udiHash = await hashUdi(newUdi, newSerial);

    // 2) Produktionsdatum (heute) & Verfallsdatum (z.B. +5 Jahre)
    const now = new Date();
    const productionDate = formatDateYYMMDD(now);

    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 5); // 5 Jahre Gültigkeit, nach Bedarf anpassen
    const expiryDate = formatDateYYMMDD(expiry);

    // 3) Batch-Nummer: YYMMDD-XX (XX = Laufnummer an diesem Tag)
    const devicesSameDay = devices.filter(
      (d) => d.productionDate === productionDate
    );
    const batchRunningNumber = String(devicesSameDay.length + 1).padStart(
      2,
      "0"
    );
    const batch = `${productionDate}-${batchRunningNumber}`;

    // 4) UDI-PI String nach GS1-Logik:
    // (11) = Herstellungsdatum, (17) = Verfallsdatum, (21) = Seriennummer, (10) = Batch
    const udiPi = `(11)${productionDate}(17)${expiryDate}(21)${newSerial}(10)${batch}`;

    const newDevice: Device = {
      id: crypto.randomUUID(),
      name: newProductName,
      udiDi: newUdi,
      serial: newSerial,
      udiHash,
      createdAt: new Date().toISOString(),
      batch,
      productionDate,
      expiryDate,
      udiPi,
    };

    const updated = [...devices, newDevice];
    setDevices(updated);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEVICES_KEY, JSON.stringify(updated));
    }

    setNewProductName("");
    setNewUdi("");
    setNewSerial("");
    setSelectedDeviceId(newDevice.id);
    setMessage("Gerät wurde gespeichert.");

    addAuditEntry(
      newDevice.id,
      "device_created",
      `Gerät angelegt: ${newDevice.name} (SN: ${newDevice.serial}, Batch: ${batch})`
    );
  };

  // Gerät in der Liste auswählen
  const handleSelectDevice = (id: string) => {
    setSelectedDeviceId(id);
    setMessage(null);
  };

  // 📄 Datei auswählen
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  // 📤 Dokument zu Pinata hochladen (inkl. Audit-Eintrag)
  const handleUploadDoc = async () => {
    if (!selectedDeviceId) {
      setMessage("Bitte zuerst ein Gerät auswählen.");
      return;
    }
    if (!file) {
      setMessage("Bitte eine Datei auswählen.");
      return;
    }

    setIsUploading(true);
    setMessage("Upload läuft …");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // WICHTIG: Endpoint muss zu deiner route.ts passen
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload fehlgeschlagen");
      }

      const newDoc: Doc = {
        id: crypto.randomUUID(),
        deviceId: selectedDeviceId,
        name: docName || file.name,
        cid: data.cid,
        url: data.url,
        createdAt: new Date().toISOString(),
        category: docCategory,
      };

      const updatedDocs = [...docs, newDoc];
      setDocs(updatedDocs);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DOCS_KEY, JSON.stringify(updatedDocs));
      }

      setDocName("");
      setFile(null);
      setMessage("Dokument erfolgreich gespeichert.");

      addAuditEntry(
        selectedDeviceId,
        "document_uploaded",
        `Dokument "${newDoc.name}" (${newDoc.category}) hochgeladen (CID: ${String(
          newDoc.cid
        ).slice(0, 10)}…)`
      );
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Fehler beim Upload.");
    } finally {
      setIsUploading(false);
    }
  };

  // 🧨 ALLES LÖSCHEN – Geräte, Dokumente, Audit
  const handleResetAll = () => {
    if (typeof window === "undefined") return;

    const ok = window.confirm(
      "Alle lokalen Daten (Geräte, Dokumente, Audit-Log) löschen? Dies kann nicht rückgängig gemacht werden."
    );
    if (!ok) return;

    try {
      window.localStorage.removeItem(DEVICES_KEY);
      window.localStorage.removeItem(DOCS_KEY);
      window.localStorage.removeItem(AUDIT_KEY);
    } catch (err) {
      console.error("Fehler beim Löschen aus localStorage:", err);
    }

    setDevices([]);
    setDocs([]);
    setAudit([]);
    setSelectedDeviceId(null);
    setMessage("Alle lokalen Daten wurden gelöscht.");
  };

  const docsForDevice = selectedDeviceId
    ? docs.filter((d) => d.deviceId === selectedDeviceId)
    : [];

  const auditForView = selectedDeviceId
    ? audit.filter((a) => a.deviceId === selectedDeviceId)
    : audit;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              MedSafe-UDI – Geräteübersicht
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Geräte &amp; Dokumente werden im Browser gespeichert
              (localStorage) und Dateien zusätzlich bei Pinata.
            </p>
          </div>

          {/* 🔴 Alles löschen Button */}
          <button
            onClick={handleResetAll}
            className="text-xs md:text-sm rounded-lg border border-red-500/70 px-3 py-2 bg-red-900/40 hover:bg-red-800/60"
          >
            Alle lokalen Daten
            <br />
            löschen
          </button>
        </header>

        {message && (
          <div className="rounded-md bg-slate-800 border border-slate-700 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        {/* Neues Gerät */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Neues Gerät anlegen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Produktname"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="UDI-DI"
              value={newUdi}
              onChange={(e) => setNewUdi(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Seriennummer"
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
            />
          </div>
          <button
            onClick={handleSaveDevice}
            className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium"
          >
            Gerät speichern
          </button>
        </section>

        {/* Geräte-Liste */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-3">
          <h2 className="text-lg font-semibold">Angelegte Geräte</h2>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-400">
              Noch keine Geräte angelegt.
            </p>
          ) : (
            <ul className="space-y-2">
              {devices.map((device) => {
                const count = docs.filter(
                  (d) => d.deviceId === device.id
                ).length;

                const isSelected = device.id === selectedDeviceId;

                return (
                  <li key={device.id}>
                    <button
                      onClick={() => handleSelectDevice(device.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm ${
                        isSelected
                          ? "bg-emerald-900/50 border-emerald-600"
                          : "bg-slate-900 border-slate-700 hover:border-emerald-500/60"
                      }`}
                    >
                      <div className="font-medium">
                        {device.name} – SN: {device.serial}{" "}
                        <span className="text-slate-400">
                          ({count} Dateien)
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 break-all">
                        UDI-DI: {device.udiDi}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 break-all">
                        UDI-Hash:{" "}
                        {device.udiHash
                          ? device.udiHash.slice(0, 20) + "…"
                          : "noch kein Hash (altes Gerät)"}
                      </div>

                      {/* 🔥 NEU: Batch + UDI-PI anzeigen */}
                      {device.batch && (
                        <div className="text-xs text-emerald-400 mt-1">
                          Charge: {device.batch}
                        </div>
                      )}
                      {device.udiPi && (
                        <div className="text-xs text-slate-300 mt-1 break-all">
                          UDI-PI: {device.udiPi}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Dokumente zum Gerät */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Dokumente zum Gerät</h2>

          {selectedDeviceId ? (
            <p className="text-sm text-slate-400">
              Aktuelles Gerät:{" "}
              {devices.find((d) => d.id === selectedDeviceId)?.name}
            </p>
          ) : (
            <p className="text-sm text-amber-400">
              Bitte oben ein Gerät auswählen.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Dokumentenname"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
            />
            <select
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
            >
              {DOC_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <input
              type="file"
              onChange={handleFileChange}
              className="text-sm text-slate-200"
            />
          </div>

          <button
            onClick={handleUploadDoc}
            disabled={isUploading}
            className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-medium"
          >
            {isUploading ? "Upload läuft …" : "Dokument speichern (Pinata)"}
          </button>

          {/* Liste der Dokumente für das aktuell gewählte Gerät */}
          {selectedDeviceId && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">
                Dokumente für dieses Gerät
              </h3>
              {docsForDevice.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Noch keine Dokumente gespeichert.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {docsForDevice.map((doc) => (
                    <li
                      key={doc.id}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2"
                    >
                      <div className="font-medium">
                        {doc.name}
                        <span className="text-xs text-slate-400 ml-2">
                          (
                          {doc.category ? doc.category : "ohne Kategorie"}
                          )
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 break-all">
                        CID: {doc.cid}
                      </div>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-400 underline mt-1 inline-block"
                      >
                        Öffnen
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Audit-Log */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-3">
          <h2 className="text-lg font-semibold">Aktivitäten (Audit-Log)</h2>
          <p className="text-xs text-slate-400">
            {selectedDeviceId
              ? "Es werden nur Aktivitäten für das ausgewählte Gerät angezeigt."
              : "Es werden Aktivitäten für alle Geräte angezeigt."}
          </p>

          {auditForView.length === 0 ? (
            <p className="text-sm text-slate-400">
              Noch keine Aktivitäten aufgezeichnet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm max-h-60 overflow-y-auto">
              {auditForView.map((entry) => (
                <li
                  key={entry.id}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2"
                >
                  <div className="text-xs text-slate-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                  <div className="font-medium mt-1">{entry.message}</div>
                  <div className="text-xs text-slate-500">
                    Aktion: {entry.action}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
