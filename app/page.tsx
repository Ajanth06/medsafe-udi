"use client";

import React, { useEffect, useState } from "react";

type Device = {
  id: string;
  name: string; // Produktname
  udiDi: string; // automatisch generierte UDI-DI
  serial: string; // automatisch generierte Seriennummer
  udiHash: string; // SHA-256 Hash aus UDI-DI + Seriennummer
  createdAt: string;

  batch?: string; // z.B. 251127-01
  productionDate?: string; // YYMMDD
  udiPi?: string; // kompletter GS1-UDI-PI-String (ohne Verfallsdatum)
};

type Doc = {
  id: string;
  deviceId: string;
  name: string;
  cid: string;
  url: string;
  createdAt: string;
  category?: string; // Kategorie für MDR-Dokumente
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

// 🔐 einfacher Admin-PIN (nur für diesen Browser, kein echter Security-Mechanismus)
const ADMIN_PIN = "2727";

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

// Datums-Codes im GS1-Format (YYMMDD)
function formatDateYYMMDD(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// Helfer: CSV für Geräte bauen
function devicesToCSV(devices: Device[]): string {
  const header = [
    "Name",
    "UDI-DI",
    "Serial",
    "Batch",
    "ProductionDate(YYMMDD)",
    "UDI-PI",
    "UDI-Hash",
    "CreatedAt",
  ].join(";");

  const rows = devices.map((d) => {
    const cols = [
      d.name || "",
      d.udiDi || "",
      d.serial || "",
      d.batch || "",
      d.productionDate || "",
      d.udiPi || "",
      d.udiHash || "",
      d.createdAt || "",
    ].map((val) => {
      const safe = String(val ?? "").replace(/"/g, '""');
      return `"${safe}"`;
    });

    return cols.join(";");
  });

  return [header, ...rows].join("\n");
}

export default function MedSafePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");

  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 🔍 Suchfeld für Geräte
  const [searchTerm, setSearchTerm] = useState("");

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
    msg: string
  ) => {
    setAudit((prev) => {
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        deviceId,
        action,
        message: msg,
        timestamp: new Date().toISOString(),
      };
      const updated = [entry, ...prev]; // neueste zuerst

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUDIT_KEY, JSON.stringify(updated));
      }

      return updated;
    });
  };

  // 💾 Gerät speichern – UDI-DI, Seriennummer, Batch, UDI-PI werden automatisch generiert
  const handleSaveDevice = async () => {
    if (!newProductName.trim()) {
      setMessage("Bitte einen Produktnamen eingeben.");
      return;
    }

    const now = new Date();
    const productionDate = formatDateYYMMDD(now);

    // Batch-Nummer: YYMMDD-XX (XX = Laufnummer an diesem Tag)
    const devicesSameDay = devices.filter(
      (d) => d.productionDate === productionDate
    );
    const batchRunningNumber = String(devicesSameDay.length + 1).padStart(
      2,
      "0"
    );
    const batch = `${productionDate}-${batchRunningNumber}`;

    // Globale laufende Nummer für UDI-DI/Serial
    const deviceIndex = devices.length + 1;

    // 🔢 automatisch generierte UDI-DI (interne Struktur)
    const generatedUdiDi = `TH-DI-${deviceIndex.toString().padStart(6, "0")}`;

    // 🔢 automatisch generierte Seriennummer (inkl. Datum + Laufnummer)
    const generatedSerial = `TH-SN-${productionDate}-${batchRunningNumber}`;

    // UDI-Hash
    const udiHash = await hashUdi(generatedUdiDi, generatedSerial);

    // UDI-PI ohne Verfallsdatum:
    // (11) = Herstellungsdatum, (21) = Seriennummer, (10) = Batch
    const udiPi = `(11)${productionDate}(21)${generatedSerial}(10)${batch}`;

    const newDevice: Device = {
      id: crypto.randomUUID(),
      name: newProductName.trim(),
      udiDi: generatedUdiDi,
      serial: generatedSerial,
      udiHash,
      createdAt: new Date().toISOString(),
      batch,
      productionDate,
      udiPi,
    };

    // NEUE GERÄTE OBEN
    const updated = [newDevice, ...devices];
    setDevices(updated);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEVICES_KEY, JSON.stringify(updated));
    }

    setNewProductName("");
    setSelectedDeviceId(newDevice.id);
    setMessage(
      "Gerät wurde gespeichert (UDI-DI & Seriennummer automatisch erzeugt, ohne Verfallsdatum)."
    );

    addAuditEntry(
      newDevice.id,
      "device_created",
      `Gerät angelegt: ${newDevice.name} (UDI-DI: ${generatedUdiDi}, SN: ${generatedSerial}, Batch: ${batch})`
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
        `Dokument "${newDoc.name}" (${
          newDoc.category || "ohne Kategorie"
        }) hochgeladen (CID: ${String(newDoc.cid).slice(0, 10)}…)`
      );
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Fehler beim Upload.");
    } finally {
      setIsUploading(false);
    }
  };

  // 🧨 ALLES LÖSCHEN – Geräte, Dokumente, Audit (mit Admin-PIN geschützt)
  const handleResetAll = () => {
    if (typeof window === "undefined") return;

    const pin = window.prompt(
      "Admin-PIN eingeben, um ALLE lokalen Daten (Geräte, Dokumente, Audit) zu löschen:"
    );
    if (pin === null) return;
    if (pin !== ADMIN_PIN) {
      setMessage("Admin-PIN falsch. Es wurden keine Daten gelöscht.");
      return;
    }

    const ok = window.confirm(
      "Wirklich ALLE lokalen Daten (Geräte, Dokumente, Audit-Log) löschen? Dies kann nicht rückgängig gemacht werden."
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

    addAuditEntry(
      null,
      "full_reset",
      "Alle lokalen Daten (Geräte, Dokumente, Audit) wurden per Admin-Reset gelöscht."
    );
  };

  // 🔐 EINZELNES GERÄT LÖSCHEN – nur mit Admin-PIN
  const handleDeleteDevice = (deviceId: string) => {
    if (typeof window === "undefined") return;

    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      setMessage("Gerät wurde nicht gefunden.");
      return;
    }

    const pin = window.prompt(
      `Admin-PIN eingeben, um das Gerät "${device.name}" zu löschen:`
    );
    if (pin === null) return;
    if (pin !== ADMIN_PIN) {
      setMessage("Admin-PIN falsch. Gerät wurde nicht gelöscht.");
      return;
    }

    const ok = window.confirm(
      `Gerät "${device.name}" wirklich löschen? Alle zugehörigen lokalen Dokument-Verknüpfungen werden entfernt (Pinata-Dateien bleiben bestehen).`
    );
    if (!ok) return;

    // Audit-Eintrag VOR dem Löschen
    addAuditEntry(
      device.id,
      "device_deleted",
      `Gerät gelöscht: ${device.name} (UDI-DI: ${device.udiDi}, SN: ${device.serial})`
    );

    // Gerät entfernen
    const updatedDevices = devices.filter((d) => d.id !== deviceId);
    setDevices(updatedDevices);
    window.localStorage.setItem(DEVICES_KEY, JSON.stringify(updatedDevices));

    // zugehörige Dokumente entfernen
    const updatedDocs = docs.filter((doc) => doc.deviceId !== deviceId);
    setDocs(updatedDocs);
    window.localStorage.setItem(DOCS_KEY, JSON.stringify(updatedDocs));

    // Auswahl zurücksetzen, falls das gelöschte Gerät ausgewählt war
    if (selectedDeviceId === deviceId) {
      setSelectedDeviceId(null);
    }

    setMessage(`Gerät "${device.name}" wurde gelöscht (lokal).`);
  };

  // 🔄 Export JSON
  const handleExportJSON = () => {
    if (!devices.length) {
      setMessage("Keine Geräte zum Exportieren vorhanden.");
      return;
    }
    if (typeof window === "undefined") return;

    const json = JSON.stringify(devices, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "medsafe-devices.json";
    a.click();

    URL.revokeObjectURL(url);
    setMessage("Geräte als JSON exportiert.");
  };

  // 🔄 Export CSV
  const handleExportCSV = () => {
    if (!devices.length) {
      setMessage("Keine Geräte zum Exportieren vorhanden.");
      return;
    }
    if (typeof window === "undefined") return;

    const csv = devicesToCSV(devices);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "medsafe-devices.csv";
    a.click();

    URL.revokeObjectURL(url);
    setMessage("Geräte als CSV exportiert.");
  };

  const docsForDevice = selectedDeviceId
    ? docs.filter((d) => d.deviceId === selectedDeviceId)
    : [];

  const auditForView = selectedDeviceId
    ? audit.filter((a) => a.deviceId === selectedDeviceId)
    : audit;

  // 🔍 Geräte nach Suchbegriff filtern
  const filteredDevices = devices.filter((device) => {
    if (!searchTerm.trim()) return true;
    const needle = searchTerm.toLowerCase();
    const haystack = [
      device.name,
      device.serial,
      device.udiDi,
      device.batch,
      device.udiPi,
      device.udiHash,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });

  const selectedDevice = selectedDeviceId
    ? devices.find((d) => d.id === selectedDeviceId) || null
    : null;

  const totalDevices = devices.length;
  const totalDocs = docs.length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* HEADER + Export + KPIs */}
        <header className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">
                MedSafe-UDI – Geräteübersicht
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Nur Produktnamen eingeben – UDI-DI, Seriennummer, Batch &amp;
                UDI-PI (ohne Verfallsdatum) werden automatisch generiert. Daten
                bleiben im Browser (localStorage), Dateien zusätzlich bei
                Pinata.
              </p>
            </div>

            <button
              onClick={handleResetAll}
              className="text-xs md:text-sm rounded-lg border border-red-500/70 px-3 py-2 bg-red-900/40 hover:bg-red-800/60"
            >
              Alle lokalen Daten
              <br />
              löschen (Admin)
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex gap-3 text-xs md:text-sm">
              <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700">
                <div className="text-slate-400">Geräte</div>
                <div className="text-lg font-semibold">{totalDevices}</div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700">
                <div className="text-slate-400">Dokumente</div>
                <div className="text-lg font-semibold">{totalDocs}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleExportJSON}
                className="text-xs md:text-sm rounded-lg border border-slate-700 px-3 py-2 bg-slate-900 hover:border-emerald-500"
              >
                Export JSON
              </button>
              <button
                onClick={handleExportCSV}
                className="text-xs md:text-sm rounded-lg border border-slate-700 px-3 py-2 bg-slate-900 hover:border-emerald-500"
              >
                Export CSV
              </button>
            </div>
          </div>
        </header>

        {message && (
          <div className="rounded-md bg-slate-800 border border-slate-700 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        {/* Neues Gerät */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Neues Gerät anlegen</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Produktname (z.B. FREEZO FZ-380)"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
            />
            <p className="text-xs text-slate-400">
              UDI-DI &amp; Seriennummer werden automatisch erzeugt.
            </p>
          </div>

          <button
            onClick={handleSaveDevice}
            className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium"
          >
            Gerät speichern
          </button>
        </section>

        {/* Geräte-Liste mit Suche */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-semibold">Angelegte Geräte</h2>

            <div className="w-full md:w-1/2 flex items-center gap-2">
              <input
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="Suche nach Name, SN, UDI, Batch, UDI-PI…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {devices.length === 0 ? (
            <p className="text-sm text-slate-400">
              Noch keine Geräte angelegt.
            </p>
          ) : filteredDevices.length === 0 ? (
            <p className="text-sm text-slate-400">
              Keine Geräte passend zur Suche gefunden.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredDevices.map((device) => {
                const count = docs.filter(
                  (d) => d.deviceId === device.id
                ).length;
                const isSelected = device.id === selectedDeviceId;

                return (
                  <li key={device.id}>
                    <button
                      onClick={() => handleSelectDevice(device.id)}
                      className={
                        "w-full text-left px-4 py-3 rounded-xl border text-sm " +
                        (isSelected
                          ? "bg-emerald-900/50 border-emerald-600"
                          : "bg-slate-900 border-slate-700 hover:border-emerald-500/60")
                      }
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

        {/* Geräteakte – Detailansicht */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Geräteakte – Detailansicht</h2>
            {selectedDevice && (
              <button
                onClick={() => handleDeleteDevice(selectedDevice.id)}
                className="text-xs md:text-sm rounded-lg border border-red-500/70 px-3 py-2 bg-red-900/60 hover:bg-red-800"
              >
                Gerät löschen (Admin-PIN)
              </button>
            )}
          </div>

          {!selectedDevice ? (
            <p className="text-sm text-amber-400">
              Bitte oben ein Gerät auswählen, um die Geräteakte zu sehen.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-1 text-sm">
                  <div className="text-slate-400 text-xs">Produktname</div>
                  <div className="font-semibold">{selectedDevice.name}</div>

                  <div className="text-slate-400 text-xs mt-3">UDI-DI</div>
                  <div className="break-all">{selectedDevice.udiDi}</div>

                  <div className="text-slate-400 text-xs mt-3">Seriennummer</div>
                  <div className="break-all">{selectedDevice.serial}</div>

                  <div className="text-slate-400 text-xs mt-3">
                    UDI-PI (ohne Verfallsdatum)
                  </div>
                  <div className="break-all">
                    {selectedDevice.udiPi || "–"}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-1 text-sm">
                  <div className="text-slate-400 text-xs">Charge</div>
                  <div>{selectedDevice.batch || "–"}</div>

                  <div className="text-slate-400 text-xs mt-3">
                    Produktionsdatum (YYMMDD)
                  </div>
                  <div>{selectedDevice.productionDate || "–"}</div>

                  <div className="text-slate-400 text-xs mt-3">UDI-Hash</div>
                  <div className="break-all text-xs">
                    {selectedDevice.udiHash}
                  </div>

                  <div className="text-slate-400 text-xs mt-3">Angelegt am</div>
                  <div>
                    {new Date(selectedDevice.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                  <div className="text-slate-400 mb-1">Verknüpfte Dokumente</div>
                  <div className="font-semibold text-lg">
                    {
                      docs.filter((d) => d.deviceId === selectedDevice.id)
                        .length
                    }
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                  <div className="text-slate-400 mb-1">Aktivitäten (Audit)</div>
                  <div className="font-semibold text-lg">
                    {
                      audit.filter((a) => a.deviceId === selectedDevice.id)
                        .length
                    }
                  </div>
                </div>
              </div>
            </div>
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
                          ({doc.category ? doc.category : "ohne Kategorie"})
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
