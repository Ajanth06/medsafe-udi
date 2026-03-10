"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import Lottie from "lottie-react";
import birdAnimation from "./animations/bird.json"; // Lege bird.json unter app/animations/ ab

type DeviceStatus = "released" | "blocked" | "in_production" | "recall";

type Device = {
  id: string;
  name: string;
  udiDi: string;
  basicUdiDi?: string;
  serial: string;
  udiHash: string;
  createdAt: string;
  manufacturerName?: string;
  deviceVersionVariants?: string;
  deviceDescription?: string;
  principleOfOperation?: string;
  keyComponents?: string;
  accessories?: string;
  riskFileId?: string;
  fmeaId?: string;
  hazardAnalysisRef?: string;
  ceStatus?: string;
  notifiedBody?: string;
  conformityRoute?: string;
  clinicalEvaluationRef?: string;
  gsprChecklistLink?: string;

  batch?: string;
  productionDate?: string;
  udiPi?: string;

  status: DeviceStatus;
  riskClass?: string;
  mdrClass?: string;
  mdrRule?: string;
  intendedPurpose?: string;
  internalRiskLevel?: string;
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
  genericDeviceGroup?: string;
};

type DocStatus = "Draft" | "Controlled" | "Final";
type DocAssignmentScope = "device" | "batch" | "product_group";
type DocType =
  | "declaration_of_conformity"
  | "ifu"
  | "risk_management_file"
  | "test_report"
  | "labeling"
  | "dmr_master_document"
  | "other";

type Doc = {
  id: string;
  deviceId: string;
  name: string;
  cid: string;
  url: string;
  createdAt: string;
  category?: string;
  docType?: DocType;

  version?: string;
  revision?: string;
  docStatus?: DocStatus;
  approvedBy?: string;
  assignmentScope?: DocAssignmentScope;
  assignedBatch?: string;
  assignedProductGroup?: string;
  isMandatory?: boolean;
  purpose?: string;
};

type AuditEntry = {
  id: string;
  deviceId: string | null;
  action: string;
  message: string;
  timestamp: string;
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

const DOC_TYPE_OPTIONS: Array<{ value: DocType; label: string; patterns: string[] }> = [
  {
    value: "declaration_of_conformity",
    label: "Declaration of Conformity",
    patterns: ["declaration of conformity", "konformität", "doc"],
  },
  {
    value: "ifu",
    label: "IFU",
    patterns: ["ifu", "gebrauchsanweisung", "instruction for use"],
  },
  {
    value: "risk_management_file",
    label: "Risk Management File",
    patterns: ["risk management", "risikoanalyse", "fmea"],
  },
  {
    value: "test_report",
    label: "Test Report",
    patterns: ["test report", "prüfbericht", "emc", "iq/oq/pq"],
  },
  {
    value: "labeling",
    label: "Labeling",
    patterns: ["label", "etikett", "labeling"],
  },
  {
    value: "dmr_master_document",
    label: "DMR Master Document",
    patterns: ["dmr", "master document"],
  },
  {
    value: "other",
    label: "Sonstiges",
    patterns: [],
  },
];

const CATEGORY_REQUIRED_DOC_MATRIX: Record<string, DocType[]> = {
  default: [
    "declaration_of_conformity",
    "ifu",
    "risk_management_file",
    "test_report",
    "labeling",
    "dmr_master_document",
  ],
};

const DOC_STATUS_OPTIONS: DocStatus[] = ["Draft", "Controlled", "Final"];
const DOC_ASSIGNMENT_SCOPE_OPTIONS: Array<{
  value: DocAssignmentScope;
  label: string;
}> = [
  { value: "device", label: "Gerät" },
  { value: "batch", label: "Charge" },
  { value: "product_group", label: "Produktgruppe" },
];

const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  released: "Freigegeben (Inverkehrbringen)",
  blocked: "Gesperrt / Quarantäne",
  in_production: "In Herstellung",
  recall: "Recall (Rückruf)",
};

const REQUIRED_DOC_PATTERNS = [
  {
    key: "doc",
    label: "Declaration of Conformity",
    patterns: ["konformität", "declaration of conformity", "doc"],
  },
  {
    key: "ifu",
    label: "IFU / Gebrauchsanweisung",
    patterns: ["ifu", "gebrauchsanweisung", "instruction for use"],
  },
  {
    key: "risk",
    label: "Risikoanalyse",
    patterns: ["risikoanalyse", "risk analysis", "fmea"],
  },
  {
    key: "test",
    label: "EMC / Prüfbericht",
    patterns: ["emc", "prüfbericht", "testbericht", "iq/oq/pq"],
  },
  {
    key: "labeling",
    label: "Labeling",
    patterns: ["label", "etikett", "labeling"],
  },
  {
    key: "dmr",
    label: "DMR Master Document",
    patterns: ["dmr", "master document"],
  },
] as const;

type AiInsight = {
  deviceType: string;
  riskSignals: string[];
  missingDocs: string[];
  recommendation: string;
  complianceScore: number;
  documentStatus: string;
};

type AiApiResponse<T> = {
  ok?: boolean;
  task?: string;
  result?: T;
  error?: string;
};

type ComplianceAreaKey =
  | "device_data"
  | "udi_integrity"
  | "documentation"
  | "risk_management"
  | "governance";

type ComplianceArea = {
  key: ComplianceAreaKey;
  label: string;
  score: number;
  reasons: string[];
};

type ComplianceBreakdown = {
  overall: number;
  areas: ComplianceArea[];
};

type AiChatResult = {
  assistantReply?: string;
  actionItems?: string[];
  riskNotes?: string[];
};

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type IntendedUseReviewStatus = "Draft" | "Review" | "Approved";

type IntendedUseAiResult = {
  inferredProductType?: string;
  inferenceConfidence?: number;
  assumptions?: string[];
  intendedUse?: string;
  missingContext?: string[];
  regulatoryWarnings?: string[];
  reviewStatusSuggestion?: string;
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

function generateBasicUdiDi(manufacturerName: string, productName: string): string {
  const manufacturer = slugifyName(manufacturerName || "MFR").replace(/-/g, "").slice(0, 6);
  const product = slugifyName(productName || "DEVICE").replace(/-/g, "").slice(0, 8);
  return `TH-BDI-${manufacturer || "MFR"}-${product || "DEVICE"}`;
}

type AiSuggestionHintProps = {
  suggestion: string;
  onApply: () => void;
};

function AiSuggestionHint({ suggestion, onApply }: AiSuggestionHintProps) {
  if (!suggestion.trim()) return null;
  return (
    <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-sky-500/30 bg-sky-950/20 px-2 py-1 text-[11px]">
      <span className="text-sky-100 break-all">KI Vorschlag: {suggestion}</span>
      <button
        type="button"
        onClick={onApply}
        className="shrink-0 rounded border border-sky-500/50 bg-sky-900/20 px-2 py-0.5 text-[10px] text-sky-100"
      >
        Übernehmen
      </button>
    </div>
  );
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
    "Manufacturer",
    "BasicUDI-DI",
    "UDI-DI",
    "Serial",
    "Batch",
    "ProductionDate(YYMMDD)",
    "UDI-PI",
    "UDI-Hash",
    "Status",
    "RiskClass",
    "MDRClass",
    "MDRRule",
    "IntendedPurpose",
    "InternalRiskLevel",
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
    "DeviceVersionVariants",
    "DeviceDescription",
    "PrincipleOfOperation",
    "KeyComponents",
    "Accessories",
    "RiskFileID",
    "FMEA-ID",
    "HazardAnalysisRef",
    "CEStatus",
    "NotifiedBody",
    "ConformityRoute",
    "ClinicalEvaluationRef",
    "GSPRChecklistLink",
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
      d.manufacturerName || "",
      d.basicUdiDi || "",
      d.udiDi || "",
      d.serial || "",
      d.batch || "",
      d.productionDate || "",
      d.udiPi || "",
      d.udiHash || "",
      DEVICE_STATUS_LABELS[d.status] || d.status || "",
      d.riskClass || "",
      d.mdrClass || "",
      d.mdrRule || "",
      d.intendedPurpose || "",
      d.internalRiskLevel || "",
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
      d.deviceVersionVariants || "",
      d.deviceDescription || "",
      d.principleOfOperation || "",
      d.keyComponents || "",
      d.accessories || "",
      d.riskFileId || "",
      d.fmeaId || "",
      d.hazardAnalysisRef || "",
      d.ceStatus || "",
      d.notifiedBody || "",
      d.conformityRoute || "",
      d.clinicalEvaluationRef || "",
      d.gsprChecklistLink || "",
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

function inferDeviceType(productName: string): string {
  const n = productName.toLowerCase();
  if (n.includes("freez") || n.includes("kühl") || n.includes("cool")) return "Kühl-/Thermogerät";
  if (n.includes("pump") || n.includes("infus")) return "Pumpensystem";
  if (n.includes("monitor") || n.includes("sensor")) return "Monitoringgerät";
  if (n.includes("software") || n.includes("app")) return "Software as Medical Device";
  return "Allgemeines Medizinprodukt";
}

function findMissingRequiredDocs(deviceDocs: Doc[]): string[] {
  const normalized = deviceDocs
    .map((d) => `${d.name || ""} ${d.category || ""}`.toLowerCase())
    .join(" ");

  return REQUIRED_DOC_PATTERNS.filter((req) =>
    !req.patterns.some((pattern) => normalized.includes(pattern))
  ).map((req) => req.label);
}

function getDeviceValidationWarnings(device: Device, allDevices: Device[]): string[] {
  const warnings: string[] = [];

  if (device.udiDi && !/^TH-DI-\d{6}$/.test(device.udiDi)) {
    warnings.push("UDI-DI-Struktur ist ungewöhnlich.");
  }

  if (device.serial && !/^TH-SN-\d{6}-\d{3}$/.test(device.serial)) {
    warnings.push("Seriennummer-Struktur ist ungewöhnlich.");
  }

  const duplicateSerial = allDevices.filter((d) => d.serial === device.serial);
  if (device.serial && duplicateSerial.length > 1) {
    warnings.push("Doppelte Seriennummer erkannt.");
  }

  if (device.batch && !/^\d{6}$/.test(device.batch)) {
    warnings.push("Charge-Format ist ungewöhnlich.");
  }

  return warnings;
}

function isDocApproved(doc: Doc): boolean {
  const status = (doc.docStatus || "").toLowerCase();
  return (status === "final" || status === "controlled") && Boolean(doc.approvedBy?.trim());
}

function detectDocType(doc: Doc): DocType {
  if (doc.docType && DOC_TYPE_OPTIONS.some((opt) => opt.value === doc.docType)) {
    return doc.docType;
  }
  const text = `${doc.name || ""} ${doc.category || ""}`.toLowerCase();
  const match = DOC_TYPE_OPTIONS.find(
    (opt) => opt.value !== "other" && opt.patterns.some((pattern) => text.includes(pattern))
  );
  return match?.value || "other";
}

function getDocTypeLabel(docType: DocType): string {
  return DOC_TYPE_OPTIONS.find((opt) => opt.value === docType)?.label || docType;
}

function getRequiredDocTypesForCategory(category?: string): DocType[] {
  const key = (category || "").trim().toLowerCase();
  if (!key) return CATEGORY_REQUIRED_DOC_MATRIX.default;
  return (
    CATEGORY_REQUIRED_DOC_MATRIX[key] ||
    CATEGORY_REQUIRED_DOC_MATRIX.default
  );
}

function computeComplianceBreakdown(
  device: Device,
  deviceDocs: Doc[],
  allDevices: Device[],
  deviceAuditEntries: AuditEntry[] = []
): ComplianceBreakdown {
  const byKey = (key: ComplianceAreaKey, label: string, score: number, reasons: string[]) => ({
    key,
    label,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  });

  // 1) Device Data
  let deviceDataScore = 100;
  const deviceDataReasons: string[] = [];
  if (!device.genericDeviceGroup?.trim()) {
    deviceDataScore -= 20;
    deviceDataReasons.push("Gerätekategorie fehlt.");
  }
  if (!device.riskClass?.trim()) {
    deviceDataScore -= 20;
    deviceDataReasons.push("Risikoklasse fehlt.");
  }
  if (!device.intendedPurpose?.trim()) {
    deviceDataScore -= 25;
    deviceDataReasons.push("Zweckbestimmung fehlt.");
  }
  if (!device.batch?.trim()) {
    deviceDataScore -= 15;
    deviceDataReasons.push("Charge fehlt.");
  }
  if (!device.serial?.trim()) {
    deviceDataScore -= 20;
    deviceDataReasons.push("Seriennummer fehlt.");
  }

  // 2) UDI Integrity
  let udiScore = 100;
  const udiReasons: string[] = [];
  if (!device.udiDi?.trim()) {
    udiScore -= 25;
    udiReasons.push("UDI-DI fehlt.");
  } else if (!/^TH-DI-\d{6}$/.test(device.udiDi)) {
    udiScore -= 12;
    udiReasons.push("UDI-DI-Format ist unklar.");
  }
  if (!device.udiPi?.trim()) {
    udiScore -= 20;
    udiReasons.push("UDI-PI fehlt.");
  }
  if (!device.udiHash?.trim()) {
    udiScore -= 20;
    udiReasons.push("UDI-Hash fehlt.");
  }
  if (device.serial && !/^TH-SN-\d{6}-\d{3}$/.test(device.serial)) {
    udiScore -= 10;
    udiReasons.push("Seriennummer-Format ist unklar.");
  }
  if (device.serial && allDevices.filter((d) => d.serial === device.serial).length > 1) {
    udiScore -= 15;
    udiReasons.push("Doppelte Seriennummer erkannt.");
  }
  if (device.batch && !/^\d{6}$/.test(device.batch)) {
    udiScore -= 8;
    udiReasons.push("Charge hat kein erwartetes Format.");
  }

  // 3) Documentation
  const requiredDocTypes = getRequiredDocTypesForCategory(
    device.genericDeviceGroup || inferDeviceType(device.name || "")
  );
  const presentRequiredTypes = requiredDocTypes.filter((requiredType) =>
    deviceDocs.some((doc) => detectDocType(doc) === requiredType)
  );
  const approvedRequiredTypes = requiredDocTypes.filter((requiredType) =>
    deviceDocs.some((doc) => detectDocType(doc) === requiredType && isDocApproved(doc))
  );
  const missingRequiredTypes = requiredDocTypes.filter(
    (requiredType) => !presentRequiredTypes.includes(requiredType)
  );
  const unapprovedRequiredCount =
    presentRequiredTypes.length - approvedRequiredTypes.length;

  let documentationScore = 100;
  const documentationReasons: string[] = [];
  documentationScore -= missingRequiredTypes.length * 15;
  documentationScore -= Math.max(0, unapprovedRequiredCount) * 6;
  if (missingRequiredTypes.length > 0) {
    documentationReasons.push(
      `Fehlende Pflichtdokumente: ${missingRequiredTypes
        .map((type) => getDocTypeLabel(type))
        .join(", ")}.`
    );
  }
  if (unapprovedRequiredCount > 0) {
    documentationReasons.push(
      `${unapprovedRequiredCount} Pflichtdokument(e) sind noch nicht freigegeben.`
    );
  }

  // 4) Risk Management
  let riskManagementScore = 100;
  const riskManagementReasons: string[] = [];
  const hasRiskManagementFile = deviceDocs.some(
    (doc) => detectDocType(doc) === "risk_management_file"
  );
  if (!device.riskClass?.trim()) {
    riskManagementScore -= 25;
    riskManagementReasons.push("Risikoklasse fehlt.");
  }
  if (!hasRiskManagementFile) {
    riskManagementScore -= 30;
    riskManagementReasons.push("Risk Management File fehlt.");
  }
  if (device.status === "blocked") {
    riskManagementScore -= 20;
    riskManagementReasons.push("Gerät in Quarantäne-Status.");
  }
  if (device.status === "recall") {
    riskManagementScore -= 35;
    riskManagementReasons.push("Gerät im Recall-Status.");
  }
  if (
    device.nonconformitySeverity === "kritisch" &&
    !device.nonconformityAction?.trim()
  ) {
    riskManagementScore -= 12;
    riskManagementReasons.push("Kritische Abweichung ohne dokumentierte Maßnahme.");
  }

  // 5) Governance
  let governanceScore = 100;
  const governanceReasons: string[] = [];
  if (!device.validationStatus?.trim()) {
    governanceScore -= 20;
    governanceReasons.push("Validierungsstatus nicht gepflegt.");
  }
  if (!device.dmrId?.trim()) {
    governanceScore -= 15;
    governanceReasons.push("DMR-ID fehlt.");
  }
  if (!device.dhrId?.trim()) {
    governanceScore -= 15;
    governanceReasons.push("DHR-ID fehlt.");
  }
  if (deviceDocs.filter(isDocApproved).length === 0) {
    governanceScore -= 20;
    governanceReasons.push("Kein freigegebenes Dokument vorhanden.");
  }
  if (deviceAuditEntries.length === 0) {
    governanceScore -= 10;
    governanceReasons.push("Keine Audit-Aktivitäten protokolliert.");
  }

  const areas: ComplianceArea[] = [
    byKey("device_data", "Device Data", deviceDataScore, deviceDataReasons),
    byKey("udi_integrity", "UDI Integrity", udiScore, udiReasons),
    byKey("documentation", "Documentation", documentationScore, documentationReasons),
    byKey("risk_management", "Risk Management", riskManagementScore, riskManagementReasons),
    byKey("governance", "Governance", governanceScore, governanceReasons),
  ];

  const overall = Math.round(
    areas.reduce((sum, area) => sum + area.score, 0) / areas.length
  );

  return { overall, areas };
}

function computeDeviceComplianceScore(
  device: Device,
  deviceDocs: Doc[],
  allDevices: Device[],
  deviceAuditEntries: AuditEntry[] = []
): number {
  return computeComplianceBreakdown(device, deviceDocs, allDevices, deviceAuditEntries).overall;
}

function buildAiInsightDraft(
  productName: string,
  riskClass: string,
  quantity: number,
  deviceDocs: Doc[]
): AiInsight {
  const deviceType = inferDeviceType(productName);
  const missingDocs = findMissingRequiredDocs(deviceDocs);
  const riskSignals: string[] = [];

  if (!riskClass) riskSignals.push("Risikoklasse fehlt");
  if (riskClass === "IIb" || riskClass === "III") riskSignals.push("Erhöhte regulatorische Anforderungen");
  if (quantity > 50) riskSignals.push("Große Charge benötigt enges Monitoring");
  if (missingDocs.length > 0) riskSignals.push("Dokumentlücken erkannt");

  const score = Math.max(0, Math.min(100, 92 - missingDocs.length * 8 - (riskSignals.length > 2 ? 8 : 0)));

  return {
    deviceType,
    riskSignals,
    missingDocs,
    recommendation:
      missingDocs.length > 0
        ? "Empfohlene Risikoanalyse starten und fehlende Dokumente ergänzen."
        : "FMEA-Draft erzeugen und Validierungsstatus pflegen.",
    complianceScore: score,
    documentStatus: missingDocs.length ? "Unvollständig" : "Vollständig",
  };
}

// ---------- Mapping DB <-> UI ----------

function mapDeviceRowToDevice(row: any): Device {
  return {
    id: row.id,
    name: row.name,
    udiDi: row.udi_di,
    basicUdiDi: row.basic_udi_di ?? "",
    serial: row.serial,
    udiHash: row.udi_hash,
    createdAt: row.created_at,
    manufacturerName: row.manufacturer_name ?? "",
    deviceVersionVariants: row.device_version_variants ?? "",
    deviceDescription: row.device_description ?? "",
    principleOfOperation: row.principle_of_operation ?? "",
    keyComponents: row.key_components ?? "",
    accessories: row.accessories ?? "",
    riskFileId: row.risk_file_id ?? "",
    fmeaId: row.fmea_id ?? "",
    hazardAnalysisRef: row.hazard_analysis_ref ?? "",
    ceStatus: row.ce_status ?? "",
    notifiedBody: row.notified_body ?? "",
    conformityRoute: row.conformity_route ?? "",
    clinicalEvaluationRef: row.clinical_evaluation_ref ?? "",
    gsprChecklistLink: row.gspr_checklist_link ?? "",
    batch: row.batch ?? "",
    productionDate: row.production_date ?? "",
    udiPi: row.udi_pi ?? "",
    status: (row.status || "released") as DeviceStatus,
    riskClass: row.risk_class ?? "",
    mdrClass: row.mdr_class ?? "",
    mdrRule: row.mdr_rule ?? "",
    intendedPurpose: row.intended_purpose ?? "",
    internalRiskLevel: row.internal_risk_level ?? "",
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
    genericDeviceGroup: row.generic_device_group ?? row.device_category ?? "",
  };
}

function mapDeviceToDb(device: Device | Partial<Device>): any {
  return {
    name: device.name,
    udi_di: device.udiDi,
    basic_udi_di: device.basicUdiDi ?? null,
    serial: device.serial,
    udi_hash: device.udiHash,
    created_at: device.createdAt,
    manufacturer_name: device.manufacturerName ?? null,
    device_version_variants: device.deviceVersionVariants ?? null,
    device_description: device.deviceDescription ?? null,
    principle_of_operation: device.principleOfOperation ?? null,
    key_components: device.keyComponents ?? null,
    accessories: device.accessories ?? null,
    risk_file_id: device.riskFileId ?? null,
    fmea_id: device.fmeaId ?? null,
    hazard_analysis_ref: device.hazardAnalysisRef ?? null,
    ce_status: device.ceStatus ?? null,
    notified_body: device.notifiedBody ?? null,
    conformity_route: device.conformityRoute ?? null,
    clinical_evaluation_ref: device.clinicalEvaluationRef ?? null,
    gspr_checklist_link: device.gsprChecklistLink ?? null,

    batch: device.batch ?? null,
    production_date: device.productionDate ?? null,
    udi_pi: device.udiPi ?? null,

    status: device.status,
    risk_class: device.riskClass ?? null,
    mdr_class: device.mdrClass ?? null,
    mdr_rule: device.mdrRule ?? null,
    intended_purpose: device.intendedPurpose ?? null,
    internal_risk_level: device.internalRiskLevel ?? null,
    block_comment: device.blockComment ?? null,
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
    generic_device_group: device.genericDeviceGroup ?? null,
    device_category: device.genericDeviceGroup ?? null,
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
    docType: (row.doc_type || "other") as DocType,
    version: row.version ?? "",
    revision: row.revision ?? "",
    docStatus: (row.doc_status || "Controlled") as DocStatus,
    approvedBy: row.approved_by ?? "",
    assignmentScope: (row.assignment_scope || "device") as DocAssignmentScope,
    assignedBatch: row.assigned_batch ?? "",
    assignedProductGroup: row.assigned_product_group ?? "",
    isMandatory: row.is_mandatory ?? false,
    purpose: row.purpose ?? "",
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
    doc_type: doc.docType ?? null,
    version: doc.version ?? null,
    revision: doc.revision ?? null,
    doc_status: doc.docStatus ?? null,
    approved_by: doc.approvedBy ?? null,
    assignment_scope: doc.assignmentScope ?? "device",
    assigned_batch: doc.assignedBatch ?? null,
    assigned_product_group: doc.assignedProductGroup ?? null,
    is_mandatory: doc.isMandatory ?? false,
    purpose: doc.purpose ?? null,
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
  const [newRiskClass, setNewRiskClass] = useState<string>("");
  const [newBasicUdiDi, setNewBasicUdiDi] = useState("");
  const [newManufacturerName, setNewManufacturerName] = useState("");
  const [newDeviceVersionVariants, setNewDeviceVersionVariants] = useState("");
  const [iuGenericDeviceGroup, setIuGenericDeviceGroup] = useState("");
  const [iuIntendedIndication, setIuIntendedIndication] = useState("");
  const [iuTargetPopulation, setIuTargetPopulation] = useState("");
  const [iuIntendedUser, setIuIntendedUser] = useState("Fachpersonal");
  const [iuUseEnvironment, setIuUseEnvironment] = useState("Klinik");
  const [iuContraindications, setIuContraindications] = useState("");
  const [iuLimitations, setIuLimitations] = useState("");
  const [newDeviceDescription, setNewDeviceDescription] = useState("");
  const [newPrincipleOfOperation, setNewPrincipleOfOperation] = useState("");
  const [newKeyComponents, setNewKeyComponents] = useState("");
  const [newAccessories, setNewAccessories] = useState("");
  const [newRiskFileId, setNewRiskFileId] = useState("");
  const [newFmeaId, setNewFmeaId] = useState("");
  const [newHazardAnalysisRef, setNewHazardAnalysisRef] = useState("");
  const [newCeStatus, setNewCeStatus] = useState("");
  const [newNotifiedBody, setNewNotifiedBody] = useState("");
  const [newConformityRoute, setNewConformityRoute] = useState("");
  const [newClinicalEvaluationRef, setNewClinicalEvaluationRef] = useState("");
  const [newGsprChecklistLink, setNewGsprChecklistLink] = useState("");
  const [iuReviewStatus, setIuReviewStatus] =
    useState<IntendedUseReviewStatus>("Draft");
  const [intendedUseDraftText, setIntendedUseDraftText] = useState("");
  const [intendedUseTouched, setIntendedUseTouched] = useState(false);
  const [iuMissingContext, setIuMissingContext] = useState<string[]>([]);
  const [iuRegulatoryWarnings, setIuRegulatoryWarnings] = useState<string[]>(
    []
  );
  const [iuAssumptions, setIuAssumptions] = useState<string[]>([]);
  const [iuInferredProductType, setIuInferredProductType] = useState<string | null>(null);
  const [iuInferenceConfidence, setIuInferenceConfidence] = useState<number | null>(null);
  const createdByLabel =
    (user as any)?.user_metadata?.full_name ?? user?.email ?? "—";

  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [docType, setDocType] = useState<DocType>("declaration_of_conformity");
  const [docVersion, setDocVersion] = useState("");
  const [docRevision, setDocRevision] = useState("");
  const [docStatus, setDocStatus] = useState<DocStatus>("Controlled");
  const [docApprovedBy, setDocApprovedBy] = useState("");
  const [docAssignmentScope, setDocAssignmentScope] =
    useState<DocAssignmentScope>("device");
  const [docIsMandatory, setDocIsMandatory] = useState(false);
  const [docPurpose, setDocPurpose] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [udiPiSearch, setUdiPiSearch] = useState("");
  const [isGroupPinned, setIsGroupPinned] = useState(false);
  const [aiFmeaDraft, setAiFmeaDraft] = useState<string | null>(null);
  const [aiDeviceSummary, setAiDeviceSummary] = useState<string | null>(null);
  const [aiAuditReport, setAiAuditReport] = useState<string | null>(null);
  const [aiComplianceAlertText, setAiComplianceAlertText] = useState<string | null>(null);
  const [aiInsightServer, setAiInsightServer] = useState<AiInsight | null>(null);
  const [aiIntendedUseServer, setAiIntendedUseServer] = useState<string | null>(null);
  const [aiBusyTask, setAiBusyTask] = useState<string | null>(null);
  const [aiCopilotInput, setAiCopilotInput] = useState("");
  const [aiChatHistory, setAiChatHistory] = useState<ChatEntry[]>([]);

  const applyMdrFieldSuggestions = () => {
    const inferred = inferDeviceType(newProductName || "Device");
    if (!newDeviceDescription.trim()) {
      setNewDeviceDescription(
        `${newProductName || "Das Produkt"} ist ein ${inferred} für die sichere Anwendung gemäß Zweckbestimmung.`
      );
    }
    if (!newPrincipleOfOperation.trim()) {
      setNewPrincipleOfOperation("Kontrollierter Gerätebetrieb gemäß IFU und spezifizierter Leistungsgrenzen.");
    }
    if (!newKeyComponents.trim()) {
      setNewKeyComponents("Steuereinheit, sicherheitsrelevante Komponenten, Schnittstellen.");
    }
    if (!newCeStatus.trim()) {
      setNewCeStatus("in Vorbereitung");
    }
    if (!newConformityRoute.trim()) {
      setNewConformityRoute("MDR 2017/745");
    }
    if (!newRiskFileId.trim()) {
      const slug = slugifyName(newProductName || "DEVICE").slice(0, 10);
      setNewRiskFileId(`RMF-${slug}`);
    }
    if (!newFmeaId.trim()) {
      const slug = slugifyName(newProductName || "DEVICE").slice(0, 10);
      setNewFmeaId(`FMEA-${slug}`);
    }
  };

  const aiRowSuggestions = useMemo(() => {
    const inferredType = inferDeviceType(newProductName || "Device");
    const inferredRiskClass = (() => {
      const text = `${newProductName} ${iuGenericDeviceGroup}`.toLowerCase();
      if (
        text.includes("implant") ||
        text.includes("schrittmacher") ||
        text.includes("pacemaker") ||
        text.includes("stent")
      ) {
        return "III";
      }
      if (text.includes("software") || text.includes("monitor")) return "IIa";
      if (text.includes("refrigerator") || text.includes("freez") || text.includes("kühl"))
        return "I";
      return "IIa";
    })();

    return {
      productName: newProductName.trim() || `${inferredType} ${new Date().getFullYear()}`,
      manufacturerName: newManufacturerName.trim() || "Muster MedTech GmbH",
      riskClass: newRiskClass.trim() || inferredRiskClass,
      genericDeviceGroup: iuGenericDeviceGroup.trim() || inferredType,
      intendedIndication:
        iuIntendedIndication.trim() ||
        `${newProductName || "Das Produkt"} dient der sicheren medizinischen Anwendung gemäß Zweckbestimmung.`,
      targetPopulation: iuTargetPopulation.trim() || "Erwachsene Patienten",
      intendedUser: iuIntendedUser.trim() || "Fachpersonal",
      useEnvironment: iuUseEnvironment.trim() || "Klinik",
      contraindications:
        iuContraindications.trim() ||
        "Nicht anwenden bei ungeeigneter Indikation oder außerhalb der spezifizierten Umgebung.",
      warningsAndLimitations:
        iuLimitations.trim() ||
        "Nur durch geschultes Personal verwenden. Sicherheits- und IFU-Hinweise beachten.",
    };
  }, [
    newProductName,
    newManufacturerName,
    newRiskClass,
    iuGenericDeviceGroup,
    iuIntendedIndication,
    iuTargetPopulation,
    iuIntendedUser,
    iuUseEnvironment,
    iuContraindications,
    iuLimitations,
  ]);

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

  useEffect(() => {
    if (!user) return;
    const email = user.email ?? "";
    const fullName = (user as any)?.user_metadata?.full_name ?? "";
    if (email === "ajanth.r@live.de" && !fullName) {
      supabase.auth
        .updateUser({ data: { full_name: "Ajanth Ragunathan" } })
        .catch((err) => console.error("Auth metadata update failed:", err));
    }
  }, [user]);


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

  useEffect(() => {
    setAiComplianceAlertText(null);
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!newProductName.trim()) {
      setAiInsightServer(null);
      setAiIntendedUseServer(null);
      setIuMissingContext([]);
      setIuRegulatoryWarnings([]);
      setIuAssumptions([]);
      setIuInferredProductType(null);
      setIuInferenceConfidence(null);
      return;
    }

    const timer = setTimeout(async () => {
      const insight = await runAiTask<AiInsight>("device-insight", {
        productName: newProductName.trim(),
        riskClass: newRiskClass || "",
        quantity,
        basicUdiDi: newBasicUdiDi || "",
        manufacturer: newManufacturerName || "",
        genericDeviceGroup: iuGenericDeviceGroup || "",
        intendedIndication: iuIntendedIndication || "",
      });
      if (insight) setAiInsightServer(insight);

      const intended = await runAiTask<IntendedUseAiResult>("intended-use", {
        productName: newProductName.trim(),
        riskClass: newRiskClass || "",
        inferredDeviceType: inferDeviceType(newProductName),
        basicUdiDi: newBasicUdiDi || "",
        manufacturer: newManufacturerName || "",
        deviceVersionVariants: newDeviceVersionVariants || "",
        genericDeviceGroup: iuGenericDeviceGroup || "",
        intendedIndication: iuIntendedIndication || "",
        intendedPatientPopulation: iuTargetPopulation || "",
        intendedUsers: iuIntendedUser || "",
        intendedUseEnvironment: iuUseEnvironment || "",
        contraindications: iuContraindications || "",
        warningsAndLimitations: iuLimitations || "",
        deviceDescription: newDeviceDescription || "",
        principleOfOperation: newPrincipleOfOperation || "",
        keyComponents: newKeyComponents || "",
        accessories: newAccessories || "",
      });
      if (intended?.intendedUse) {
        setAiIntendedUseServer(intended.intendedUse);
        if (!intendedUseTouched) {
          setIntendedUseDraftText(intended.intendedUse);
        }
      }
      setIuInferredProductType(
        typeof intended?.inferredProductType === "string"
          ? intended.inferredProductType
          : null
      );
      setIuInferenceConfidence(
        typeof intended?.inferenceConfidence === "number"
          ? Math.max(0, Math.min(100, Math.round(intended.inferenceConfidence)))
          : null
      );
      setIuAssumptions(Array.isArray(intended?.assumptions) ? intended.assumptions : []);
      setIuMissingContext(Array.isArray(intended?.missingContext) ? intended.missingContext : []);
      setIuRegulatoryWarnings(
        Array.isArray(intended?.regulatoryWarnings) ? intended.regulatoryWarnings : []
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [
    newProductName,
    newRiskClass,
    quantity,
    newBasicUdiDi,
    newManufacturerName,
    newDeviceVersionVariants,
    iuGenericDeviceGroup,
    iuIntendedIndication,
    iuTargetPopulation,
    iuIntendedUser,
    iuUseEnvironment,
    iuContraindications,
    iuLimitations,
    newDeviceDescription,
    newPrincipleOfOperation,
    newKeyComponents,
    newAccessories,
    intendedUseTouched,
  ]);


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

  const runAiTask = async <T,>(task: string, payload: unknown): Promise<T | null> => {
    try {
      setAiBusyTask(task);
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, payload }),
      });

      const data = (await res.json()) as AiApiResponse<T>;
      if (!res.ok || !data?.result) {
        throw new Error(data?.error || "KI-Anfrage fehlgeschlagen.");
      }
      return data.result;
    } catch (err) {
      console.error(`AI task failed (${task}):`, err);
      const text = err instanceof Error ? err.message : "Unbekannter KI-Fehler";
      setMessage(`KI-Fehler (${task}): ${text}`);
      return null;
    } finally {
      setAiBusyTask((current) => (current === task ? null : current));
    }
  };

  const handleGenerateIntendedUseDraft = async () => {
    if (!newProductName.trim()) {
      setMessage("Bitte zuerst einen Produktnamen eingeben.");
      return;
    }

    const intended = await runAiTask<IntendedUseAiResult>("intended-use", {
      productName: newProductName.trim(),
      riskClass: newRiskClass || "",
      inferredDeviceType: inferDeviceType(newProductName),
      basicUdiDi: newBasicUdiDi || "",
      manufacturer: newManufacturerName || "",
      deviceVersionVariants: newDeviceVersionVariants || "",
      genericDeviceGroup: iuGenericDeviceGroup || "",
      intendedIndication: iuIntendedIndication || "",
      intendedPatientPopulation: iuTargetPopulation || "",
      intendedUsers: iuIntendedUser || "",
      intendedUseEnvironment: iuUseEnvironment || "",
      contraindications: iuContraindications || "",
      warningsAndLimitations: iuLimitations || "",
      deviceDescription: newDeviceDescription || "",
      principleOfOperation: newPrincipleOfOperation || "",
      keyComponents: newKeyComponents || "",
      accessories: newAccessories || "",
    });

    if (intended?.intendedUse?.trim()) {
      setAiIntendedUseServer(intended.intendedUse);
      setIntendedUseDraftText(intended.intendedUse);
      setIntendedUseTouched(false);
      setIuInferredProductType(
        typeof intended.inferredProductType === "string"
          ? intended.inferredProductType
          : null
      );
      setIuInferenceConfidence(
        typeof intended.inferenceConfidence === "number"
          ? Math.max(0, Math.min(100, Math.round(intended.inferenceConfidence)))
          : null
      );
      setIuAssumptions(Array.isArray(intended.assumptions) ? intended.assumptions : []);
      setIuMissingContext(
        Array.isArray(intended.missingContext) ? intended.missingContext : []
      );
      setIuRegulatoryWarnings(
        Array.isArray(intended.regulatoryWarnings) ? intended.regulatoryWarnings : []
      );
      if (intended.reviewStatusSuggestion === "Review") {
        setIuReviewStatus("Review");
      }
      return;
    }
    setMessage(
      "KI konnte keinen belastbaren Intended-Use-Draft erzeugen. Bitte Kontextfelder ergänzen und erneut generieren."
    );
  };

  const handleSendCopilotMessage = async () => {
    const userMessage = aiCopilotInput.trim();
    if (!userMessage) return;

    const userEntry: ChatEntry = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    setAiChatHistory((prev) => [...prev, userEntry]);
    setAiCopilotInput("");

    const ai = await runAiTask<AiChatResult>("copilot-chat", {
      message: userMessage,
      history: aiChatHistory.slice(-8).map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      selectedDevice: selectedDevice
        ? {
            name: selectedDevice.name,
            riskClass: selectedDevice.riskClass,
            status: selectedDevice.status,
            batch: selectedDevice.batch,
          }
        : null,
      appContext: {
        totalDevices: devices.length,
        totalDocs: docs.length,
      },
    });

    const assistantEntry: ChatEntry = {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        ai?.assistantReply?.trim() ||
        "Ich konnte gerade keine belastbare Antwort erzeugen. Bitte konkretisiere die Frage.",
      timestamp: new Date().toISOString(),
    };
    setAiChatHistory((prev) => [...prev, assistantEntry]);
  };

  // ---------- GERÄTE SPEICHERN ----------

  const handleSaveDevice = async () => {
    if (!newProductName.trim()) {
      setMessage("Bitte einen Produktnamen eingeben.");
      return;
    }
    if (!newManufacturerName.trim()) {
      setMessage("Bitte den Hersteller angeben.");
      return;
    }
    if (!newRiskClass.trim()) {
      setMessage("Bitte die Risikoklasse angeben.");
      return;
    }
    if (!iuGenericDeviceGroup.trim()) {
      setMessage("Bitte die generische Gerätegruppe angeben (MDR).");
      return;
    }
    if (!iuIntendedIndication.trim()) {
      setMessage("Bitte die Zweckbestimmung (Intended Purpose) angeben.");
      return;
    }
    if (!activeIntendedUseDraft.trim()) {
      setMessage("Bitte zuerst eine konkrete Zweckbestimmung generieren oder manuell ausfüllen.");
      return;
    }
    if (!iuTargetPopulation.trim()) {
      setMessage("Bitte die vorgesehene Patientenpopulation angeben.");
      return;
    }
    if (!iuIntendedUser.trim()) {
      setMessage("Bitte den vorgesehenen Anwender angeben.");
      return;
    }
    if (!iuUseEnvironment.trim()) {
      setMessage("Bitte die Nutzungsumgebung angeben.");
      return;
    }
    if (!iuContraindications.trim()) {
      setMessage("Bitte die Kontraindikationen angeben.");
      return;
    }
    if (!iuLimitations.trim()) {
      setMessage("Bitte Warnhinweise / Vorsichtsmaßnahmen angeben.");
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
    const autoBasicUdiDi = generateBasicUdiDi(newManufacturerName, newProductName);
    const resolvedBasicUdiDi = newBasicUdiDi.trim() || autoBasicUdiDi;

    const devicesSameBatch = devices.filter((d) => d.batch === batch);
    const existingInBatch = devicesSameBatch.length;
    const startDeviceIndex = devices.length;
    const nameSlug = slugifyName(newProductName);
    const dmrIdForBatch = `DMR-${batch}-${nameSlug}`;
    const intendedUseDraft = activeIntendedUseDraft;

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
        basicUdiDi: resolvedBasicUdiDi,
        serial: generatedSerial,
        udiHash,
        createdAt: new Date().toISOString(),
        manufacturerName: newManufacturerName.trim(),
        deviceVersionVariants: newDeviceVersionVariants.trim(),
        deviceDescription: newDeviceDescription.trim(),
        principleOfOperation: newPrincipleOfOperation.trim(),
        keyComponents: newKeyComponents.trim(),
        accessories: newAccessories.trim(),
        riskFileId: newRiskFileId.trim(),
        fmeaId: newFmeaId.trim(),
        hazardAnalysisRef: newHazardAnalysisRef.trim(),
        ceStatus: newCeStatus.trim(),
        notifiedBody: newNotifiedBody.trim(),
        conformityRoute: newConformityRoute.trim(),
        clinicalEvaluationRef: newClinicalEvaluationRef.trim(),
        gsprChecklistLink: newGsprChecklistLink.trim(),
        batch,
        productionDate,
        udiPi,
        status: "released",
        riskClass: newRiskClass,
        mdrClass: "",
        mdrRule: "",
        intendedPurpose: intendedUseDraft,
        internalRiskLevel: "",
        blockComment: "",
        responsible: "",
        isArchived: false,
        dmrId: dmrIdForBatch,
        dhrId,
        validationStatus: `IntendedUse-${iuReviewStatus}`,
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
        genericDeviceGroup: iuGenericDeviceGroup || inferDeviceType(newProductName),
      });
    }

    try {
      let { error } = await supabase.from("devices").insert(
        newDevices.map((d) => ({
          id: d.id,
          ...mapDeviceToDb(d),
        }))
      );

      if (
        error &&
        /(device_category|generic_device_group|basic_udi_di|manufacturer_name|device_version_variants|device_description|principle_of_operation|key_components|accessories|risk_file_id|fmea_id|hazard_analysis_ref|ce_status|notified_body|conformity_route|clinical_evaluation_ref|gspr_checklist_link)/i.test(
          error.message || ""
        )
      ) {
        const legacyPayload = newDevices.map((d) => ({
          id: d.id,
          name: d.name,
          udi_di: d.udiDi,
          serial: d.serial,
          udi_hash: d.udiHash,
          created_at: d.createdAt,
          batch: d.batch ?? null,
          production_date: d.productionDate ?? null,
          udi_pi: d.udiPi ?? null,
          status: d.status,
          risk_class: d.riskClass ?? null,
          mdr_class: d.mdrClass ?? null,
          mdr_rule: d.mdrRule ?? null,
          intended_purpose: d.intendedPurpose ?? null,
          internal_risk_level: d.internalRiskLevel ?? null,
          block_comment: d.blockComment ?? null,
          responsible: d.responsible ?? null,
          is_archived: d.isArchived ?? false,
          dmr_id: d.dmrId ?? null,
          dhr_id: d.dhrId ?? null,
          validation_status: d.validationStatus ?? null,
          archived_at: toNullableDateOrTimestamp(d.archivedAt),
          archive_reason: d.archiveReason ?? null,
          nonconformity_category: d.nonconformityCategory ?? null,
          nonconformity_severity: d.nonconformitySeverity ?? null,
          nonconformity_action: d.nonconformityAction ?? null,
          nonconformity_responsible: d.nonconformityResponsible ?? null,
          nonconformity_id: d.nonconformityId ?? null,
          last_service_date: toNullableDateOrTimestamp(d.lastServiceDate),
          next_service_date: toNullableDateOrTimestamp(d.nextServiceDate),
          service_notes: d.serviceNotes ?? null,
          pms_notes: d.pmsNotes ?? null,
          generic_device_group: d.genericDeviceGroup ?? null,
          device_category: d.genericDeviceGroup ?? null,
        }));
        const retry = await supabase.from("devices").insert(legacyPayload);
        error = retry.error ?? null;
      }

      if (error) {
        console.error("Supabase Devices Insert Error:", error);
        setMessage("Fehler beim Speichern in Supabase: " + error.message);
        return;
      }

      setDevices((prev) => [...newDevices, ...prev]);

      setNewProductName("");
      setQuantity(1);
      setNewRiskClass("");
      setNewBasicUdiDi("");
      setNewManufacturerName("");
      setNewDeviceVersionVariants("");
      setIuGenericDeviceGroup("");
      setIuIntendedIndication("");
      setIuTargetPopulation("");
      setIuIntendedUser("Fachpersonal");
      setIuUseEnvironment("Klinik");
      setIuContraindications("");
      setIuLimitations("");
      setNewDeviceDescription("");
      setNewPrincipleOfOperation("");
      setNewKeyComponents("");
      setNewAccessories("");
      setNewRiskFileId("");
      setNewFmeaId("");
      setNewHazardAnalysisRef("");
      setNewCeStatus("");
      setNewNotifiedBody("");
      setNewConformityRoute("");
      setNewClinicalEvaluationRef("");
      setNewGsprChecklistLink("");
      setIuReviewStatus("Draft");
      setIntendedUseDraftText("");
      setIntendedUseTouched(false);
      setIuMissingContext([]);
      setIuRegulatoryWarnings([]);
      setIuAssumptions([]);
      setIuInferredProductType(null);
      setIuInferenceConfidence(null);
      setAiIntendedUseServer(null);
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

  const handleGenerateFmeaDraft = async () => {
    if (!newProductName.trim()) {
      setMessage("Bitte zuerst einen Produktnamen eingeben.");
      return;
    }

    const ai = await runAiTask<{ draft?: string }>("fmea-draft", {
      productName: newProductName.trim(),
      riskClass: newRiskClass || "nicht gesetzt",
      deviceType: inferDeviceType(newProductName),
    });

    if (ai?.draft?.trim()) {
      setAiFmeaDraft(ai.draft);
      return;
    }

    const fallbackDraft = [
      `FMEA Draft für ${newProductName.trim()} (${inferDeviceType(newProductName)}, Klasse ${
        newRiskClass || "nicht gesetzt"
      })`,
      "",
      "1) Failure Mode: Leistungsverlust / Funktionsausfall",
      "   Ursache: Komponentendrift, Verschleiß, Softwarefehler",
      "   Maßnahme: Eingangstest + Burn-In + Inprozess-Monitoring",
      "",
      "2) Failure Mode: Falsche Anzeige / Bedienfehler",
      "   Ursache: UI-Unklarheit, Kalibrierabweichung",
      "   Maßnahme: IFU-Update, Usability-Test, Plausibilitätsprüfungen",
      "",
      "3) Failure Mode: Dokumentationslücke",
      "   Ursache: Fehlende Freigabe / fehlende Pflichtdokumente",
      "   Maßnahme: CAPA-Task, Dokumentenlenkung, QA-Review",
    ].join("\n");
    setAiFmeaDraft(fallbackDraft);
  };

  const handleGenerateDeviceSummary = async () => {
    if (!selectedDevice) {
      setMessage("Bitte zuerst ein Gerät auswählen.");
      return;
    }

    const ai = await runAiTask<{ summary?: string }>("device-summary", {
      device: selectedDevice,
      missingDocs: selectedMissingDocs,
      complianceScore: selectedComplianceScore ?? 0,
      docsCount: selectedDeviceDocs.length,
    });

    if (ai?.summary?.trim()) {
      setAiDeviceSummary(ai.summary);
      return;
    }

    setAiDeviceSummary(
      [
        `Device Summary: ${selectedDevice.name}`,
        `Zweckbestimmung: ${selectedDevice.intendedPurpose || "Nicht gepflegt"}`,
        `Risikoübersicht: Klasse ${selectedDevice.riskClass || "–"}, Status ${
          DEVICE_STATUS_LABELS[selectedDevice.status]
        }`,
        `Dokumentstatus: ${
          selectedMissingDocs.length
            ? `Unvollständig (${selectedMissingDocs.join(", ")})`
            : "Vollständig"
        }`,
        `Compliance Score: ${selectedComplianceScore ?? 0}%`,
      ].join("\n")
    );
  };

  const handlePrepareAuditReport = async () => {
    const scopeDevices = selectedDevice
      ? devices.filter((d) => d.name === selectedDevice.name && d.batch === selectedDevice.batch)
      : devices;
    const scopeIds = new Set(scopeDevices.map((d) => d.id));
    const scopeDocs = docs.filter((d) => scopeIds.has(d.deviceId));
    const scopeAudit = audit.filter((a) => !a.deviceId || scopeIds.has(a.deviceId));

    const ai = await runAiTask<{ report?: string }>("audit-report", {
      selectedDevice: selectedDevice
        ? {
            id: selectedDevice.id,
            name: selectedDevice.name,
            batch: selectedDevice.batch,
          }
        : null,
      totalDevicesInScope: scopeDevices.length,
      totalDocsInScope: scopeDocs.length,
      riskOrRecallCount: scopeDevices.filter(
        (d) => d.status === "blocked" || d.status === "recall"
      ).length,
      activitiesCount: scopeAudit.length,
    });

    if (ai?.report?.trim()) {
      setAiAuditReport(ai.report);
      return;
    }

    setAiAuditReport(
      [
        "Audit Preparation Report",
        `Erstellt am: ${new Date().toLocaleString()}`,
        `Geräte im Scope: ${scopeDevices.length}`,
        `Dokumente im Scope: ${scopeDocs.length}`,
        `Risiko-/Recall-Fälle: ${
          scopeDevices.filter((d) => d.status === "blocked" || d.status === "recall").length
        }`,
        `Änderungen/Aktivitäten: ${scopeAudit.length}`,
      ].join("\n")
    );
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
    if (!docPurpose.trim()) {
      setMessage("Bitte das Ziel/Zweck des Dokuments angeben.");
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
        docType,
        version: docVersion || "",
        revision: docRevision || "",
        docStatus: docStatus || "Controlled",
        approvedBy: docApprovedBy || "",
        assignmentScope: docAssignmentScope,
        assignedBatch:
          docAssignmentScope === "batch"
            ? selectedDevice?.batch || ""
            : "",
        assignedProductGroup:
          docAssignmentScope === "product_group"
            ? selectedDevice?.name || ""
            : "",
        isMandatory: docIsMandatory,
        purpose: docPurpose || "",
      };

      let metadataPersisted = true;
      let { error } = await supabase.from("docs").insert({
        id: newDoc.id,
        ...mapDocToDb(newDoc),
      });

      // Fallback für ältere DB-Schemata ohne neue Dokument-Metadaten
      if (
        error &&
        /doc_type|assignment_scope|assigned_batch|assigned_product_group|is_mandatory|purpose/i.test(
          error.message || ""
        )
      ) {
        const legacyPayload = {
          id: newDoc.id,
          device_id: newDoc.deviceId,
          name: newDoc.name,
          cid: newDoc.cid,
          url: newDoc.url,
          created_at: newDoc.createdAt,
          category: newDoc.category ?? null,
          version: newDoc.version ?? null,
          revision: newDoc.revision ?? null,
          doc_status: newDoc.docStatus ?? null,
          approved_by: newDoc.approvedBy ?? null,
        };
        const retry = await supabase.from("docs").insert(legacyPayload);
        error = retry.error ?? null;
        if (!error) {
          metadataPersisted = false;
          setMessage(
            "Dokument gespeichert. Hinweis: Neue Dokument-Metadaten werden erst nach DB-Migration persistiert."
          );
        }
      }

      if (error) {
        console.error("Supabase Docs Insert Error:", error);
        setMessage(
          "Fehler beim Speichern des Dokuments in Supabase: " + error.message
        );
        return;
      }

      setDocs((prev) => [newDoc, ...prev]);

      setDocName("");
      setDocType("declaration_of_conformity");
      setDocVersion("");
      setDocRevision("");
      setDocApprovedBy("");
      setDocPurpose("");
      setDocIsMandatory(false);
      setDocAssignmentScope("device");
      setFile(null);
      if (metadataPersisted) {
        setMessage("Dokument erfolgreich gespeichert.");
      }

      const docsForAi = [
        newDoc,
        ...docs.filter((d) => d.deviceId === selectedDeviceId),
      ];
      const compliance = await runAiTask<{
        missingDocs?: string[];
        alertText?: string;
      }>("compliance-alert", {
        device: devices.find((d) => d.id === selectedDeviceId) || null,
        docs: docsForAi.map((d) => ({
          name: d.name,
          category: d.category,
          docStatus: d.docStatus,
        })),
      });
      if (compliance?.alertText) {
        setAiComplianceAlertText(compliance.alertText);
      }

      const shortCid = String(newDoc.cid).slice(0, 10);

      addAuditEntry(
        selectedDeviceId,
        "document_uploaded",
        `Dokument "${newDoc.name}" (${newDoc.category || "ohne Kategorie"}, Version: ${
          newDoc.version || "-"
        }, Revision: ${newDoc.revision || "-"}, Status: ${
          newDoc.docStatus
        }, Scope: ${newDoc.assignmentScope || "device"}, Pflicht: ${
          newDoc.isMandatory ? "ja" : "nein"
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
    ? (() => {
        const device = devices.find((d) => d.id === selectedDeviceId);
        if (!device) return docs.filter((d) => d.deviceId === selectedDeviceId);
        return docs.filter((d) => {
          if (d.deviceId === selectedDeviceId) return true;
          if (d.assignmentScope === "batch" && d.assignedBatch && d.assignedBatch === device.batch) {
            return true;
          }
          if (
            d.assignmentScope === "product_group" &&
            d.assignedProductGroup &&
            d.assignedProductGroup === device.name
          ) {
            return true;
          }
          return false;
        });
      })()
    : [];

  const auditForView = selectedDeviceId
    ? audit.filter((a) => a.deviceId === selectedDeviceId)
    : audit;

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const aiSearchMode = (() => {
    if (!normalizedSearchTerm) return "default" as const;
    if (
      normalizedSearchTerm.includes("ohne risikoanalyse") ||
      normalizedSearchTerm.includes("without risk analysis")
    ) {
      return "without-risk-analysis" as const;
    }
    if (
      normalizedSearchTerm.includes("fehlende dokumente") ||
      normalizedSearchTerm.includes("mit fehlenden dokumenten") ||
      normalizedSearchTerm.includes("missing document")
    ) {
      return "missing-docs" as const;
    }
    return "default" as const;
  })();

  const filteredDevices = devices.filter((device) => {
    if (device.isArchived) return false;
    if (!normalizedSearchTerm) return true;

    if (aiSearchMode === "without-risk-analysis") {
      const docsForCurrent = docs.filter((d) => d.deviceId === device.id);
      const hasRiskDocument = docsForCurrent.some((d) =>
        `${d.name || ""} ${d.category || ""}`.toLowerCase().includes("risiko")
      );
      return !hasRiskDocument;
    }

    if (aiSearchMode === "missing-docs") {
      const docsForCurrent = docs.filter((d) => d.deviceId === device.id);
      return findMissingRequiredDocs(docsForCurrent).length > 0;
    }

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

    return haystack.includes(normalizedSearchTerm);
  });

  const selectedDevice = selectedDeviceId
    ? devices.find((d) => d.id === selectedDeviceId) || null
    : null;

  const aiInsight = buildAiInsightDraft(newProductName, newRiskClass, quantity, []);
  const activeAiInsight = aiInsightServer ?? aiInsight;
  const activeIntendedUseDraft = intendedUseDraftText || aiIntendedUseServer || "";
  const selectedDeviceDocs = selectedDevice
    ? docs.filter((d) => {
        if (d.deviceId === selectedDevice.id) return true;
        if (d.assignmentScope === "batch" && d.assignedBatch && d.assignedBatch === selectedDevice.batch) {
          return true;
        }
        if (
          d.assignmentScope === "product_group" &&
          d.assignedProductGroup &&
          d.assignedProductGroup === selectedDevice.name
        ) {
          return true;
        }
        return false;
      })
    : [];
  const selectedMissingDocs = selectedDevice
    ? findMissingRequiredDocs(selectedDeviceDocs)
    : [];
  const selectedValidationWarnings = selectedDevice
    ? getDeviceValidationWarnings(selectedDevice, devices)
    : [];
  const selectedDeviceAuditEntries = selectedDevice
    ? audit.filter((entry) => entry.deviceId === selectedDevice.id)
    : [];
  const selectedComplianceBreakdown = selectedDevice
    ? computeComplianceBreakdown(
        selectedDevice,
        selectedDeviceDocs,
        devices,
        selectedDeviceAuditEntries
      )
    : null;
  const selectedComplianceScore = selectedDevice
    ? selectedComplianceBreakdown?.overall ?? 0
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

  const getDocsForGroup = (groupDevices: Device[]): Doc[] => {
    if (!groupDevices.length) return [];
    const deviceIds = new Set(groupDevices.map((d) => d.id));
    const groupName = groupDevices[0]?.name ?? "";
    const groupBatch = groupDevices[0]?.batch ?? "";

    const relevant = docs.filter((doc) => {
      if (deviceIds.has(doc.deviceId)) return true;
      if (doc.assignmentScope === "batch" && groupBatch && doc.assignedBatch === groupBatch) {
        return true;
      }
      if (
        doc.assignmentScope === "product_group" &&
        groupName &&
        doc.assignedProductGroup === groupName
      ) {
        return true;
      }
      return false;
    });

    const seen = new Set<string>();
    return relevant.filter((doc) => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    });
  };

  const getGroupDocumentHealth = (groupDevices: Device[]) => {
    const groupDocs = getDocsForGroup(groupDevices);
    const approvedCount = groupDocs.filter(isDocApproved).length;
    const inferredCategory =
      groupDevices[0]?.genericDeviceGroup ||
      (groupDevices[0] ? inferDeviceType(groupDevices[0].name) : "");
    const requiredDocTypes = getRequiredDocTypesForCategory(inferredCategory);
    const presentRequiredTypes = requiredDocTypes.filter((requiredType) =>
      groupDocs.some((doc) => detectDocType(doc) === requiredType)
    );
    const approvedRequiredTypes = requiredDocTypes.filter((requiredType) =>
      groupDocs.some((doc) => detectDocType(doc) === requiredType && isDocApproved(doc))
    );
    const missingRequiredTypes = requiredDocTypes.filter(
      (requiredType) => !presentRequiredTypes.includes(requiredType)
    );
    const presentRequired = presentRequiredTypes.map((docType) => getDocTypeLabel(docType));
    const missingRequired = missingRequiredTypes.map((docType) => getDocTypeLabel(docType));

    const mandatoryDocs = groupDocs.filter((doc) => doc.isMandatory);
    const mandatoryApproved = mandatoryDocs.filter(isDocApproved).length;
    const mandatoryOpen = Math.max(0, mandatoryDocs.length - mandatoryApproved);

    return {
      inferredCategory,
      groupDocs,
      approvedCount,
      requiredTotal: requiredDocTypes.length,
      requiredPresentCount: presentRequiredTypes.length,
      requiredApprovedCount: approvedRequiredTypes.length,
      missingRequired,
      presentRequired,
      mandatoryDocs,
      mandatoryApproved,
      mandatoryOpen,
    };
  };

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
  const selectedGroupDocHealth = selectedDevice
    ? getGroupDocumentHealth(
        devices.filter((d) => d.name === selectedDevice.name && d.batch === selectedDevice.batch)
      )
    : null;
  const recallSignals = selectedDevice
    ? (() => {
        const sameBatch = devices.filter((d) => d.batch === selectedDevice.batch);
        const recallCount = sameBatch.filter((d) => d.status === "recall").length;
        const blockedCount = sameBatch.filter((d) => d.status === "blocked").length;
        const serviceIssues = sameBatch.filter((d) =>
          (d.serviceNotes || "").toLowerCase().includes("fehler")
        ).length;
        const signals: string[] = [];
        if (recallCount >= 2) signals.push("Mehrere Recall-Fälle in derselben Charge");
        if (blockedCount >= 2) signals.push("Gehäufte Quarantänefälle erkannt");
        if (serviceIssues >= 2) signals.push("Mehrere Service-Fehlermeldungen in der Charge");
        return signals;
      })()
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

        <div className="logo-glide flex flex-wrap items-center justify-center gap-6 opacity-80">
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
      </div>
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

        {selectedDevice && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <h2 className="text-sm font-semibold">UDI Sidebar (wie früher)</h2>
              <div className="text-[11px] text-slate-400">
                Schnellansicht für das ausgewählte Gerät
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                <div className="text-slate-400">UDI-DI</div>
                <div className="break-all text-slate-100">{selectedDevice.udiDi || "–"}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                <div className="text-slate-400">UDI-PI</div>
                <div className="break-all text-slate-100">{selectedDevice.udiPi || "–"}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                <div className="text-slate-400">UDI-Hash</div>
                <div className="break-all text-slate-100">{selectedDevice.udiHash || "–"}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                <div className="text-slate-400">Seriennummer</div>
                <div className="break-all text-slate-100">{selectedDevice.serial || "–"}</div>
              </div>
            </div>
          </section>
        )}

        {/* MedSafe GPT Copilot */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-semibold">MedSafe GPT Copilot</h2>
            <div className="text-xs text-slate-400">
              Chat, MDR-Hinweise und automatische QMS-Dokumententwürfe
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-3">
              <div className="text-xs text-slate-300 font-medium">Copilot Chat</div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2 text-xs">
                {aiChatHistory.length === 0 ? (
                  <div className="text-slate-400">
                    Stelle eine Frage wie: &quot;Welche MDR-Lücken hat dieses Gerät?&quot;
                  </div>
                ) : (
                  aiChatHistory.map((entry) => (
                    <div key={entry.id} className="space-y-1">
                      <div
                        className={
                          "font-medium " +
                          (entry.role === "user" ? "text-sky-300" : "text-emerald-300")
                        }
                      >
                        {entry.role === "user" ? "Du" : "MedSafe GPT"}
                      </div>
                      <div className="whitespace-pre-wrap text-slate-100">{entry.content}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  className="w-full min-h-[72px] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  placeholder="Frag MedSafe GPT nach Risiken, Dokumenten, Audit-Vorbereitung ..."
                  value={aiCopilotInput}
                  onChange={(e) => setAiCopilotInput(e.target.value)}
                />
                <button
                  onClick={handleSendCopilotMessage}
                  disabled={aiBusyTask === "copilot-chat"}
                  className="self-end rounded-lg border border-sky-500/60 bg-sky-900/30 px-4 py-2 text-sm font-medium hover:bg-sky-800/40 disabled:opacity-60"
                >
                  {aiBusyTask === "copilot-chat" ? "Sende…" : "Senden"}
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* Neue Geräte */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Neue Geräte anlegen</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <div>
              <input
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="Produktname (z.B. FREEZO FZ-380)"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.productName}
                onApply={() => setNewProductName(aiRowSuggestions.productName)}
              />
            </div>
            <div>
              <select
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                value={newRiskClass}
                onChange={(e) => setNewRiskClass(e.target.value)}
              >
                <option value="">Risikoklasse (I / IIa / IIb / III)</option>
                <option value="I">I</option>
                <option value="IIa">IIa</option>
                <option value="IIb">IIb</option>
                <option value="III">III</option>
              </select>
              <AiSuggestionHint
                suggestion={aiRowSuggestions.riskClass}
                onApply={() => setNewRiskClass(aiRowSuggestions.riskClass)}
              />
            </div>
            <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs border border-slate-700">
              <div className="text-slate-400">Angelegt von</div>
              <div className="text-slate-100 truncate">{createdByLabel}</div>
            </div>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <div>
              <input
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
                placeholder="Hersteller (Pflicht)"
                value={newManufacturerName}
                onChange={(e) => setNewManufacturerName(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.manufacturerName}
                onApply={() => setNewManufacturerName(aiRowSuggestions.manufacturerName)}
              />
            </div>
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Basic UDI-DI (optional, sonst Auto)"
              value={newBasicUdiDi}
              onChange={(e) => setNewBasicUdiDi(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Geräteversion / Varianten"
              value={newDeviceVersionVariants}
              onChange={(e) => setNewDeviceVersionVariants(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Device Description"
              value={newDeviceDescription}
              onChange={(e) => setNewDeviceDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-400">
              Wenn Basic UDI-DI leer bleibt, wird automatisch erzeugt:
              <span className="ml-1 text-slate-200">
                {generateBasicUdiDi(newManufacturerName, newProductName)}
              </span>
            </div>
            <button
              type="button"
              onClick={applyMdrFieldSuggestions}
              className="rounded-lg border border-violet-500/50 bg-violet-900/20 px-3 py-1.5 text-xs text-violet-100"
            >
              MDR-Vorschläge ausfüllen
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Principle of Operation"
              value={newPrincipleOfOperation}
              onChange={(e) => setNewPrincipleOfOperation(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Key Components"
              value={newKeyComponents}
              onChange={(e) => setNewKeyComponents(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              placeholder="Accessories"
              value={newAccessories}
              onChange={(e) => setNewAccessories(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <div>
              <input
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
                placeholder="Generische Gerätegruppe (z.B. Implantierbares Herzgerät, Refrigerator)"
                value={iuGenericDeviceGroup}
                onChange={(e) => setIuGenericDeviceGroup(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.genericDeviceGroup}
                onApply={() => setIuGenericDeviceGroup(aiRowSuggestions.genericDeviceGroup)}
              />
            </div>
            <div>
              <input
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
                placeholder="Vorgesehene Patientenpopulation"
                value={iuTargetPopulation}
                onChange={(e) => setIuTargetPopulation(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.targetPopulation}
                onApply={() => setIuTargetPopulation(aiRowSuggestions.targetPopulation)}
              />
            </div>
            <div>
            <select
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              value={iuIntendedUser}
              onChange={(e) => setIuIntendedUser(e.target.value)}
            >
                  <option value="Fachpersonal">Vorgesehener Anwender: Fachpersonal</option>
                  <option value="Geschultes Laborpersonal">Vorgesehener Anwender: Laborpersonal</option>
                  <option value="Patient / Laie">Vorgesehener Anwender: Patient / Laie</option>
                </select>
                <AiSuggestionHint
                  suggestion={aiRowSuggestions.intendedUser}
                  onApply={() => setIuIntendedUser(aiRowSuggestions.intendedUser)}
                />
            </div>
            <div>
                <select
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
                  value={iuUseEnvironment}
                  onChange={(e) => setIuUseEnvironment(e.target.value)}
                >
                  <option value="Klinik">Nutzungsumgebung: Klinik</option>
                  <option value="Labor">Nutzungsumgebung: Labor</option>
                  <option value="Homecare">Nutzungsumgebung: Homecare</option>
                  <option value="OP / sterile Umgebung">Nutzungsumgebung: OP / sterile Umgebung</option>
                </select>
                <AiSuggestionHint
                  suggestion={aiRowSuggestions.useEnvironment}
                  onApply={() => setIuUseEnvironment(aiRowSuggestions.useEnvironment)}
                />
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            <div>
              <textarea
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500 min-h-[78px]"
                placeholder="Zweckbestimmung / medizinische Indikation (Pflicht)"
                value={iuIntendedIndication}
                onChange={(e) => setIuIntendedIndication(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.intendedIndication}
                onApply={() => setIuIntendedIndication(aiRowSuggestions.intendedIndication)}
              />
            </div>
            <div>
              <textarea
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500 min-h-[78px]"
                placeholder="Kontraindikationen / Ausschlüsse (MDR Annex I, 23.4c)"
                value={iuContraindications}
                onChange={(e) => setIuContraindications(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.contraindications}
                onApply={() => setIuContraindications(aiRowSuggestions.contraindications)}
              />
            </div>
            <div>
              <textarea
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500 min-h-[78px]"
                placeholder="Warnhinweise, Vorsichtsmaßnahmen, Leistungsgrenzen"
                value={iuLimitations}
                onChange={(e) => setIuLimitations(e.target.value)}
              />
              <AiSuggestionHint
                suggestion={aiRowSuggestions.warningsAndLimitations}
                onApply={() => setIuLimitations(aiRowSuggestions.warningsAndLimitations)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              placeholder="Risk File ID (ISO 14971)"
              value={newRiskFileId}
              onChange={(e) => setNewRiskFileId(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              placeholder="FMEA ID"
              value={newFmeaId}
              onChange={(e) => setNewFmeaId(e.target.value)}
            />
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              placeholder="Hazard Analysis Referenz"
              value={newHazardAnalysisRef}
              onChange={(e) => setNewHazardAnalysisRef(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              value={newCeStatus}
              onChange={(e) => setNewCeStatus(e.target.value)}
            >
              <option value="">CE Status</option>
              <option value="in Vorbereitung">in Vorbereitung</option>
              <option value="CE beantragt">CE beantragt</option>
              <option value="CE erteilt">CE erteilt</option>
              <option value="CE eingeschränkt">CE eingeschränkt</option>
            </select>
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              placeholder="Notified Body"
              value={newNotifiedBody}
              onChange={(e) => setNewNotifiedBody(e.target.value)}
            />
            <select
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              value={newConformityRoute}
              onChange={(e) => setNewConformityRoute(e.target.value)}
            >
              <option value="">Conformity Route</option>
              <option value="MDR 2017/745 Annex IX">MDR 2017/745 Annex IX</option>
              <option value="MDR 2017/745 Annex X/XI">MDR 2017/745 Annex X/XI</option>
              <option value="MDR 2017/745 Article 52(7)">MDR 2017/745 Article 52(7)</option>
            </select>
            <input
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
              placeholder="Clinical Evaluation Referenz"
              value={newClinicalEvaluationRef}
              onChange={(e) => setNewClinicalEvaluationRef(e.target.value)}
            />
          </div>

          <input
            className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-violet-500"
            placeholder="GSPR Checklist Link"
            value={newGsprChecklistLink}
            onChange={(e) => setNewGsprChecklistLink(e.target.value)}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="xl:col-span-2 flex flex-wrap gap-2">
              <button
                onClick={handleGenerateIntendedUseDraft}
                disabled={aiBusyTask === "intended-use"}
                className="mt-2 inline-flex items-center rounded-lg border border-violet-500/60 bg-violet-900/30 hover:bg-violet-800/40 px-4 py-2 text-sm font-medium"
              >
                {aiBusyTask === "intended-use"
                  ? "Generating…"
                  : "Generate Purpose Draft (MDR)"}
              </button>
              <button
                onClick={handleSaveDevice}
                className="mt-2 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium"
              >
                Geräte speichern
              </button>
              <button
                onClick={handleGenerateFmeaDraft}
                disabled={aiBusyTask === "fmea-draft"}
                className="mt-2 inline-flex items-center rounded-lg border border-sky-500/60 bg-sky-900/30 hover:bg-sky-800/40 px-4 py-2 text-sm font-medium"
              >
                {aiBusyTask === "fmea-draft" ? "Generating…" : "Generate FMEA Draft"}
              </button>
              <select
                className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                value={iuReviewStatus}
                onChange={(e) =>
                  setIuReviewStatus(e.target.value as IntendedUseReviewStatus)
                }
              >
                <option value="Draft">Intended Use Status: Draft</option>
                <option value="Review">Intended Use Status: Review</option>
                <option value="Approved">Intended Use Status: Approved</option>
              </select>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 px-4 py-3 text-xs space-y-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
                AI Device Insight
              </div>
              {aiBusyTask === "device-insight" && (
                <div className="text-sky-300">Analyse läuft …</div>
              )}
              <div>Gerätetyp: <span className="text-sky-100">{activeAiInsight.deviceType}</span></div>
              <div>Dokumentstatus: <span className="text-sky-100">{activeAiInsight.documentStatus}</span></div>
              <div>Compliance Status: <span className="font-semibold text-emerald-300">{activeAiInsight.complianceScore}%</span></div>
              <div>
                Risiken:{" "}
                {activeAiInsight.riskSignals.length
                  ? activeAiInsight.riskSignals.join(", ")
                  : "Keine auffälligen Signale"}
              </div>
              <div className="text-amber-200">{activeAiInsight.recommendation}</div>
            </div>
          </div>

          {(activeIntendedUseDraft || iuMissingContext.length > 0 || iuRegulatoryWarnings.length > 0) && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 px-4 py-3 text-xs">
              <div className="text-[11px] uppercase tracking-[0.18em] text-violet-200 mb-1">
                Intended Use Draft (MDR Review)
              </div>
              {(iuInferredProductType || iuInferenceConfidence !== null) && (
                <div className="mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="rounded-lg border border-violet-500/30 bg-slate-900/60 px-3 py-2">
                    <div className="text-[11px] text-violet-200/80 mb-0.5">Inferred Product Type</div>
                    <div className="text-slate-100 font-medium">
                      {iuInferredProductType || "Nicht sicher bestimmbar"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-violet-500/30 bg-slate-900/60 px-3 py-2">
                    <div className="text-[11px] text-violet-200/80 mb-0.5">Inference Confidence</div>
                    <div className="text-slate-100 font-medium">
                      {iuInferenceConfidence !== null ? `${iuInferenceConfidence}%` : "–"}
                    </div>
                  </div>
                </div>
              )}
              {activeIntendedUseDraft ? (
                <textarea
                  className="w-full min-h-[130px] rounded-lg border border-violet-500/30 bg-slate-900/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-violet-400"
                  value={activeIntendedUseDraft}
                  onChange={(e) => {
                    setIntendedUseDraftText(e.target.value);
                    setIntendedUseTouched(true);
                  }}
                />
              ) : (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-amber-100">
                  Kein belastbarer Intended-Use-Text erzeugt. Bitte Kontextfelder präzisieren und erneut generieren.
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">Workflow:</span>
                <span className="rounded-full border border-violet-400/40 bg-violet-900/30 px-2 py-0.5 text-violet-200">
                  {iuReviewStatus}
                </span>
              </div>
              {iuAssumptions.length > 0 && (
                <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-950/20 px-3 py-2 text-sky-100">
                  <div className="mb-1 text-[11px] uppercase tracking-[0.16em]">
                    KI-Annahmen
                  </div>
                  <ul className="list-disc pl-4">
                    {iuAssumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </div>
              )}
              {iuMissingContext.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-amber-100">
                  <div className="mb-1 text-[11px] uppercase tracking-[0.16em]">
                    Fehlender Kontext
                  </div>
                  <ul className="list-disc pl-4">
                    {iuMissingContext.map((ctx) => (
                      <li key={ctx}>{ctx}</li>
                    ))}
                  </ul>
                </div>
              )}
              {iuRegulatoryWarnings.length > 0 && (
                <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-rose-100">
                  <div className="mb-1 text-[11px] uppercase tracking-[0.16em]">
                    Regulatory Warnings
                  </div>
                  <ul className="list-disc pl-4">
                    {iuRegulatoryWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {aiFmeaDraft && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/25 px-4 py-3 text-xs whitespace-pre-wrap">
              <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-200 mb-1">
                AI FMEA Draft
              </div>
              {aiFmeaDraft}
            </div>
          )}
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

          {aiSearchMode !== "default" && (
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/30 px-3 py-2 text-xs text-indigo-200">
              Intelligente Suche aktiv:{" "}
              {aiSearchMode === "without-risk-analysis"
                ? "zeige Geräte ohne Risikoanalyse"
                : "zeige Geräte mit fehlenden Dokumenten"}
            </div>
          )}

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
                const docHealth = getGroupDocumentHealth(devicesOfGroup);
                const docCountForGroup = docHealth.groupDocs.length;

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
                const complianceScore = computeDeviceComplianceScore(
                  device,
                  docHealth.groupDocs,
                  devices
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
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
                        <div className="rounded-lg border border-slate-600/60 bg-slate-800/60 px-2 py-1 text-slate-200">
                          Vorhanden: {docHealth.requiredPresentCount} / {docHealth.requiredTotal}
                        </div>
                        <div className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-2 py-1 text-emerald-200">
                          Freigegeben: {docHealth.requiredApprovedCount} / {docHealth.requiredTotal}
                        </div>
                        <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-2 py-1 text-amber-200">
                          Fehlend: {docHealth.missingRequired.length}
                        </div>
                      </div>
                      {docHealth.missingRequired.length > 0 && (
                        <div className="mt-1 text-[10px] text-amber-300">
                          Fehlende Pflichtdokumente: {docHealth.missingRequired.join(", ")}
                        </div>
                      )}
                      <div className="mt-2 inline-flex rounded-full border border-emerald-500/40 bg-emerald-900/20 px-2 py-0.5 text-[10px] text-emerald-200">
                        Device Compliance Score: {complianceScore}%
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
                const docHealth = getGroupDocumentHealth(devicesOfGroup);
                const docCountForGroup = docHealth.groupDocs.length;
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
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded-lg border border-slate-600/60 bg-slate-800/60 px-2 py-1 text-slate-200">
                        Vorhanden: {docHealth.requiredPresentCount} / {docHealth.requiredTotal}
                      </div>
                      <div className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-2 py-1 text-emerald-200">
                        Freigegeben: {docHealth.requiredApprovedCount} / {docHealth.requiredTotal}
                      </div>
                      <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-2 py-1 text-amber-200">
                        Fehlend: {docHealth.missingRequired.length}
                      </div>
                    </div>
                    {docHealth.missingRequired.length > 0 && (
                      <div className="mt-1 text-[10px] text-amber-300">
                        Fehlende Pflichtdokumente: {docHealth.missingRequired.join(", ")}
                      </div>
                    )}
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
                      Dokumente
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
                    const docCountForDevice = docs.filter(
                      (doc) => doc.deviceId === d.id
                    ).length;
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
                          <td className="py-1 pr-2">{docCountForDevice}</td>
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
                            <td colSpan={8} className="py-2">
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
                <button
                  onClick={handleGenerateDeviceSummary}
                  disabled={aiBusyTask === "device-summary"}
                  className="text-xs md:text-sm rounded-lg border border-cyan-500/60 px-3 py-2 bg-cyan-900/30 hover:bg-cyan-800/40"
                >
                  {aiBusyTask === "device-summary" ? "Generating…" : "Generate Device Summary"}
                </button>
                <button
                  onClick={handlePrepareAuditReport}
                  disabled={aiBusyTask === "audit-report"}
                  className="text-xs md:text-sm rounded-lg border border-indigo-500/60 px-3 py-2 bg-indigo-900/30 hover:bg-indigo-800/40"
                >
                  {aiBusyTask === "audit-report" ? "Preparing…" : "Prepare Audit Report"}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-xs">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200 mb-1">
                    Device Health Score
                  </div>
                  <div className="text-2xl font-semibold text-emerald-300">
                    {selectedComplianceScore ?? 0}%
                  </div>
                  {selectedMissingDocs.length > 0 && (
                    <div className="mt-1 text-amber-200">
                      Fehlt: {selectedMissingDocs.join(", ")}
                    </div>
                  )}
                </div>
                {recallSignals.length > 0 ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-rose-200 mb-1">
                      AI Risk Warning
                    </div>
                    <div className="text-rose-100">
                      Diese Charge könnte ein erhöhtes Ausfallrisiko haben.
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-rose-200/90">
                      {recallSignals.map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
                    AI Risk Warning: Keine auffällige Recall-Häufung in der Charge erkannt.
                  </div>
                )}
              </div>

              {selectedComplianceBreakdown && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                    Compliance Score Aufschlüsselung
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    {selectedComplianceBreakdown.areas.map((area) => (
                      <div
                        key={area.key}
                        className="rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-2"
                      >
                        <div className="text-slate-300 text-[10px]">{area.label}</div>
                        <div className="text-base font-semibold text-slate-100">
                          {area.score}%
                        </div>
                        {area.reasons.length > 0 && (
                          <div className="mt-1 text-[10px] text-amber-200">
                            {area.reasons[0]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedValidationWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-100">
                  <div className="text-[11px] uppercase tracking-[0.18em] mb-1">
                    KI-Fehlererkennung
                  </div>
                  <ul className="list-disc pl-4">
                    {selectedValidationWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">Produktname</div>
                  <div className="font-semibold">{selectedDevice.name || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Hersteller</div>
                  <div>{selectedDevice.manufacturerName || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Gerätekategorie</div>
                  <div>{selectedDevice.genericDeviceGroup || inferDeviceType(selectedDevice.name || "")}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Basic UDI-DI</div>
                  <div className="break-all">{selectedDevice.basicUdiDi || "–"}</div>
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
                  <div className="text-slate-400 text-xs">Geräteversion / Varianten</div>
                  <div>{selectedDevice.deviceVersionVariants || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Device Description</div>
                  <div>{selectedDevice.deviceDescription || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Principle of Operation</div>
                  <div>{selectedDevice.principleOfOperation || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Key Components</div>
                  <div>{selectedDevice.keyComponents || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Accessories</div>
                  <div>{selectedDevice.accessories || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Risk File ID</div>
                  <div>{selectedDevice.riskFileId || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">FMEA ID</div>
                  <div>{selectedDevice.fmeaId || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Hazard Analysis Referenz</div>
                  <div>{selectedDevice.hazardAnalysisRef || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">CE Status</div>
                  <div>{selectedDevice.ceStatus || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Notified Body</div>
                  <div>{selectedDevice.notifiedBody || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Conformity Route</div>
                  <div>{selectedDevice.conformityRoute || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Clinical Evaluation Referenz</div>
                  <div>{selectedDevice.clinicalEvaluationRef || "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">GSPR Checklist Link</div>
                  <div className="break-all">{selectedDevice.gsprChecklistLink || "–"}</div>
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

              {(aiDeviceSummary || aiAuditReport) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {aiDeviceSummary && (
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-4 py-3 whitespace-pre-wrap">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-200 mb-1">
                        AI Device Summary
                      </div>
                      {aiDeviceSummary}
                    </div>
                  )}
                  {aiAuditReport && (
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-4 py-3 whitespace-pre-wrap">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-indigo-200 mb-1">
                        Audit Preparation
                      </div>
                      {aiAuditReport}
                    </div>
                  )}
                </div>
              )}
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

          {selectedGroupDocHealth && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                Dokumentstatus Produkt-/Charge-Gruppe
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-600/60 bg-slate-800/60 px-2 py-1 text-slate-200">
                  Vorhanden: {selectedGroupDocHealth.requiredPresentCount} / {selectedGroupDocHealth.requiredTotal}
                </div>
                <div className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-2 py-1 text-emerald-200">
                  Freigegeben: {selectedGroupDocHealth.requiredApprovedCount} / {selectedGroupDocHealth.requiredTotal}
                </div>
                <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-2 py-1 text-amber-200">
                  Fehlend: {selectedGroupDocHealth.missingRequired.length}
                </div>
              </div>
              {selectedGroupDocHealth.missingRequired.length > 0 && (
                <div className="mt-2 text-amber-300">
                  Fehlende Pflichtdokumente: {selectedGroupDocHealth.missingRequired.join(", ")}
                </div>
              )}
            </div>
          )}

          {selectedDevice && (selectedMissingDocs.length > 0 || aiComplianceAlertText) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-100">
              <div className="text-[11px] uppercase tracking-[0.18em] mb-1">
                AI Compliance Alert
              </div>
              {aiBusyTask === "compliance-alert" && (
                <div className="mb-1">Analyse läuft …</div>
              )}
              {aiComplianceAlertText ? (
                <div>{aiComplianceAlertText}</div>
              ) : (
                <>
                  <div>Für dieses Gerät fehlen wahrscheinlich folgende Dokumente:</div>
                  <ul className="list-disc pl-4 mt-1">
                    {selectedMissingDocs.map((missing) => (
                      <li key={missing}>{missing}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mt-2">
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Dokumenttyp</div>
              <select
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mt-2">
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Zuordnung</div>
              <select
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                value={docAssignmentScope}
                onChange={(e) =>
                  setDocAssignmentScope(e.target.value as DocAssignmentScope)
                }
              >
                {DOC_ASSIGNMENT_SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {selectedDevice && docAssignmentScope !== "device" && (
                <div className="mt-1 text-[10px] text-slate-400">
                  {docAssignmentScope === "batch"
                    ? `Charge: ${selectedDevice.batch || "–"}`
                    : `Produktgruppe: ${selectedDevice.name || "–"}`}
                </div>
              )}
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Pflichtdokument</div>
              <select
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                value={docIsMandatory ? "yes" : "no"}
                onChange={(e) => setDocIsMandatory(e.target.value === "yes")}
              >
                <option value="no">Optional</option>
                <option value="yes">Pflicht</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="text-slate-400 text-[11px] mb-1">Ziel / Zweck des Dokuments</div>
              <input
                className="bg-slate-800 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-700 focus:border-emerald-500 w-full"
                placeholder="z.B. Nachweis der MDR-Konformität für Charge"
                value={docPurpose}
                onChange={(e) => setDocPurpose(e.target.value)}
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
                Dokumente für dieses Gerät / zugehörige Charge / Produktgruppe
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
                        Typ: {getDocTypeLabel(detectDocType(doc))} |{" "}
                        Version: {doc.version || "–"} | Revision: {doc.revision || "–"} |
                        Status: {doc.docStatus || "Controlled"} | Freigegeben von:{" "}
                        {doc.approvedBy || "–"}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Zuordnung: {doc.assignmentScope || "device"}{" "}
                        {doc.assignmentScope === "batch" && doc.assignedBatch
                          ? `(Charge ${doc.assignedBatch})`
                          : ""}
                        {doc.assignmentScope === "product_group" &&
                        doc.assignedProductGroup
                          ? `(Gruppe ${doc.assignedProductGroup})`
                          : ""}
                        {" | "}
                        Typ: {doc.isMandatory ? "Pflicht" : "Optional"}
                      </div>
                      {doc.purpose && (
                        <div className="text-[11px] text-slate-300 mt-1">
                          Ziel: {doc.purpose}
                        </div>
                      )}
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
