"use client";

import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import Lottie from "lottie-react";
import birdAnimation from "./animations/bird.json"; // Lege bird.json unter app/animations/ ab

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

  status: DeviceStatus;
  riskClass?: string;
  blockComment?: string;
  responsible?: string;

  isArchived?: boolean;
  dmrId?: string;
  dhrId?: string;
  validationStatus?: string;
  archivedAt?: string;
  archiveReason?: string;

  nonconformityCategory?: string;
  nonconformitySeverity?: string;
  nonconformityAction?: string;
  nonconformityResponsible?: string;
  nonconformityId?: string;

  lastServiceDate?: string;
  nextServiceDate?: string;
  serviceNotes?: string;

  pmsNotes?: string;
};

type DocStatus = "Draft" | "Controlled" | "Final";

type Doc = {
  id: string;
  deviceId: string;
  name: string;
  cid: string;
  url: string;
  createdAt: string;
  category?: string;

  version?: string;
  revision?: string;
  docStatus?: DocStatus;
  approvedBy?: string;
};

type AuditEntry = {
  id: string;
  deviceId: string | null;
  action: string;
  message: string;
  timestamp: string;
};

type RegulatoryMeta = {
  mdrClass?: string;
  mdrRule?: string;
  intendedPurpose?: string;
  internalRiskLevel?: string;
  dmrLabel?: string;
};

// PIN nur UI-Schutz
const ADMIN_PIN = "4837";

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

const DOC_STATUS_OPTIONS: DocStatus[] = ["Draft", "Controlled", "Final"];

const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  released: "Freigegeben (Inverkehrbringen)",
  blocked: "Gesperrt / Quarantäne",
  in_production: "In Herstellung",
  recall: "Recall (Rückruf)",
};

// ---------- HELFER ----------

async function hashUdi(udiDi: string, serial: string): Promise<string> {
  const input = `${udiDi}|${serial}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

function formatDateYYMMDD(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function slugifyName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "");
}

function generateNonconformityId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `NC-${year}-${random}`;
}

// leere Strings → NULL für date/timestamptz
function toNullableDateOrTimestamp(value?: string) {
  if (!value) return null;
  if (value.trim() === "") return null;
  return value;
}

function devicesToCSV(devices: Device[]): string {
  const header = [
    "Name",
    "UDI-DI",
    "Serial",
    "Batch",
    "ProductionDate(YYMMDD)",
    "UDI-PI",
    "UDI-Hash",
    "Status",
    "RiskClass",
    "BlockComment",
    "Responsible",
    "NonconformityCategory",
    "NonconformitySeverity",
    "NonconformityAction",
    "NonconformityResponsible",
    "NonconformityId",
    "LastServiceDate",
    "NextServiceDate",
    "ServiceNotes",
    "PMSNotes",
    "ValidationStatus",
    "DMR-ID",
    "DHR-ID",
    "Archived",
    "ArchivedAt",
    "ArchiveReason",
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
      DEVICE_STATUS_LABELS[d.status] || d.status || "",
      d.riskClass || "",
      d.blockComment || "",
      d.responsible || "",
      d.nonconformityCategory || "",
      d.nonconformitySeverity || "",
      d.nonconformityAction || "",
      d.nonconformityResponsible || "",
      d.nonconformityId || "",
      d.lastServiceDate || "",
      d.nextServiceDate || "",
      d.serviceNotes || "",
      d.pmsNotes || "",
      d.validationStatus || "",
      d.dmrId || "",
      d.dhrId || "",
      d.isArchived ? "true" : "false",
      d.archivedAt || "",
      d.archiveReason || "",
      d.createdAt || "",
    ].map((val) => {
      const safe = String(val ?? "").replace(/"/g, '""');
      return `"${safe}"`;
    });

    return cols.join(";");
  });

  return [header, ...rows].join("\n");
}

function copyToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

// ---------- Mapping DB <-> UI ----------

function mapDeviceRowToDevice(row: any): Device {
  return {
    id: row.id,
    name: row.name,
    udiDi: row.udi_di,
    serial: row.serial,
    udiHash: row.udi_hash,
    createdAt: row.created_at,
    batch: row.batch ?? "",
    productionDate: row.production_date ?? "",
    udiPi: row.udi_pi ?? "",
    status: (row.status || "released") as DeviceStatus,
    riskClass: row.risk_class ?? "",
    blockComment: row.block_comment ?? "",
    responsible: row.responsible ?? "",
    isArchived: row.is_archived ?? false,
    dmrId: row.dmr_id ?? "",
    dhrId: row.dhr_id ?? "",
    validationStatus: row.validation_status ?? "",
    archivedAt: row.archived_at ?? "",
    archiveReason: row.archive_reason ?? "",
    nonconformityCategory: row.nonconformity_category ?? "",
    nonconformitySeverity: row.nonconformity_severity ?? "",
    nonconformityAction: row.nonconformity_action ?? "",
    nonconformityResponsible: row.nonconformity_responsible ?? "",
    nonconformityId: row.nonconformity_id ?? "",
    lastServiceDate: row.last_service_date ?? "",
    nextServiceDate: row.next_service_date ?? "",
    serviceNotes: row.service_notes ?? "",
    pmsNotes: row.pms_notes ?? "",
  };
}

function mapDeviceToDb(device: Device | Partial<Device>): any {
  return {
    name: device.name,
    udi_di: device.udiDi,
    serial: device.serial,
    udi_hash: device.udiHash,
    created_at: device.createdAt,

    batch: device.batch ?? null,
    production_date: device.productionDate ?? null,
    udi_pi: device.udiPi ?? null,

    status: device.status,
    risk_class: device.riskClass ?? null,
    block_comment: device.blockComment ?? null,
    responsible: device.responsible ?? null,
    is_archived: device.isArchived ?? false,
    dmr_id: device.dmrId ?? null,
    dhr_id: device.dhrId ?? null,
    validation_status: device.validationStatus ?? null,

    archived_at: toNullableDateOrTimestamp(device.archivedAt),
    archive_reason: device.archiveReason ?? null,

    nonconformity_category: device.nonconformityCategory ?? null,
    nonconformity_severity: device.nonconformitySeverity ?? null,
    nonconformity_action: device.nonconformityAction ?? null,
    nonconformity_responsible: device.nonconformityResponsible ?? null,
    nonconformity_id: device.nonconformityId ?? null,

    last_service_date: toNullableDateOrTimestamp(device.lastServiceDate),
    next_service_date: toNullableDateOrTimestamp(device.nextServiceDate),

    service_notes: device.serviceNotes ?? null,
    pms_notes: device.pmsNotes ?? null,
  };
}

function mapDocRowToDoc(row: any): Doc {
  return {
    id: row.id,
    deviceId: row.device_id,
    name: row.name,
    cid: row.cid,
    url: row.url,
    createdAt: row.created_at,
    category: row.category ?? "",
    version: row.version ?? "",
    revision: row.revision ?? "",
    docStatus: (row.doc_status || "Controlled") as DocStatus,
    approvedBy: row.approved_by ?? "",
  };
}

function mapDocToDb(doc: Doc | Partial<Doc>): any {
  return {
    device_id: doc.deviceId,
    name: doc.name,
    cid: doc.cid,
    url: doc.url,
    created_at: doc.createdAt,
    category: doc.category ?? null,
    version: doc.version ?? null,
    revision: doc.revision ?? null,
    doc_status: doc.docStatus ?? null,
    approved_by: doc.approvedBy ?? null,
  };
}

function mapAuditRowToEntry(row: any): AuditEntry {
  return {
    id: row.id,
    deviceId: row.device_id,
    action: row.action,
    message: row.message,
    timestamp: row.timestamp,
  };
}

function mapAuditToDb(entry: AuditEntry | Partial<AuditEntry>): any {
  return {
    device_id: entry.deviceId ?? null,
    action: entry.action,
    message: entry.message,
    timestamp: entry.timestamp,
  };
}

// ---------- KOMPONENTE ----------


export default function MedSafePage() {
  // Auth-Zustand
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginInfo, setLoginInfo] = useState<string | null>(null);

  // Daten
  const [devices, setDevices] = useState<Device[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    status: DeviceStatus;
    riskClass: string;
    blockComment: string;
    responsible: string;
  } | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [regMeta, setRegMeta] = useState<RegulatoryMeta | null>(null);

  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [docVersion, setDocVersion] = useState("");
  const [docRevision, setDocRevision] = useState("");
  const [docStatus, setDocStatus] = useState<DocStatus>("Controlled");
  const [docApprovedBy, setDocApprovedBy] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [udiPiSearch, setUdiPiSearch] = useState("");
  const [isGroupPinned, setIsGroupPinned] = useState(false);

  const previewBatch = formatDateYYMMDD(new Date());
  const previewDmrId = newProductName.trim()
    ? `DMR-${previewBatch}-${slugifyName(newProductName)}`
    : "";

  useEffect(() => {
    let isActive = true;

    const loadRegulatoryMeta = async () => {
      const name = newProductName.trim();
      const dmrId = previewDmrId;

      if (!name && !dmrId) {
        if (isActive) setRegMeta(null);
        return;
      }

      let meta: RegulatoryMeta = {};

      if (name) {
        try {
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("name", name)
            .limit(1);

          if (!error && data && data.length > 0) {
            const row = data[0] as any;
            meta = {
              mdrClass: row.mdr_class ?? row.mdrClass ?? row.mdr_klasse ?? undefined,
              mdrRule: row.mdr_rule ?? row.mdrRule ?? row.mdr_regel ?? undefined,
              intendedPurpose:
                row.intended_purpose ?? row.intendedPurpose ?? row.intended_use ?? undefined,
              internalRiskLevel:
                row.internal_risk_level ?? row.internalRiskLevel ?? row.risk_level ?? undefined,
              dmrLabel: row.dmr_label ?? row.dmrLabel ?? undefined,
            };
          }
        } catch (err) {
          // Silent fail for optional metadata lookup
        }
      }

      const needsDmrFallback =
        !meta.mdrClass ||
        !meta.mdrRule ||
        !meta.intendedPurpose ||
        !meta.internalRiskLevel ||
        !meta.dmrLabel;

      if (needsDmrFallback && dmrId) {
        try {
          const { data, error } = await supabase
            .from("dmr")
            .select("*")
            .eq("id", dmrId)
            .limit(1);

          if (!error && data && data.length > 0) {
            const row = data[0] as any;
            meta = {
              mdrClass: meta.mdrClass ?? row.mdr_class ?? row.mdrClass ?? undefined,
              mdrRule: meta.mdrRule ?? row.mdr_rule ?? row.mdrRule ?? undefined,
              intendedPurpose:
                meta.intendedPurpose ??
                row.intended_purpose ??
                row.intendedPurpose ??
                row.intended_use ??
                undefined,
              internalRiskLevel:
                meta.internalRiskLevel ??
                row.internal_risk_level ??
                row.internalRiskLevel ??
                row.risk_level ??
                undefined,
              dmrLabel: meta.dmrLabel ?? row.label ?? row.name ?? row.title ?? undefined,
            };
          }
        } catch (err) {
          // Silent fail for optional metadata lookup
        }
      }

      if (isActive) {
        const hasAnyMeta =
          meta.mdrClass ||
          meta.mdrRule ||
          meta.intendedPurpose ||
          meta.internalRiskLevel ||
          meta.dmrLabel;
        setRegMeta(hasAnyMeta ? meta : null);
      }
    };

    loadRegulatoryMeta();

    return () => {
      isActive = false;
    };
  }, [newProductName, previewDmrId]);

  // ---------- AUTH ----------

  useEffect(() => {
  const initAuth = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        // "Auth session missing!" = niemand eingeloggt → ist OK, kein echter Fehler
        if (error.message !== "Auth session missing!") {
          console.error("Supabase getUser error:", error);
        }
        setUser(null);
        return;
      }

      setUser(data.user ?? null);
    } finally {
      setAuthLoading(false);
    }
  };

  initAuth();

  const { data: authListener } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setUser(session?.user ?? null);
    }
  );

  return () => {
    authListener.subscription.unsubscribe();
  };
}, []);

  const mdrClass = regMeta?.mdrClass?.toString().trim() ?? "";
  const mdrRule = regMeta?.mdrRule?.toString().trim() ?? "";
  const internalRiskLevel = regMeta?.internalRiskLevel?.toString().trim() ?? "";
  const intendedPurpose = regMeta?.intendedPurpose?.toString().trim() ?? "";
  const dmrLabel = regMeta?.dmrLabel?.toString().trim() ?? "";
  const showMdrWarning = !mdrClass;
  const displayCreatedBy =
    (user as any)?.user_metadata?.full_name ?? user?.email ?? "—";
  const displayTimestamp = new Date().toLocaleString();
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;


  const handleSendLoginLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      setLoginInfo("Bitte eine gültige E-Mail eingeben.");
      return;
    }
    try {
      setLoginInfo("Login-Link wird gesendet …");
      const { error } = await supabase.auth.signInWithOtp({
        email: loginEmail,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        console.error("Magic Link Fehler:", error);
        setLoginInfo("Fehler: " + error.message);
        return;
      }
      setLoginInfo("Login-Link wurde an deine E-Mail geschickt.");
      setLoginEmail("");
    } catch (err: any) {
      console.error(err);
      setLoginInfo("Unerwarteter Fehler beim Login.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setDevices([]);
    setDocs([]);
    setAudit([]);
    setSelectedDeviceId(null);
  };

  // ---------- ALLES AUS SUPABASE LADEN (Cloud-Refresh) ----------

  const loadAllFromSupabase = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const [
        { data: deviceRows, error: devErr },
        { data: docRows, error: docErr },
        { data: auditRows, error: audErr },
      ] = await Promise.all([
        supabase.from("devices").select("*").order("created_at", { ascending: false }),
        supabase.from("docs").select("*").order("created_at", { ascending: false }),
        supabase.from("audit_log").select("*").order("timestamp", { ascending: false }),
      ]);

      if (devErr) throw devErr;
      if (docErr) throw docErr;
      if (audErr) throw audErr;

      setDevices((deviceRows || []).map(mapDeviceRowToDevice));
      setDocs((docRows || []).map(mapDocRowToDoc));
      setAudit((auditRows || []).map(mapAuditRowToEntry));
    } catch (err: any) {
      console.error("Fehler beim Laden aus Supabase:", err);
      setMessage("Fehler beim Laden der Daten aus Supabase.");
    } finally {
      setIsLoading(false);
    }
  };

  // Daten laden, sobald User eingeloggt ist
  useEffect(() => {
    if (user) {
      loadAllFromSupabase();
    }
  }, [user]);


  // ---------- AUDIT ----------

  const addAuditEntry = async (deviceId: string | null, action: string, msg: string) => {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      deviceId,
      action,
      message: msg,
      timestamp: new Date().toISOString(),
    };

    setAudit((prev) => [entry, ...prev]);

    try {
      const { error } = await supabase.from("audit_log").insert(mapAuditToDb(entry));
      if (error) {
        console.error("Supabase Audit Insert Error:", error);
      }
    } catch (e) {
      console.error("Supabase Audit Insert Exception:", e);
    }
  };

  // ---------- GERÄTE SPEICHERN ----------

  const handleSaveDevice = async () => {
    if (!newProductName.trim()) {
      setMessage("Bitte einen Produktnamen eingeben.");
      return;
    }

    const qty = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
    if (qty < 1) {
      setMessage("Anzahl muss mindestens 1 sein.");
      return;
    }

    const now = new Date();
    const productionDate = formatDateYYMMDD(now);
    const batch = productionDate;

    const devicesSameBatch = devices.filter((d) => d.batch === batch);
    const existingInBatch = devicesSameBatch.length;
    const startDeviceIndex = devices.length;
    const nameSlug = slugifyName(newProductName);
    const dmrIdForBatch = `DMR-${batch}-${nameSlug}`;

    const newDevices: Device[] = [];

    for (let i = 0; i < qty; i++) {
      const serialRunningNumber = String(existingInBatch + i + 1).padStart(3, "0");
      const deviceIndex = startDeviceIndex + i + 1;
      const generatedUdiDi = `TH-DI-${deviceIndex.toString().padStart(6, "0")}`;
      const generatedSerial = `TH-SN-${productionDate}-${serialRunningNumber}`;
      const udiHash = await hashUdi(generatedUdiDi, generatedSerial);
      const udiPi = `(11)${productionDate}(21)${generatedSerial}(10)${batch}`;
      const dhrId = `DHR-${productionDate}-${serialRunningNumber}`;

      const id = crypto.randomUUID();

      newDevices.push({
        id,
        name: newProductName.trim(),
        udiDi: generatedUdiDi,
        serial: generatedSerial,
        udiHash,
        createdAt: new Date().toISOString(),
        batch,
        productionDate,
        udiPi,
        status: "released",
        riskClass: "",
        blockComment: "",
        responsible: "",
        isArchived: false,
        dmrId: dmrIdForBatch,
        dhrId,
        validationStatus: "",
        nonconformityCategory: "",
        nonconformitySeverity: "",
        nonconformityAction: "",
        nonconformityResponsible: "",
        lastServiceDate: "",
        nextServiceDate: "",
        serviceNotes: "",
        pmsNotes: "",
        archivedAt: "",
        archiveReason: "",
        nonconformityId: "",
      });
    }

    try {
      const { error } = await supabase.from("devices").insert(
        newDevices.map((d) => ({
          id: d.id,
          ...mapDeviceToDb(d),
        }))
      );

      if (error) {
        console.error("Supabase Devices Insert Error:", error);
        setMessage("Fehler beim Speichern in Supabase: " + error.message);
        return;
      }

      setDevices((prev) => [...newDevices, ...prev]);

      setNewProductName("");
      setQuantity(1);
      setSelectedDeviceId(newDevices[0]?.id ?? null);

      if (qty === 1) {
        setMessage(
          `1 Gerät wurde gespeichert (UDI-DI & Seriennummer automatisch erzeugt, ohne Verfallsdatum).`
        );
      } else {
        setMessage(
          `${qty} Geräte wurden gespeichert (Charge ${batch}, UDI-DI & Seriennummern automatisch erzeugt).`
        );
      }

      const firstSerial = newDevices[0]?.serial;
      const lastSerial = newDevices[newDevices.length - 1]?.serial;

      addAuditEntry(
        null,
        "devices_bulk_created",
        qty === 1
          ? `1 Gerät angelegt: ${newDevices[0]?.name} (Charge: ${batch}, SN: ${firstSerial}, DMR: ${dmrIdForBatch}).`
          : `${qty} Geräte angelegt für ${newDevices[0]?.name} (Charge: ${batch}, SN von ${firstSerial} bis ${lastSerial}, DMR: ${dmrIdForBatch}).`
      );
    } catch (e: any) {
      console.error("Supabase Devices Insert Exception:", e);
      setMessage("Fehler beim Speichern in Supabase.");
    }
  };

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceId(id);
    setMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

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
      formData.append("deviceId", selectedDeviceId); // ⬅️ WICHTIG: Gerät mitsenden

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
        version: docVersion || "",
        revision: docRevision || "",
        docStatus: docStatus || "Controlled",
        approvedBy: docApprovedBy || "",
      };

      const { error } = await supabase.from("docs").insert({
        id: newDoc.id,
        ...mapDocToDb(newDoc),
      });

      if (error) {
        console.error("Supabase Docs Insert Error:", error);
        setMessage(
          "Fehler beim Speichern des Dokuments in Supabase: " + error.message
        );
        return;
      }

      setDocs((prev) => [newDoc, ...prev]);

      setDocName("");
      setDocVersion("");
      setDocRevision("");
      setDocApprovedBy("");
      setFile(null);
      setMessage("Dokument erfolgreich gespeichert.");

      const shortCid = String(newDoc.cid).slice(0, 10);

      addAuditEntry(
        selectedDeviceId,
        "document_uploaded",
        `Dokument "${newDoc.name}" (${newDoc.category || "ohne Kategorie"}, Version: ${
          newDoc.version || "-"
        }, Revision: ${newDoc.revision || "-"}, Status: ${
          newDoc.docStatus
        }) hochgeladen (CID: ${shortCid}…).`
      );
    } catch (err: any) {
      console.error(err);
      setMessage(err.message || "Fehler beim Upload.");
    } finally {
      setIsUploading(false);
    }
  };


  const handleToggleArchiveDevice = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
      setMessage("Gerät wurde nicht gefunden.");
      return;
    }

    const pin = window.prompt(
      `Admin-PIN eingeben, um das Gerät "${device.name}" ${
        device.isArchived ? "aus dem Archiv zu holen" : "zu archivieren"
      }:`
    );
    if (pin === null) return;
    if (pin !== ADMIN_PIN) {
      setMessage("Admin-PIN falsch. Aktion abgebrochen.");
      return;
    }

    const ok = window.confirm(
      `Gerät "${device.name}" wirklich ${
        device.isArchived ? "reaktivieren (aus Archiv holen)" : "archivieren (Stilllegung)?"
      }\n\nDas Gerät bleibt in der Historie/Audit-Log und im Export erhalten.`
    );
    if (!ok) return;

    let archiveReason: string | undefined;
    let archivedAt: string | undefined;

    if (!device.isArchived) {
      const reason = window.prompt(
        `Archiv-/Stilllegungsgrund für "${device.name}" (optional):`,
        device.archiveReason || ""
      );
      archiveReason = reason || "";
      archivedAt = new Date().toISOString();
    }

    const newIsArchived = !device.isArchived;

    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              isArchived: newIsArchived,
              archivedAt: newIsArchived ? archivedAt : d.archivedAt,
              archiveReason: newIsArchived ? archiveReason : d.archiveReason,
            }
          : d
      )
    );

    supabase
      .from("devices")
      .update({
        is_archived: newIsArchived,
        archived_at: newIsArchived ? archivedAt : null,
        archive_reason: newIsArchived ? archiveReason ?? null : null,
      })
      .eq("id", deviceId)
      .then(({ error }) => {
        if (error) console.error("Supabase Archive Update Error:", error);
      });

    if (device.isArchived) {
      addAuditEntry(
        device.id,
        "device_unarchived",
        `Gerät reaktiviert (Archiv aufgehoben): ${device.name} (UDI-DI: ${device.udiDi}, SN: ${device.serial}).`
      );
      setMessage(`Gerät "${device.name}" wurde aus dem Archiv geholt.`);
    } else {
      addAuditEntry(
        device.id,
        "device_archived",
        `Gerät archiviert (Stilllegung): ${device.name} (UDI-DI: ${device.udiDi}, SN: ${device.serial}).${
          archiveReason ? ` Grund: ${archiveReason}` : ""
        }`
      );
      setMessage(`Gerät "${device.name}" wurde archiviert (Stilllegung).`);
    }
  };

  const handleUpdateDeviceMeta = (deviceId: string, updates: Partial<Device>) => {
    setDevices((prev) => {
      const deviceBefore = prev.find((d) => d.id === deviceId);
      if (!deviceBefore) return prev;

      const mergedUpdates: Partial<Device> = { ...updates };

      if (
        !deviceBefore.nonconformityId &&
        ((mergedUpdates.nonconformityCategory &&
          mergedUpdates.nonconformityCategory.trim() !== "") ||
          (mergedUpdates.nonconformitySeverity &&
            mergedUpdates.nonconformitySeverity.trim() !== "") ||
          (mergedUpdates.nonconformityAction &&
            mergedUpdates.nonconformityAction.trim() !== ""))
      ) {
        mergedUpdates.nonconformityId = generateNonconformityId();
      }

      const updatedDevices = prev.map((d) =>
        d.id === deviceId ? { ...d, ...mergedUpdates } : d
      );

      const deviceAfter = updatedDevices.find((d) => d.id === deviceId);
      if (!deviceAfter) return updatedDevices;

      if (
        mergedUpdates.status &&
        (mergedUpdates.status === "blocked" || mergedUpdates.status === "recall")
      ) {
        if (!deviceAfter.riskClass || !deviceAfter.riskClass.trim()) {
          deviceAfter.riskClass = "IIa";
          window.alert(
            "Risikoklasse war leer. Es wurde automatisch 'IIa' gesetzt. Bitte ggf. anpassen."
          );
        }
        if (
          mergedUpdates.status === "recall" &&
          (!deviceAfter.blockComment || !deviceAfter.blockComment.trim())
        ) {
          window.alert(
            "Bitte einen Kommentar / Sperrgrund für den Recall eintragen (z.B. Sicherheitsrückruf wegen Kompressor-Fehler)."
          );
        }
      }

      const changes: string[] = [];

      if (mergedUpdates.status && mergedUpdates.status !== deviceBefore.status) {
        changes.push(
          `Status geändert von "${DEVICE_STATUS_LABELS[deviceBefore.status]}" auf "${DEVICE_STATUS_LABELS[
            mergedUpdates.status
          ]}".`
        );
      }
      if (
        mergedUpdates.riskClass !== undefined &&
        mergedUpdates.riskClass !== deviceBefore.riskClass
      ) {
        changes.push(
          `Risikoklasse geändert von "${deviceBefore.riskClass || "–"}" auf "${
            mergedUpdates.riskClass || "–"
          }".`
        );
      }
      if (
        mergedUpdates.blockComment !== undefined &&
        mergedUpdates.blockComment !== deviceBefore.blockComment
      ) {
        changes.push(
          `Kommentar / Sperrgrund aktualisiert: "${mergedUpdates.blockComment || "–"}".`
        );
      }
      if (
        mergedUpdates.responsible !== undefined &&
        mergedUpdates.responsible !== deviceBefore.responsible
      ) {
        changes.push(`Verantwortlich gesetzt auf "${mergedUpdates.responsible || "–"}".`);
      }
      if (
        mergedUpdates.nonconformityCategory !== undefined &&
        mergedUpdates.nonconformityCategory !== deviceBefore.nonconformityCategory
      ) {
        changes.push(
          `Abweichungskategorie gesetzt auf "${mergedUpdates.nonconformityCategory || "–"}".`
        );
      }
      if (
        mergedUpdates.nonconformitySeverity !== undefined &&
        mergedUpdates.nonconformitySeverity !== deviceBefore.nonconformitySeverity
      ) {
        changes.push(
          `Abweichungsschwere geändert auf "${mergedUpdates.nonconformitySeverity || "–"}".`
        );
      }
      if (
        mergedUpdates.nonconformityAction !== undefined &&
        mergedUpdates.nonconformityAction !== deviceBefore.nonconformityAction
      ) {
        changes.push(`Abweichungs-/Sofortmaßnahmen aktualisiert.`);
      }
      if (
        mergedUpdates.nonconformityResponsible !== undefined &&
        mergedUpdates.nonconformityResponsible !== deviceBefore.nonconformityResponsible
      ) {
        changes.push(
          `Verantwortliche Person für Abweichung gesetzt auf "${
            mergedUpdates.nonconformityResponsible || "–"
          }".`
        );
      }
      if (
        mergedUpdates.lastServiceDate !== undefined &&
        mergedUpdates.lastServiceDate !== deviceBefore.lastServiceDate
      ) {
        changes.push(
          `Letzte Wartung auf "${mergedUpdates.lastServiceDate || "–"}" gesetzt.`
        );
      }
      if (
        mergedUpdates.nextServiceDate !== undefined &&
        mergedUpdates.nextServiceDate !== deviceBefore.nextServiceDate
      ) {
        changes.push(
          `Nächste Wartung auf "${mergedUpdates.nextServiceDate || "–"}" gesetzt.`
        );
      }
      if (
        mergedUpdates.serviceNotes !== undefined &&
        mergedUpdates.serviceNotes !== deviceBefore.serviceNotes
      ) {
        changes.push(`Service-/Wartungs-Notizen aktualisiert.`);
      }
      if (
        mergedUpdates.pmsNotes !== undefined &&
        mergedUpdates.pmsNotes !== deviceBefore.pmsNotes
      ) {
        changes.push(`PMS-/Feedback-Notizen aktualisiert.`);
      }
      if (
        mergedUpdates.validationStatus !== undefined &&
        mergedUpdates.validationStatus !== deviceBefore.validationStatus
      ) {
        changes.push(
          `Validierungsstatus (IQ/OQ/PQ) geändert auf "${
            mergedUpdates.validationStatus || "–"
          }".`
        );
      }
      if (
        mergedUpdates.nonconformityId &&
        mergedUpdates.nonconformityId !== deviceBefore.nonconformityId
      ) {
        changes.push(`Nonconformity-ID vergeben: "${mergedUpdates.nonconformityId}".`);
      }

      if (changes.length > 0) {
        addAuditEntry(
          deviceId,
          "device_meta_changed",
          `Änderungen für "${deviceAfter.name}" (SN: ${
            deviceAfter.serial
          }): ${changes.join(" | ")}`
        );
      }

      const dbPatch: any = {};
      if (mergedUpdates.status !== undefined) dbPatch.status = mergedUpdates.status;
      if (mergedUpdates.riskClass !== undefined)
        dbPatch.risk_class = mergedUpdates.riskClass ?? null;
      if (mergedUpdates.blockComment !== undefined)
        dbPatch.block_comment = mergedUpdates.blockComment ?? null;
      if (mergedUpdates.responsible !== undefined)
        dbPatch.responsible = mergedUpdates.responsible ?? null;
      if (mergedUpdates.nonconformityCategory !== undefined)
        dbPatch.nonconformity_category = mergedUpdates.nonconformityCategory ?? null;
      if (mergedUpdates.nonconformitySeverity !== undefined)
        dbPatch.nonconformity_severity = mergedUpdates.nonconformitySeverity ?? null;
      if (mergedUpdates.nonconformityAction !== undefined)
        dbPatch.nonconformity_action = mergedUpdates.nonconformityAction ?? null;
      if (mergedUpdates.nonconformityResponsible !== undefined)
        dbPatch.nonconformity_responsible =
          mergedUpdates.nonconformityResponsible ?? null;
      if (mergedUpdates.lastServiceDate !== undefined)
        dbPatch.last_service_date = toNullableDateOrTimestamp(
          mergedUpdates.lastServiceDate
        );
      if (mergedUpdates.nextServiceDate !== undefined)
        dbPatch.next_service_date = toNullableDateOrTimestamp(
          mergedUpdates.nextServiceDate
        );
      if (mergedUpdates.serviceNotes !== undefined)
        dbPatch.service_notes = mergedUpdates.serviceNotes ?? null;
      if (mergedUpdates.pmsNotes !== undefined)
        dbPatch.pms_notes = mergedUpdates.pmsNotes ?? null;
      if (mergedUpdates.validationStatus !== undefined)
        dbPatch.validation_status = mergedUpdates.validationStatus ?? null;
      if (mergedUpdates.nonconformityId !== undefined)
        dbPatch.nonconformity_id = mergedUpdates.nonconformityId ?? null;

      if (Object.keys(dbPatch).length > 0) {
        supabase
          .from("devices")
          .update(dbPatch)
          .eq("id", deviceId)
          .then(({ error }) => {
            if (error) console.error("Supabase Device Meta Update Error:", error);
          });
      }

      return updatedDevices;
    });
  };

  const docsForDevice = selectedDeviceId
    ? docs.filter((d) => d.deviceId === selectedDeviceId)
    : [];

  const auditForView = selectedDeviceId
    ? audit.filter((a) => a.deviceId === selectedDeviceId)
    : audit;

  const filteredDevices = devices.filter((device) => {
    if (device.isArchived) return false;
    if (!searchTerm.trim()) return true;
    const needle = searchTerm.toLowerCase();
    const haystack = [
      device.name,
      device.serial,
      device.udiDi,
      device.batch,
      device.udiPi,
      device.udiHash,
      DEVICE_STATUS_LABELS[device.status],
      device.riskClass,
      device.blockComment,
      device.dmrId,
      device.dhrId,
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
  const totalArchived = devices.filter((d) => d.isArchived).length;

  type DeviceGroup = {
    key: string;
    representative: Device;
    count: number;
  };

  const groupsMap: Record<string, DeviceGroup> = {};
  for (const d of filteredDevices) {
    const key = `${d.name}__${d.batch ?? ""}`;
    if (!groupsMap[key]) {
      groupsMap[key] = {
        key,
        representative: d,
        count: 0,
      };
    }
    groupsMap[key].count += 1;
  }
  const groupedDevices: DeviceGroup[] = Object.values(groupsMap);

  const devicesInSameGroup: Device[] = selectedDevice
    ? devices.filter((d) => d.name === selectedDevice.name && d.batch === selectedDevice.batch)
    : [];
  const normalizedUdiPiSearch = udiPiSearch.trim().toLowerCase();
  const filteredDevicesInSameGroup = devicesInSameGroup.filter((d) => {
    if (!normalizedUdiPiSearch) return true;
    return (d.udiPi || "").toLowerCase().includes(normalizedUdiPiSearch);
  });
  const archivedDevicesInSameGroup: Device[] = selectedDevice
    ? devices.filter(
        (d) => d.isArchived && d.name === selectedDevice.name && d.batch === selectedDevice.batch
      )
    : [];

  const handleTogglePinnedGroup = () => {
    if (!selectedDevice) return;
    setIsGroupPinned((prev) => !prev);
  };

  const handleExportJSON = () => {
    if (!devices.length) {
      setMessage("Keine Geräte zum Exportieren vorhanden.");
      return;
    }

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

  const handleExportCSV = () => {
    if (!devices.length) {
      setMessage("Keine Geräte zum Exportieren vorhanden.");
      return;
    }

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

  const handleExportDhrJson = () => {
    if (!selectedDevice) {
      setMessage("Kein Gerät für DHR-Export ausgewählt.");
      return;
    }

    const dhrDocs = docs.filter((d) => d.deviceId === selectedDevice.id);
    const dhrAudit = audit.filter((a) => a.deviceId === selectedDevice.id);

    const payload = {
      device: selectedDevice,
      docs: dhrDocs,
      audit: dhrAudit,
      exportedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const safeSerial = selectedDevice.serial || selectedDevice.id;
    a.href = url;
    a.download = `DHR-${safeSerial}.json`;
    a.click();

    URL.revokeObjectURL(url);
    setMessage("DHR für dieses Gerät als JSON exportiert.");
  };

  // ---------- CONDITIONAL UI (LOGIN / DASHBOARD) ----------

if (!user) {
  return (
    <main className="relative min-h-[60vh] flex items-center justify-center">
      {/* Partner-Logos mittig, keine eigene blaue Fläche */}
      <div className="flex flex-col items-center">
        <span className="text-xs text-slate-400 mb-2">
          Partner • Healthcare &amp; Pharma
        </span>

        <div className="logo-ticker opacity-80">
          <div className="flex items-center gap-6 logo-ticker-sizer">
            <img
              src="/partners/novartis.png"
              className="h-10 w-auto object-contain"
              alt="Novartis"
            />
            <img src="/partners/roche.png" className="h-6" alt="Roche" />
            <img src="/partners/pfizer.png" className="h-10" alt="Pfizer" />
            <img src="/partners/johnson.png" className="h-5" alt="Merck" />
            <img src="/partners/bayer.png" className="h-7" alt="Thalheimer" />
          </div>
          <div className="logo-ticker-track gap-6">
            <div className="flex items-center gap-6">
              <img
                src="/partners/novartis.png"
                className="h-10 w-auto object-contain"
                alt="Novartis"
              />
              <img src="/partners/roche.png" className="h-6" alt="Roche" />
              <img src="/partners/pfizer.png" className="h-6" alt="Pfizer" />
              <img src="/partners/johnson.png" className="h-5" alt="Merck" />
              <img src="/partners/bayer.png" className="h-7" alt="Thalheimer" />
            </div>
            <div className="flex items-center gap-6" aria-hidden="true">
              <img
                src="/partners/novartis.png"
                className="h-10 w-auto object-contain"
                alt="Novartis"
              />
              <img src="/partners/roche.png" className="h-6" alt="Roche" />
              <img src="/partners/pfizer.png" className="h-6" alt="Pfizer" />
              <img src="/partners/johnson.png" className="h-5" alt="Merck" />
              <img src="/partners/bayer.png" className="h-7" alt="Thalheimer" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}




if (!user) {
  return (
    <main className="relative min-h-screen text-slate-50 overflow-hidden">
      {/* Hier absichtlich leer – keine Grafik, kein Vogel */}
    </main>
  );
}







      




  // ---------- EINGELOGGT: DASHBOARD ----------

 return (
  <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="w-full min-w-0 mx-auto px-0 py-10 space-y-8">
      {/* HEADER */}
<header
  className="
    relative
    space-y-4
    rounded-3xl
    bg-slate-900/40
    backdrop-blur-xl
    border border-white/10
    shadow-[0_0_25px_rgba(0,200,255,0.15)]
    before:absolute before:inset-0 before:-z-10
    before:rounded-3xl
    before:bg-gradient-to-r before:from-cyan-500/10 before:to-blue-500/10
    before:blur-2xl
  "
>
  <div className="flex items-start justify-between gap-4 p-6">
    <div>
      <h1 className="text-3xl font-bold text-sky-100 drop-shadow-[0_0_4px_rgba(0,200,255,0.3)]">
        MedSafe-UDI – Geräteübersicht
      </h1>

      <p className="text-slate-400 text-sm mt-1">
        Produktname &amp; Anzahl eingeben – UDI-DI, Seriennummern, Charge &amp;
        UDI-PI (ohne Verfallsdatum) werden automatisch generiert und in Supabase
        gespeichert. Jedes Gerät startet als freigegeben und kann später einzeln
        in Quarantäne oder Recall gesetzt, kommentiert, archiviert und mit
        Service-/PMS-/Dokumenten-Historie verwaltet werden.
      </p>
    </div>
  </div>

  {/* Stats + Aktionen */}
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 pb-6">
    <div className="flex gap-3 text-xs md:text-sm">
      <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-[0_0_10px_rgba(0,200,255,0.05)]">
        <div className="text-slate-400">Geräte gesamt</div>
        <div className="text-lg font-semibold">{totalDevices}</div>
      </div>

      <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-[0_0_10px_rgba(0,200,255,0.05)]">
        <div className="text-slate-400">Dokumente</div>
        <div className="text-lg font-semibold">{totalDocs}</div>
      </div>

      <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-[0_0_10px_rgba(0,200,255,0.05)]">
        <div className="text-slate-400">Archiviert</div>
        <div className="text-lg font-semibold">{totalArchived}</div>
      </div>
    </div>

    <div className="flex gap-2">
      <button
        onClick={loadAllFromSupabase}
        className="
          text-xs md:text-sm rounded-lg border border-slate-700
          px-3 py-2 bg-slate-900
          hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(0,200,255,0.5)]
          transition
        "
      >
        Cloud aktualisieren
      </button>

      <button
        onClick={handleExportJSON}
        className="
          text-xs md:text-sm rounded-lg border border-slate-700
          px-3 py-2 bg-slate-900
          hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(0,200,255,0.5)]
          transition
        "
      >
        Export JSON
      </button>

      <button
        onClick={handleExportCSV}
        className="
          text-xs md:text-sm rounded-lg border border-slate-700
          px-3 py-2 bg-slate-900
          hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(0,200,255,0.5)]
          transition
        "
      >
        Export CSV
      </button>
    </div>
  </div>
</header>



        {isLoading && (
          <div className="rounded-md bg-slate-800 border border-slate-700 px-4 py-2 text-sm">
            Daten werden aus Supabase geladen …
          </div>
        )}

        {message && !isLoading && (
          <div className="rounded-md bg-slate-800 border border-slate-700 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        {/* Neue Geräte */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Neue Geräte anlegen</h2>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-5 items-start">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                <input
                  className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                  placeholder="Produktname (z.B. FREEZO FZ-380)"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                  placeholder="Anzahl"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value || "1") || 1))
                  }
                />
                <p className="text-xs text-slate-400">
                  Es werden automatisch so viele Geräte mit derselben Charge angelegt
                  (Freigegeben, inkl. DMR-/DHR-ID in Supabase).
                </p>
              </div>

              <button
                onClick={handleSaveDevice}
                className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium"
              >
                Geräte speichern
              </button>
            </div>

            <div className="lg:border-l lg:border-slate-800/70 lg:pl-5">
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 md:p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    Regulatorische &amp; QMS-Daten
                  </div>
                  {showMdrWarning && (
                    <div className="mt-2 text-xs text-amber-300/90">
                      ⚠️ MDR-Klasse fehlt – bitte im Produkt/DMR pflegen.
                    </div>
                  )}
                </div>

                <div className="divide-y divide-slate-800/80 text-sm">
                  <div className="pb-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Medizinprodukt
                    </div>
                    <div className="mt-3 grid grid-cols-[140px,1fr] gap-2">
                      <div className="text-slate-400 text-xs">MDR Klasse</div>
                      <div>
                        {mdrClass ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                            MDR {mdrClass}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>

                      <div className="text-slate-400 text-xs">MDR Regel</div>
                      <div className="text-slate-200">{mdrRule || "—"}</div>

                      <div className="text-slate-400 text-xs">
                        Risikokategorie (intern)
                      </div>
                      <div className="text-slate-200">{internalRiskLevel || "—"}</div>

                      <div className="text-slate-400 text-xs">Intended Purpose</div>
                      <div className="text-slate-200 leading-snug line-clamp-2">
                        {intendedPurpose || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="py-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      QMS Verknüpfung
                    </div>
                    <div className="mt-3 grid grid-cols-[140px,1fr] gap-2">
                      <div className="text-slate-400 text-xs">DMR</div>
                      <div>
                        {dmrLabel ? (
                          <div className="space-y-1">
                            <div className="text-slate-200">{dmrLabel}</div>
                            {previewDmrId && (
                              <div className="font-mono text-[11px] text-slate-400/90">
                                {previewDmrId}
                              </div>
                            )}
                          </div>
                        ) : previewDmrId ? (
                          <div className="font-mono text-[11px] text-slate-400/90">
                            {previewDmrId}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>

                      <div className="text-slate-400 text-xs">DHR</div>
                      <div className="text-slate-200">automatisch pro Gerät</div>

                      <div className="text-slate-400 text-xs">Status</div>
                      <div>
                        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                          Freigegeben
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="py-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Audit Trail
                    </div>
                    <div className="mt-3 grid grid-cols-[140px,1fr] gap-2">
                      <div className="text-slate-400 text-xs">Angelegt von</div>
                      <div className="text-slate-200">{displayCreatedBy}</div>

                      <div className="text-slate-400 text-xs">Zeitpunkt</div>
                      <div className="text-slate-200">{displayTimestamp}</div>

                      <div className="text-slate-400 text-xs">Freigabe</div>
                      <div className="text-slate-200">
                        automatisch bei Erstellung
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Identifikation
                    </div>
                    <div className="mt-3 grid grid-cols-[140px,1fr] gap-2">
                      <div className="text-slate-400 text-xs">Charge</div>
                      <div className="text-slate-200">{previewBatch || "—"}</div>

                      <div className="text-slate-400 text-xs">Geräteanzahl</div>
                      <div className="text-slate-200">{safeQuantity}</div>

                      <div className="text-slate-400 text-xs">Seriennummern</div>
                      <div className="text-slate-200">automatisch fortlaufend</div>

                      <div className="text-slate-400 text-xs">UDI-PI</div>
                      <div className="text-slate-200">auto (Charge + SN)</div>

                      <div className="text-slate-400 text-xs">UDI-Hash</div>
                      <div className="text-slate-200">SHA-256</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Aktive Gruppen */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Angelegte Geräte-Gruppen (Produkt / Charge – aktive Geräte)
            </h2>

            <div className="w-full md:w-1/2 flex items-center gap-2">
              <input
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="Suche nach Name, SN, UDI, Status, Kommentar, DMR…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button
                className={
                  "text-xs rounded-lg border px-3 py-2 transition " +
                  (isGroupPinned
                    ? "border-sky-400/70 bg-sky-500/20 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.55)]"
                    : "border-white/10 bg-white/5 text-slate-200 hover:border-sky-400/70 hover:text-sky-100 hover:shadow-[0_0_12px_rgba(56,189,248,0.35)]")
                }
                onClick={handleTogglePinnedGroup}
                disabled={!selectedDevice}
                title={!selectedDevice ? "Bitte zuerst eine Gruppe auswählen" : ""}
              >
                {isGroupPinned ? "Pinned" : "Pin"}
              </button>
            </div>
          </div>

          {devices.length === 0 ? (
            <p className="text-sm text-slate-400">Noch keine Geräte angelegt.</p>
          ) : groupedDevices.length === 0 ? (
            <p className="text-sm text-slate-400">
              Keine aktiven Geräte passend zur Suche gefunden.
            </p>
          ) : (
            <ul className="space-y-2">
              {groupedDevices.map((group) => {
                const device = group.representative;
                const isSelected = selectedDeviceId === device.id;

                const devicesOfGroup = devices.filter(
                  (d) => d.name === device.name && d.batch === device.batch
                );
                const docCountForGroup = devicesOfGroup.reduce((sum, d) => {
                  return sum + docs.filter((doc) => doc.deviceId === d.id).length;
                }, 0);

                const statusSet = new Set(devicesOfGroup.map((d) => d.status));
                let statusLabel: string;
                if (statusSet.size === 1) {
                  statusLabel = DEVICE_STATUS_LABELS[devicesOfGroup[0].status];
                } else {
                  statusLabel = "Gemischter Status";
                }

                const hasRiskStatus = devicesOfGroup.some(
                  (d) => d.status === "blocked" || d.status === "recall"
                );

                const statusClass =
                  statusLabel === "Gemischter Status"
                    ? "bg-amber-600/20 text-amber-300 border-amber-500/40"
                    : hasRiskStatus
                    ? "bg-red-600/20 text-red-300 border-red-500/40"
                    : "bg-emerald-600/20 text-emerald-300 border-emerald-500/40";

                return (
                  <li key={group.key}>
                    <button
                      onClick={() => handleSelectDevice(device.id)}
                      className={
                        "w-full text-left px-4 py-3 rounded-xl border text-sm " +
                        (isSelected
                          ? "bg-emerald-900/50 border-emerald-600"
                          : "bg-slate-900 border-slate-700 hover:border-emerald-500/60")
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">
                          {device.name} – Charge: {device.batch ?? "–"}{" "}
                          <span className="text-slate-400">
                            ({group.count} aktive Gerät
                            {group.count !== 1 ? "e" : ""},{" "}
                            {docCountForGroup} Dokument
                            {docCountForGroup !== 1 ? "e" : ""})
                          </span>
                        </div>
                        <span
                          className={
                            "text-[10px] px-2 py-0.5 rounded-full border " + statusClass
                          }
                        >
                          {statusLabel}
                        </span>
                      </div>
                      {device.dmrId && (
                        <div className="text-[11px] text-slate-400 mt-1 break-all">
                          DMR-ID: {device.dmrId}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 mt-1 break-all">
                        Beispiel-SN: {device.serial}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 break-all">
                        UDI-DI: {device.udiDi}
                      </div>
                      {device.udiPi && (
                        <div className="text-xs text-slate-300 mt-1 break-all">
                          UDI-PI (Beispiel): {device.udiPi}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Ausgewählte Gruppe (Sticky) */}
        {selectedDevice && isGroupPinned && (
          <section className="sticky top-16 z-20">
            <div className="bg-slate-900/90 border border-emerald-600/40 rounded-2xl p-3 md:p-4 space-y-2 shadow-lg shadow-black/30 backdrop-blur-2xl">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">
                    AUSGEWÄHLTE GRUPPE
                  </div>
                  <div className="text-sm text-slate-200">
                    Produkt / Charge – aktive Geräte
                  </div>
                </div>
                <button
                  className="text-[11px] rounded-md border border-sky-400/70 bg-sky-500/20 px-3 py-1 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.55)]"
                  onClick={handleTogglePinnedGroup}
                >
                  Pinned
                </button>
              </div>
              {(() => {
                const devicesOfGroup = devicesInSameGroup;
                const docCountForGroup = devicesOfGroup.reduce((sum, d) => {
                  return sum + docs.filter((doc) => doc.deviceId === d.id).length;
                }, 0);
                const statusSet = new Set(devicesOfGroup.map((d) => d.status));
                let statusLabel: string;
                if (statusSet.size === 1) {
                  statusLabel = DEVICE_STATUS_LABELS[devicesOfGroup[0].status];
                } else {
                  statusLabel = "Gemischter Status";
                }
                const hasRiskStatus = devicesOfGroup.some(
                  (d) => d.status === "blocked" || d.status === "recall"
                );
                const statusClass =
                  statusLabel === "Gemischter Status"
                    ? "bg-amber-600/20 text-amber-300 border-amber-500/40"
                    : hasRiskStatus
                    ? "bg-red-600/20 text-red-300 border-red-500/40"
                    : "bg-emerald-600/20 text-emerald-300 border-emerald-500/40";
                return (
                  <div className="mt-2 rounded-xl border border-emerald-500/30 bg-slate-900/60 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">
                        {selectedDevice.name} – Charge: {selectedDevice.batch ?? "–"}{" "}
                        <span className="text-slate-400">
                          ({devicesOfGroup.length} aktive Gerät
                          {devicesOfGroup.length !== 1 ? "e" : ""},{" "}
                          {docCountForGroup} Dokument
                          {docCountForGroup !== 1 ? "e" : ""})
                        </span>
                      </div>
                      <span
                        className={
                          "text-[10px] px-2 py-0.5 rounded-full border " + statusClass
                        }
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {selectedDevice.dmrId && (
                      <div className="text-[11px] text-slate-400 mt-1 break-all">
                        DMR-ID: {selectedDevice.dmrId}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-1 break-all">
                      Beispiel-SN: {selectedDevice.serial}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 break-all">
                      UDI-DI: {selectedDevice.udiDi}
                    </div>
                    {selectedDevice.udiPi && (
                      <div className="text-xs text-slate-300 mt-1 break-all">
                        UDI-PI (Beispiel): {selectedDevice.udiPi}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* Tabelle Gruppe */}
        {selectedDevice && devicesInSameGroup.length > 0 && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="font-semibold">
                  Geräte in dieser Produkt/Charge-Gruppe (inkl. Archiv)
                </div>
                <div className="text-[11px] text-slate-400">
                  Klick auf eine Zeile, um dieses Gerät aktiv auszuwählen.
                </div>
              </div>
              <div className="w-full md:w-1/2">
                <input
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                  placeholder="Suche nach UDI-PI"
                  value={udiPiSearch}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setUdiPiSearch(nextValue);
                    const nextNeedle = nextValue.trim().toLowerCase();
                    if (!nextNeedle) return;
                    const matches = devicesInSameGroup.filter((d) =>
                      (d.udiPi || "").toLowerCase().includes(nextNeedle)
                    );
                    if (matches.length === 1) {
                      handleSelectDevice(matches[0].id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const matches = filteredDevicesInSameGroup;
                    if (matches.length > 0) {
                      handleSelectDevice(matches[0].id);
                    }
                  }}
                />
              </div>
            </div>
            <div className="relative max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-800/80 bg-slate-900/40">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      Seriennummer
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      UDI-PI
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      Status
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      Kommentar kurz
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      Verantwortlich
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      Angelegt am
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-950/95 py-1 pr-2 text-left backdrop-blur">
                      Aktion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevicesInSameGroup.map((d) => {
                    const isRowSelected = selectedDeviceId === d.id;
                    const statusLabel = DEVICE_STATUS_LABELS[d.status];
                    const statusClass = (() => {
                      switch (statusLabel) {
                        case "Recall (Rückruf)":
                          return "recall-row text-slate-100";
                        case "Gesperrt / Quarantäne":
                          return "bg-rose-950/60 shadow-[0_0_14px_rgba(239,68,68,0.35)] hover:bg-rose-950/60";
                        case "In Herstellung":
                          return "bg-slate-900/60 shadow-[0_0_16px_rgba(251,146,60,0.5)] hover:bg-slate-900/60";
                        case "Freigegeben (Inverkehrbringen)":
                          return "bg-emerald-900/40 hover:bg-emerald-900/40";
                        default:
                          return "";
                      }
                    })();
                    const isEditing = editRowId === d.id;
                    return (
                      <>
                        <tr
                          key={d.id}
                          onClick={() => setSelectedDeviceId(d.id)}
                          className={
                            "border-b border-slate-800 last:border-b-0 cursor-pointer " +
                            (statusClass
                              ? statusClass
                              : isRowSelected
                              ? "bg-emerald-900/40"
                              : d.isArchived
                              ? "bg-slate-800/60"
                              : "hover:bg-slate-800/60")
                          }
                        >
                          <td className="py-1 pr-2 break-all">{d.serial}</td>
                          <td className="py-1 pr-2 break-all">{d.udiPi}</td>
                          <td className="py-1 pr-2">{statusLabel}</td>
                          <td className="py-1 pr-2 break-all">
                            {d.blockComment
                              ? d.blockComment.slice(0, 40) +
                                (d.blockComment.length > 40 ? "…" : "")
                              : "–"}
                          </td>
                          <td className="py-1 pr-2 break-all">
                            {d.responsible
                              ? d.responsible.slice(0, 30) +
                                (d.responsible.length > 30 ? "…" : "")
                              : "–"}
                          </td>
                          <td className="py-1 pr-2">
                            {new Date(d.createdAt).toLocaleString()}
                          </td>
                          <td className="py-1 pr-2">
                            <button
                              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isEditing) {
                                  setEditRowId(null);
                                  setEditDraft(null);
                                  return;
                                }
                                setEditRowId(d.id);
                                setEditDraft({
                                  status: d.status,
                                  riskClass: d.riskClass || "",
                                  blockComment: d.blockComment || "",
                                  responsible: d.responsible || "",
                                });
                              }}
                            >
                              {isEditing ? "Schließen" : "Edit"}
                            </button>
                          </td>
                        </tr>
                        {isEditing && editDraft && (
                          <tr
                            className={
                              "border-b border-slate-800 " +
                              (statusClass ? statusClass : "")
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <td colSpan={7} className="py-2">
                              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-300 shadow-[0_0_18px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                  <div>
                                    <div className="text-slate-400 text-[11px] mb-1">
                                      Status
                                    </div>
                                    <select
                                      className="w-full bg-slate-900/70 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                                      value={editDraft.status}
                                      onChange={(e) =>
                                        setEditDraft({
                                          ...editDraft,
                                          status: e.target.value as DeviceStatus,
                                        })
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="released">
                                        Freigegeben (Inverkehrbringen)
                                      </option>
                                      <option value="blocked">
                                        Gesperrt / Quarantäne
                                      </option>
                                      <option value="in_production">
                                        In Herstellung
                                      </option>
                                      <option value="recall">
                                        Recall (Rückruf)
                                      </option>
                                    </select>
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-[11px] mb-1">
                                      Risikoklasse
                                    </div>
                                    <input
                                      className="w-full bg-slate-900/70 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                                      placeholder="I, IIa, IIb, III"
                                      value={editDraft.riskClass}
                                      onChange={(e) =>
                                        setEditDraft({
                                          ...editDraft,
                                          riskClass: e.target.value,
                                        })
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-[11px] mb-1">
                                      Kommentar / Sperrgrund
                                    </div>
                                    <textarea
                                      className="w-full min-h-[54px] bg-slate-900/70 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                                      placeholder="z.B. Defekt, Sicherheitsrückruf…"
                                      value={editDraft.blockComment}
                                      onChange={(e) =>
                                        setEditDraft({
                                          ...editDraft,
                                          blockComment: e.target.value,
                                        })
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-slate-400 text-[11px] mb-1">
                                      Verantwortlich
                                    </div>
                                    <input
                                      className="w-full bg-slate-900/70 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                                      placeholder="Name / Abteilung"
                                      value={editDraft.responsible}
                                      onChange={(e) =>
                                        setEditDraft({
                                          ...editDraft,
                                          responsible: e.target.value,
                                        })
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    className="rounded-md bg-emerald-600/90 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateDeviceMeta(d.id, {
                                        status: editDraft.status,
                                        riskClass: editDraft.riskClass,
                                        blockComment: editDraft.blockComment,
                                        responsible: editDraft.responsible,
                                      });
                                      setEditRowId(null);
                                      setEditDraft(null);
                                    }}
                                  >
                                    Speichern
                                  </button>
                                  <button
                                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditRowId(null);
                                      setEditDraft(null);
                                    }}
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredDevicesInSameGroup.length === 0 && (
              <div className="text-[11px] text-slate-400">
                Keine Geräte passend zur UDI-PI-Suche gefunden.
              </div>
            )}
          </section>
        )}

        {/* Geräteakte */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Geräteakte – Detailansicht (DHR)</h2>
            {selectedDevice && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleArchiveDevice(selectedDevice.id)}
                  className={
                    "text-xs md:text-sm rounded-lg border px-3 py-2 " +
                    (selectedDevice.isArchived
                      ? "border-emerald-500/70 bg-emerald-900/40 hover:bg-emerald-800"
                      : "border-yellow-500/70 bg-yellow-900/40 hover:bg-yellow-800")
                  }
                >
                  {selectedDevice.isArchived
                    ? "Aus Archiv holen (Admin-PIN)"
                    : "Archivieren / Stilllegen (Admin-PIN)"}
                </button>
                <button
                  onClick={handleExportDhrJson}
                  className="text-xs md:text-sm rounded-lg border border-slate-700 px-3 py-2 bg-slate-900 hover:border-emerald-500"
                >
                  DHR als JSON exportieren
                </button>
              </div>
            )}
          </div>

          {!selectedDevice ? (
            <p className="text-sm text-amber-400">
              Bitte oben eine Geräte-Gruppe auswählen und dann in der Tabelle ein Gerät
              anklicken, um dessen Geräteakte zu sehen.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">Produktname</div>
                  <div className="font-semibold">{selectedDevice.name || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Seriennummer (DHR)</div>
                  <div className="break-all">{selectedDevice.serial || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">
                    DHR-ID (Geräte-Historie)
                  </div>
                  <div className="break-all">{selectedDevice.dhrId || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">DMR-ID</div>
                  <div className="break-all">{selectedDevice.dmrId || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Charge</div>
                  <div>{selectedDevice.batch || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">UDI-DI</div>
                  <div className="break-all">{selectedDevice.udiDi || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs flex items-center justify-between gap-2">
                    <span>UDI-PI (ohne Verfallsdatum)</span>
                    {selectedDevice.udiPi && (
                      <button
                        className="text-[10px] text-emerald-300 hover:text-emerald-200"
                        onClick={() => copyToClipboard(selectedDevice.udiPi || "")}
                      >
                        Kopieren
                      </button>
                    )}
                  </div>
                  <div className="break-all text-slate-200">
                    {selectedDevice.udiPi || "–"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs flex items-center justify-between gap-2">
                    <span>UDI-Hash (fälschungssichere ID)</span>
                    {selectedDevice.udiHash && (
                      <button
                        className="text-[10px] text-emerald-300 hover:text-emerald-200"
                        onClick={() => copyToClipboard(selectedDevice.udiHash || "")}
                      >
                        Kopieren
                      </button>
                    )}
                  </div>
                  <div className="break-all text-xs text-slate-200">
                    {selectedDevice.udiHash || "–"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Angelegt am</div>
                  <div>
                    {selectedDevice.createdAt
                      ? new Date(selectedDevice.createdAt).toLocaleString()
                      : "–"}
                  </div>
                </div>
              </div>

              {/* Service / PMS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="font-semibold mb-1">Service / Wartung (DHR)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-slate-400 text-[11px] mb-1">
                        Letzte Wartung (ISO-Datum)
                      </div>
                      <input
                        type="date"
                        className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                        value={selectedDevice.lastServiceDate || ""}
                        onChange={(e) =>
                          handleUpdateDeviceMeta(selectedDevice.id, {
                            lastServiceDate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-1">
                        Nächste Wartung (ISO-Datum)
                      </div>
                      <input
                        type="date"
                        className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                        value={selectedDevice.nextServiceDate || ""}
                        onChange={(e) =>
                          handleUpdateDeviceMeta(selectedDevice.id, {
                            nextServiceDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[11px] mb-1">
                      Service- / Wartungsnotizen
                    </div>
                    <textarea
                      className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 min-h-[50px] w-full"
                      placeholder="z.B. Kompressor geprüft, Firmware aktualisiert…"
                      value={selectedDevice.serviceNotes || ""}
                      onChange={(e) =>
                        handleUpdateDeviceMeta(selectedDevice.id, {
                          serviceNotes: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="font-semibold mb-1">
                    PMS / Feedback (Post-Market Surveillance)
                  </div>
                  <div className="text-slate-400 text-[11px] mb-1">
                    PMS- / Feedback-Notizen für dieses Gerät
                  </div>
                  <textarea
                    className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 min-h-[80px] w-full"
                    placeholder="z.B. Rückmeldungen von Anwendern, Vorkommnisse, Reklamationen…"
                    value={selectedDevice.pmsNotes || ""}
                    onChange={(e) =>
                      handleUpdateDeviceMeta(selectedDevice.id, {
                        pmsNotes: e.target.value,
                      })
                    }
                  />

                  <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px] mb-1">
                        Verknüpfte Dokumente (DHR)
                      </div>
                      <div className="font-semibold text-lg">
                        {docs.filter((d) => d.deviceId === selectedDevice.id).length}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px] mb-1">
                        Aktivitäten (Audit)
                      </div>
                      <div className="font-semibold text-lg">
                        {audit.filter((a) => a.deviceId === selectedDevice.id).length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Dokumente */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            Dokumente zum Gerät (DHR / DMR-Verknüpfung)
          </h2>

          {selectedDeviceId ? (
            <p className="text-sm text-slate-400">
              Aktuelles Gerät:{" "}
              {devices.find((d) => d.id === selectedDeviceId)?.name} – SN:{" "}
              {devices.find((d) => d.id === selectedDeviceId)?.serial}
            </p>
          ) : (
            <p className="text-sm text-amber-400">
              Bitte oben ein Gerät wählen – dann siehst du hier die verknüpften
              Dokumente.
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

          {/* Dokumentenlenkung */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mt-2">
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Version</div>
              <input
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                placeholder="z.B. V1.0"
                value={docVersion}
                onChange={(e) => setDocVersion(e.target.value)}
              />
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Revision</div>
              <input
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                placeholder="z.B. Rev. 0"
                value={docRevision}
                onChange={(e) => setDocRevision(e.target.value)}
              />
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Status</div>
              <select
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                value={docStatus}
                onChange={(e) => setDocStatus(e.target.value as DocStatus)}
              >
                {DOC_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">
                Freigegeben von
              </div>
              <input
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                placeholder="Name QMB / Verantwortlicher"
                value={docApprovedBy}
                onChange={(e) => setDocApprovedBy(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleUploadDoc}
            disabled={isUploading}
            className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-medium"
          >
            {isUploading ? "Upload läuft …" : "Dokument speichern"}
          </button>

          {selectedDeviceId && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                Dokumente für dieses Gerät (DHR-Dokumente)
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
                      <div className="font-medium flex flex-wrap items-center gap-2">
                        <span>{doc.name}</span>
                        <span className="text-xs text-slate-400">
                          ({doc.category ? doc.category : "ohne Kategorie"})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Version: {doc.version || "–"} | Revision: {doc.revision || "–"} |
                        Status: {doc.docStatus || "Controlled"} | Freigegeben von:{" "}
                        {doc.approvedBy || "–"}
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

        {/* Abweichung / Quarantäne */}
        {selectedDevice && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-3">
            <h2 className="text-lg font-semibold">
              Abweichung / Quarantäne (Nonconformity)
            </h2>
            <div className="text-xs text-slate-400">
              NC-ID wird automatisch vergeben, sobald eine Abweichung gepflegt wird.
            </div>
            <div className="text-[11px]">{selectedDevice.nonconformityId || "–"}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-400 text-[11px] mb-1">
                  Kategorie der Abweichung
                </div>
                <input
                  className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                  placeholder="z.B. mechanisch, elektrisch, Software…"
                  value={selectedDevice.nonconformityCategory || ""}
                  onChange={(e) =>
                    handleUpdateDeviceMeta(selectedDevice.id, {
                      nonconformityCategory: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <div className="text-slate-400 text-[11px] mb-1">Schweregrad</div>
                <select
                  className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                  value={selectedDevice.nonconformitySeverity || ""}
                  onChange={(e) =>
                    handleUpdateDeviceMeta(selectedDevice.id, {
                      nonconformitySeverity: e.target.value,
                    })
                  }
                >
                  <option value="">–</option>
                  <option value="nicht kritisch">nicht kritisch</option>
                  <option value="kritisch">kritisch</option>
                </select>
              </div>
              <div>
                <div className="text-slate-400 text-[11px] mb-1">Verantwortlich</div>
                <input
                  className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500"
                  placeholder="Name der verantwortlichen Person"
                  value={selectedDevice.nonconformityResponsible || ""}
                  onChange={(e) =>
                    handleUpdateDeviceMeta(selectedDevice.id, {
                      nonconformityResponsible: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">
                Sofortmaßnahmen / Korrekturmaßnahmen
              </div>
              <textarea
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 min-h-[50px] w-full"
                placeholder="z.B. Gerät gesperrt, Kunde informiert, CAPA eröffnet…"
                value={selectedDevice.nonconformityAction || ""}
                onChange={(e) =>
                  handleUpdateDeviceMeta(selectedDevice.id, {
                    nonconformityAction: e.target.value,
                  })
                }
              />
            </div>
          </section>
        )}

        {/* Audit-Log */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-3">
          <h2 className="text-lg font-semibold">Aktivitäten (Audit-Log)</h2>
          <p className="text-xs text-slate-400">
            {selectedDeviceId
              ? "Es werden nur Aktivitäten angezeigt, die dieses Gerät direkt betreffen."
              : "Es werden Aktivitäten für alle Geräte / Bulk-Aktionen angezeigt."}
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
                  <div className="text-xs text-slate-500">Aktion: {entry.action}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Archivierte Geräte der Gruppe */}
        {selectedDevice && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold">Archivierte Geräte (Stilllegung)</h2>
            {archivedDevicesInSameGroup.length === 0 ? (
              <p className="text-sm text-slate-400">Noch keine Geräte archiviert.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {archivedDevicesInSameGroup.map((device) => {
                  const isSelected = selectedDeviceId === device.id;
                  return (
                    <li key={device.id}>
                      <button
                        onClick={() => handleSelectDevice(device.id)}
                        className={
                          "w-full text-left px-4 py-3 rounded-xl border text-sm " +
                          (isSelected
                            ? "bg-slate-900 border-emerald-500"
                            : "bg-slate-900 border-slate-700 hover:border-slate-500/70")
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">
                            {device.name} – SN: {device.serial}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-700/50 text-slate-200 border-slate-500/60">
                            Archiviert / Stillgelegt
                          </span>
                        </div>
                        {device.dmrId && (
                          <div className="text-[11px] text-slate-400 mt-1 break-all">
                            DMR-ID: {device.dmrId}
                          </div>
                        )}
                        {device.archivedAt && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            Archiviert am:{" "}
                            {new Date(device.archivedAt).toLocaleString()}
                          </div>
                        )}
                        {device.archiveReason && (
                          <div className="text-[11px] text-slate-500 mt-1 break-all">
                            Grund: {device.archiveReason}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
