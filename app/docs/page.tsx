"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

type Device = {
  id: string;
  name: string;
  batch?: string;
  serial: string;
  deviceCategory?: string;
  isArchived?: boolean;
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

type GroupHealth = {
  requiredTotal: number;
  requiredPresent: number;
  requiredApproved: number;
  missingLabels: string[];
  docs: Doc[];
};

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
  { value: "other", label: "Sonstiges", patterns: [] },
];

const REQUIRED_DOC_TYPES: DocType[] = [
  "declaration_of_conformity",
  "ifu",
  "risk_management_file",
  "test_report",
  "labeling",
  "dmr_master_document",
];

const getDocTypeLabel = (docType: DocType) =>
  DOC_TYPE_OPTIONS.find((opt) => opt.value === docType)?.label || docType;

const detectDocType = (doc: Doc): DocType => {
  if (doc.docType && DOC_TYPE_OPTIONS.some((opt) => opt.value === doc.docType)) {
    return doc.docType;
  }
  const text = `${doc.name || ""} ${doc.category || ""}`.toLowerCase();
  const match = DOC_TYPE_OPTIONS.find(
    (opt) => opt.value !== "other" && opt.patterns.some((pattern) => text.includes(pattern))
  );
  return match?.value || "other";
};

const isDocApproved = (doc: Doc) => {
  const status = (doc.docStatus || "").toLowerCase();
  return (status === "final" || status === "controlled") && Boolean(doc.approvedBy?.trim());
};

const mapDevice = (row: any): Device => ({
  id: row.id,
  name: row.name,
  batch: row.batch ?? "",
  serial: row.serial ?? "",
  deviceCategory: row.device_category ?? "",
  isArchived: row.is_archived ?? false,
});

const mapDoc = (row: any): Doc => ({
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
});

export default function DocsPage() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [queryInitialized, setQueryInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    init();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const [{ data: deviceRows, error: devErr }, { data: docRows, error: docErr }] =
          await Promise.all([
            supabase.from("devices").select("*").order("created_at", { ascending: false }),
            supabase.from("docs").select("*").order("created_at", { ascending: false }),
          ]);

        if (devErr) throw devErr;
        if (docErr) throw docErr;

        setDevices((deviceRows || []).map(mapDevice));
        setDocs((docRows || []).map(mapDoc));
      } catch (err) {
        console.error(err);
        setMessage("Dokumentdaten konnten nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user]);

  const groupedDevices = useMemo(() => {
    const map: Record<string, Device> = {};
    for (const d of devices.filter((item) => !item.isArchived)) {
      const key = `${d.name}__${d.batch ?? ""}`;
      if (!map[key]) map[key] = d;
    }
    return Object.entries(map).map(([key, representative]) => ({
      key,
      label: `${representative.name} – Charge ${representative.batch || "–"}`,
      representative,
    }));
  }, [devices]);

  useEffect(() => {
    if (queryInitialized) return;
    if (groupedDevices.length === 0 && devices.length === 0) return;

    const groupParam = searchParams.get("group");
    const deviceParam = searchParams.get("device");

    if (groupParam) setSelectedGroupKey(groupParam);
    if (deviceParam) setSelectedDeviceId(deviceParam);
    setQueryInitialized(true);
  }, [groupedDevices, devices, searchParams, queryInitialized]);

  useEffect(() => {
    if (!selectedGroupKey && groupedDevices.length > 0) {
      setSelectedGroupKey(groupedDevices[0].key);
    }
  }, [groupedDevices, selectedGroupKey]);

  const selectedGroupDevices = useMemo(() => {
    if (!selectedGroupKey) return [];
    const [name, batch = ""] = selectedGroupKey.split("__");
    return devices.filter((d) => d.name === name && (d.batch || "") === batch);
  }, [devices, selectedGroupKey]);

  useEffect(() => {
    if (!selectedGroupDevices.length) {
      setSelectedDeviceId("");
      return;
    }
    const match = selectedGroupDevices.find((d) => d.id === selectedDeviceId);
    if (!match) setSelectedDeviceId(selectedGroupDevices[0].id);
  }, [selectedGroupDevices, selectedDeviceId]);

  const selectedDevice =
    selectedGroupDevices.find((d) => d.id === selectedDeviceId) || null;

  const docsForGroup = useMemo(() => {
    if (!selectedGroupDevices.length) return [];
    const ids = new Set(selectedGroupDevices.map((d) => d.id));
    const groupName = selectedGroupDevices[0]?.name ?? "";
    const groupBatch = selectedGroupDevices[0]?.batch ?? "";

    const relevant = docs.filter((doc) => {
      if (ids.has(doc.deviceId)) return true;
      if (doc.assignmentScope === "batch" && groupBatch && doc.assignedBatch === groupBatch)
        return true;
      if (
        doc.assignmentScope === "product_group" &&
        groupName &&
        doc.assignedProductGroup === groupName
      )
        return true;
      return false;
    });

    const seen = new Set<string>();
    return relevant.filter((doc) => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    });
  }, [docs, selectedGroupDevices]);

  const docsForDevice = useMemo(() => {
    if (!selectedDevice) return [];
    return docsForGroup.filter((doc) => {
      if (doc.deviceId === selectedDevice.id) return true;
      if (doc.assignmentScope === "batch" && doc.assignedBatch === selectedDevice.batch) return true;
      if (
        doc.assignmentScope === "product_group" &&
        doc.assignedProductGroup === selectedDevice.name
      )
        return true;
      return false;
    });
  }, [docsForGroup, selectedDevice]);

  const groupHealth: GroupHealth = useMemo(() => {
    const presentTypes = REQUIRED_DOC_TYPES.filter((requiredType) =>
      docsForGroup.some((doc) => detectDocType(doc) === requiredType)
    );
    const approvedTypes = REQUIRED_DOC_TYPES.filter((requiredType) =>
      docsForGroup.some((doc) => detectDocType(doc) === requiredType && isDocApproved(doc))
    );
    const missingTypes = REQUIRED_DOC_TYPES.filter((t) => !presentTypes.includes(t));
    return {
      requiredTotal: REQUIRED_DOC_TYPES.length,
      requiredPresent: presentTypes.length,
      requiredApproved: approvedTypes.length,
      missingLabels: missingTypes.map(getDocTypeLabel),
      docs: docsForGroup,
    };
  }, [docsForGroup]);

  if (!user) {
    return (
      <main className="min-h-[40vh] flex items-center justify-center text-slate-300">
        Bitte einloggen, um Dokumente zu sehen.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Dokumente Modul</h1>
              <div className="text-xs text-slate-400">
                Verbunden mit Geräteübersicht und Risikoanalyse.
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs hover:border-sky-500"
              >
                Zur Geräteübersicht
              </Link>
              {selectedGroupKey && (
                <Link
                  href={`/risk-analysis?scope=product_group&group=${encodeURIComponent(
                    selectedGroupKey
                  )}`}
                  className="rounded-lg border border-emerald-500/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-100"
                >
                  Risikoanalyse dieser Gruppe
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Geräte-Gruppe</div>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                value={selectedGroupKey}
                onChange={(e) => setSelectedGroupKey(e.target.value)}
              >
                {groupedDevices.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Gerät (Detailkontext)</div>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
              >
                {selectedGroupDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} – SN: {d.serial}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="text-sm font-semibold">Pflichtdokument-Matrix (Gruppe)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
              Vorhanden: {groupHealth.requiredPresent} / {groupHealth.requiredTotal}
            </div>
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-2 text-emerald-200">
              Freigegeben: {groupHealth.requiredApproved} / {groupHealth.requiredTotal}
            </div>
            <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-amber-200">
              Fehlend: {groupHealth.missingLabels.length}
            </div>
          </div>
          {groupHealth.missingLabels.length > 0 && (
            <div className="text-xs text-amber-300">
              Fehlende Pflichtdokumente: {groupHealth.missingLabels.join(", ")}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="text-sm font-semibold">Dokumente im gewählten Kontext</div>
          {isLoading ? (
            <div className="text-sm text-slate-400">Lade Dokumente …</div>
          ) : docsForDevice.length === 0 ? (
            <div className="text-sm text-slate-400">
              Keine Dokumente für dieses Gerät/Charge/Produktgruppe vorhanden.
            </div>
          ) : (
            <ul className="space-y-2">
              {docsForDevice.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs"
                >
                  <div className="font-medium text-sm">{doc.name}</div>
                  <div className="text-slate-400 mt-1">
                    Typ: {getDocTypeLabel(detectDocType(doc))} | Version: {doc.version || "–"} |
                    Revision: {doc.revision || "–"} | Status: {doc.docStatus || "Controlled"} |
                    Freigegeben von: {doc.approvedBy || "–"}
                  </div>
                  <div className="text-slate-400 mt-1">
                    Scope: {doc.assignmentScope || "device"} | Pflicht:{" "}
                    {doc.isMandatory ? "ja" : "nein"}
                  </div>
                  {doc.purpose && <div className="text-slate-300 mt-1">Ziel: {doc.purpose}</div>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] hover:border-sky-500"
                    >
                      Dokument öffnen
                    </a>
                    {selectedDevice && (
                      <Link
                        href={`/risk-analysis?scope=device&device=${encodeURIComponent(
                          selectedDevice.id
                        )}`}
                        className="rounded-md border border-emerald-500/40 bg-emerald-900/20 px-2 py-1 text-[11px] text-emerald-100"
                      >
                        Risikoanalyse für dieses Gerät
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {message && (
            <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs">
              {message}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
