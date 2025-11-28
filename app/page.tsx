"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase Client (Browser) ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Typen ---
type DeviceStatus = "released" | "blocked" | "in_production" | "recall";

type Device = {
  id: string;
  name: string;
  udiDi: string;
  serial: string;
  udiHash: string;
  createdAt: string;
  batch?: string;
  productionDate?: string;
  udiPi?: string;
  status?: DeviceStatus;
  riskClass?: string;
};

type Doc = {
  id: string; // lokale ID
  deviceId: string;
  name: string;
  cid: string;
  url: string;
  createdAt: string;
};

function generateSerial(base: string, index: number): string {
  // einfache Seriennummer: BASIS-001, BASIS-002, ...
  const num = (index + 1).toString().padStart(3, "0");
  return `${base}-${num}`;
}

function generateUdiHash(udiDi: string, serial: string): string {
  // kleiner SHA-256 Wrapper über Web Crypto
  const text = `${udiDi}|${serial}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  // Web Crypto gibt Promise<ArrayBuffer> zurück
  // Wir brauchen hier nur eine einfache Hex-Repräsentation
  // Achtung: das ist async – Funktion wird nur in async Kontext genutzt
  // (z.B. beim Speichern)
  throw new Error("generateUdiHash sollte nur in async Kontext verwendet werden");
}

async function createUdiHash(udiDi: string, serial: string): Promise<string> {
  const text = `${udiDi}|${serial}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Page() {
  // --- State: Geräte & Docs ---
  const [devices, setDevices] = useState<Device[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);

  // Formular für neue Geräte
  const [newName, setNewName] = useState("");
  const [newBatch, setNewBatch] = useState("");
  const [newCount, setNewCount] = useState(1);

  const [isSavingDevices, setIsSavingDevices] = useState(false);

  // --- Initial: Geräte aus Supabase, Docs aus localStorage ---
  useEffect(() => {
    const loadDevices = async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fehler beim Laden der Geräte aus Supabase:", error);
        return;
      }

      if (!data) return;

      const mapped: Device[] = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        udiDi: row.udi_di ?? "",
        serial: row.serial ?? "",
        udiHash: row.udi_hash ?? "",
        createdAt: row.created_at ?? "",
        batch: row.batch ?? undefined,
        productionDate: row.production_date ?? undefined,
        udiPi: row.udi_pi ?? undefined,
      }));

      setDevices(mapped);
    };

    const loadDocs = () => {
      try {
        const raw = localStorage.getItem("medsafe_docs");
        if (raw) {
          const parsed: Doc[] = JSON.parse(raw);
          setDocs(parsed);
        }
      } catch (e) {
        console.warn("Konnte medsafe_docs nicht laden:", e);
      }
    };

    loadDevices();
    loadDocs();
  }, []);

  // --- Helper: Docs in localStorage spiegeln ---
  const updateDocsState = (updater: (prev: Doc[]) => Doc[]) => {
    setDocs((prev) => {
      const updated = updater(prev);
      try {
        localStorage.setItem("medsafe_docs", JSON.stringify(updated));
      } catch (e) {
        console.warn("Konnte medsafe_docs nicht speichern:", e);
      }
      return updated;
    });
  };

  // --- Geräte speichern (mit Anzahl) ---
  const handleSaveDevices = async () => {
    if (!newName.trim()) {
      alert("Bitte einen Produktnamen eingeben.");
      return;
    }
    if (newCount < 1) {
      alert("Anzahl muss mindestens 1 sein.");
      return;
    }

    setIsSavingDevices(true);
    try {
      const today = new Date();
      const yy = today.getFullYear().toString().slice(-2);
      const mm = (today.getMonth() + 1).toString().padStart(2, "0");
      const dd = today.getDate().toString().padStart(2, "0");
      const productionDate = `${yy}${mm}${dd}`;

      const batch = newBatch.trim() || `${yy}${mm}${dd}`; // z.B. 251128

      // Dummy UDI-DI Basis – hier könnt ihr später euren echten GS1-Präfix einsetzen
      const udiBase = `UDI-${yy}${mm}${dd}`;

      // Seriennummer Basis
      const serialBase = `${yy}${mm}${dd}`;

      // Erst Supabase Insert vorbereiten
      const rowsToInsert: any[] = [];
      for (let i = 0; i < newCount; i++) {
        const serial = generateSerial(serialBase, i);
        const udiDi = `${udiBase}-${i + 1}`;

        rowsToInsert.push({
          name: newName.trim(),
          udi_di: udiDi,
          serial,
          udi_hash: "", // füllen wir gleich nach Hash-Berechnung
          batch,
          production_date: productionDate,
          udi_pi: null,
        });
      }

      // Hashes berechnen
      for (let i = 0; i < rowsToInsert.length; i++) {
        const row = rowsToInsert[i];
        row.udi_hash = await createUdiHash(row.udi_di, row.serial);
      }

      const { data, error } = await supabase
        .from("devices")
        .insert(rowsToInsert)
        .select("*");

      if (error) {
        console.error("Supabase Insert Fehler (devices):", error);
        alert("Fehler beim Speichern der Geräte in Supabase.");
        return;
      }

      if (!data) {
        alert("Keine Daten von Supabase zurückbekommen.");
        return;
      }

      const mapped: Device[] = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        udiDi: row.udi_di ?? "",
        serial: row.serial ?? "",
        udiHash: row.udi_hash ?? "",
        createdAt: row.created_at ?? "",
        batch: row.batch ?? undefined,
        productionDate: row.production_date ?? undefined,
        udiPi: row.udi_pi ?? undefined,
      }));

      setDevices((prev) => [...mapped, ...prev]);

      alert(`${mapped.length} Gerät(e) wurden gespeichert.`);
      setNewName("");
      setNewBatch("");
      setNewCount(1);
    } catch (err) {
      console.error("Unerwarteter Fehler beim Speichern der Geräte:", err);
      alert("Unerwarteter Fehler beim Speichern.");
    } finally {
      setIsSavingDevices(false);
    }
  };

  // --- Dokument-Upload: Pinata + Supabase docs + localStorage ---
  async function handleUploadDoc(device: Device, file: File) {
    try {
      // 1. Datei an API-Route (Pinata) schicken
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error("Upload API Fehler", await res.text());
        alert("Upload fehlgeschlagen.");
        return;
      }

      const data = await res.json();
      const { cid, url } = data;

      // 2. lokales Doc bauen
      const newDoc: Doc = {
        id: crypto.randomUUID(),
        deviceId: device.id,
        name: file.name,
        cid,
        url,
        createdAt: new Date().toISOString(),
      };

      // 3. in React-State + localStorage
      updateDocsState((prev) => [newDoc, ...prev]);

      // 4. in Supabase docs schreiben
      const { error } = await supabase.from("docs").insert([
        {
          device_id: device.id,
          name: file.name,
          cid,
          url,
        },
      ]);

      if (error) {
        console.error("Supabase docs Insert Fehler:", error);
        alert(
          "Dokument wurde hochgeladen, aber der Eintrag in Supabase (docs) ist fehlgeschlagen."
        );
        return;
      }

      alert("Dokument erfolgreich hochgeladen und in Supabase gespeichert.");
    } catch (err) {
      console.error("handleUploadDoc Fehler:", err);
      alert("Unerwarteter Fehler beim Dokument-Upload.");
    }
  }

  // --- UI ---
  return (
    <main style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "16px" }}>
        MedSafe-UDI – Geräte & Dokumente (Supabase)
      </h1>

      {/* Neue Geräte anlegen */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>
          Neue Geräte anlegen
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr auto",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <div>
            <label style={{ fontSize: "14px" }}>
              Produktname
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z.B. FREEZO FZ-380"
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              />
            </label>
          </div>

          <div>
            <label style={{ fontSize: "14px" }}>
              Charge (optional)
              <input
                type="text"
                value={newBatch}
                onChange={(e) => setNewBatch(e.target.value)}
                placeholder="z.B. 251128"
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              />
            </label>
          </div>

          <div>
            <label style={{ fontSize: "14px" }}>
              Anzahl
              <input
                type="number"
                min={1}
                value={newCount}
                onChange={(e) => setNewCount(Number(e.target.value))}
                style={{ width: "100%", padding: "6px", marginTop: "4px" }}
              />
            </label>
          </div>

          <div>
            <button
              onClick={handleSaveDevices}
              disabled={isSavingDevices}
              style={{
                padding: "8px 16px",
                cursor: isSavingDevices ? "not-allowed" : "pointer",
              }}
            >
              {isSavingDevices ? "Speichern..." : "Geräte speichern"}
            </button>
          </div>
        </div>
      </section>

      {/* Geräte-Liste */}
      <section>
        <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>
          Geräteübersicht
        </h2>

        {devices.length === 0 ? (
          <p>Keine Geräte vorhanden. Lege oben ein neues Gerät an.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {devices.map((device) => {
              const deviceDocs = docs.filter((d) => d.deviceId === device.id);

              return (
                <div
                  key={device.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <div>
                      <strong>{device.name}</strong>{" "}
                      {device.batch && <span>– Charge: {device.batch}</span>}
                      <div style={{ fontSize: "13px", color: "#555" }}>
                        SN: {device.serial} · UDI-DI: {device.udiDi}
                      </div>
                      <div style={{ fontSize: "11px", color: "#999" }}>
                        Hash: {device.udiHash.slice(0, 16)}…
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", textAlign: "right" }}>
                      Angelegt:{" "}
                      {device.createdAt
                        ? new Date(device.createdAt).toLocaleString()
                        : "-"}
                    </div>
                  </div>

                  {/* Dokumente zu diesem Gerät */}
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "14px", marginBottom: "4px" }}>
                      Dokumente
                    </div>
                    {deviceDocs.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#777" }}>
                        Noch keine Dokumente verknüpft.
                      </p>
                    ) : (
                      <ul style={{ fontSize: "13px", paddingLeft: "18px" }}>
                        {deviceDocs.map((doc) => (
                          <li key={doc.id}>
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {doc.name}
                            </a>{" "}
                            <span style={{ color: "#999" }}>
                              ({new Date(doc.createdAt).toLocaleString()})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Upload-Bereich */}
                  <div style={{ marginTop: "8px" }}>
                    <label style={{ fontSize: "13px" }}>
                      Dokument hochladen:
                      <input
                        type="file"
                        style={{ display: "block", marginTop: "4px" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadDoc(device, file);
                            // Input resetten
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
