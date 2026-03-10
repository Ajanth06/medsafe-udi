"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

type Device = {
  id: string;
  name: string;
  batch?: string;
  serial: string;
  genericDeviceGroup?: string;
  riskClass?: string;
  intendedPurpose?: string;
  udiDi?: string;
  udiPi?: string;
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

type AiDocDraftResult = {
  title?: string;
  documentType?: string;
  contentMarkdown?: string;
  checklist?: string[];
};

type UploadApiResponse = {
  cid?: string;
  url?: string;
  error?: string;
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
  genericDeviceGroup: row.generic_device_group ?? row.device_category ?? "",
  riskClass: row.risk_class ?? "",
  intendedPurpose: row.intended_purpose ?? "",
  udiDi: row.udi_di ?? "",
  udiPi: row.udi_pi ?? "",
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

const mapDocToDb = (doc: Doc) => ({
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
});

const copyToClipboard = (value: string) => {
  if (!value) return;
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
};

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const markdownToPlainText = (value: string) =>
  value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .trim();

const toExcelCsv = (title: string, draft: string, checklist: string[]) => {
  const rows = [
    ["Title", title || "QMS Draft"],
    ["CreatedAt", new Date().toISOString()],
    ["Draft", markdownToPlainText(draft).replace(/\n/g, " ")],
    ...checklist.map((item) => ["Checklist", item]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
};

const toWordHtml = (title: string, draft: string, checklist: string[]) => {
  const checklistHtml = checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title || "QMS Document Draft")}</title>
</head>
<body>
  <h1>${escapeHtml(title || "QMS Document Draft")}</h1>
  <pre>${escapeHtml(draft)}</pre>
  <h2>Checklist</h2>
  <ul>${checklistHtml}</ul>
</body>
</html>`;
};

const slugifyKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

export default function DocsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [queryInitialized, setQueryInitialized] = useState(false);
  const [initialQuery, setInitialQuery] = useState<{
    group: string;
    device: string;
  }>({ group: "", device: "" });
  const [aiDocType, setAiDocType] = useState("IFU");
  const [aiDocDraft, setAiDocDraft] = useState<AiDocDraftResult | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isAutoGeneratingMissing, setIsAutoGeneratingMissing] = useState(false);
  const [draftRevision, setDraftRevision] = useState("R1");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setInitialQuery({
      group: params.get("group") || "",
      device: params.get("device") || "",
    });
  }, []);

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

    const groupParam = initialQuery.group;
    const deviceParam = initialQuery.device;

    if (groupParam) setSelectedGroupKey(groupParam);
    if (deviceParam) setSelectedDeviceId(deviceParam);
    setQueryInitialized(true);
  }, [groupedDevices, devices, initialQuery, queryInitialized]);

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

  const missingRequiredTypes = useMemo(
    () =>
      REQUIRED_DOC_TYPES.filter(
        (requiredType) => !docsForGroup.some((doc) => detectDocType(doc) === requiredType)
      ),
    [docsForGroup]
  );

  const runAiDocumentDraft = async (payload: unknown) => {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "generate-qms-document",
        payload,
      }),
    });

    const raw = (await response.json()) as {
      error?: string;
      result?: AiDocDraftResult;
    };

    if (!response.ok) {
      throw new Error(raw.error || "KI-Fehler bei Dokumentgenerierung.");
    }

    const result = raw.result;
    if (!result?.contentMarkdown?.trim()) {
      throw new Error(
        "KI konnte keinen belastbaren Dokumententwurf erzeugen. Bitte Kontext ergänzen."
      );
    }
    return result;
  };

  const uploadMarkdownToDocsBucket = async (deviceId: string, filename: string, content: string) => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([content], filename, {
        type: "text/markdown;charset=utf-8",
      })
    );
    formData.append("deviceId", deviceId);

    const uploadResponse = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const uploadRaw = (await uploadResponse.json()) as UploadApiResponse;
    if (!uploadResponse.ok || !uploadRaw.cid || !uploadRaw.url) {
      throw new Error(uploadRaw.error || "Upload fehlgeschlagen.");
    }
    return { cid: uploadRaw.cid, url: uploadRaw.url };
  };

  const insertDocWithFallback = async (doc: Doc) => {
    let { error } = await supabase.from("docs").insert({
      id: doc.id,
      ...mapDocToDb(doc),
    });

    if (
      error &&
      /doc_type|assignment_scope|assigned_batch|assigned_product_group|is_mandatory|purpose/i.test(
        error.message || ""
      )
    ) {
      const legacyPayload = {
        id: doc.id,
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
      const retry = await supabase.from("docs").insert(legacyPayload);
      error = retry.error ?? null;
    }
    if (error) throw new Error(error.message || "Dokument-Metadaten konnten nicht gespeichert werden.");
  };

  const handleGenerateQmsDocumentDraft = async () => {
    if (!selectedDevice) {
      setMessage("Bitte zuerst ein Gerät auswählen.");
      return;
    }

    setIsGeneratingDraft(true);
    setMessage(null);

    const payload = {
      documentType: aiDocType,
      source: "docs-module",
      selectedDevice: {
        id: selectedDevice.id,
        name: selectedDevice.name,
        serial: selectedDevice.serial,
        batch: selectedDevice.batch,
        genericDeviceGroup: selectedDevice.genericDeviceGroup,
        riskClass: selectedDevice.riskClass,
        intendedPurpose: selectedDevice.intendedPurpose,
        udiDi: selectedDevice.udiDi,
        udiPi: selectedDevice.udiPi,
      },
      requiredDocuments: {
        total: groupHealth.requiredTotal,
        present: groupHealth.requiredPresent,
        approved: groupHealth.requiredApproved,
        missing: groupHealth.missingLabels,
      },
      availableDocuments: docsForDevice.map((doc) => ({
        name: doc.name,
        type: getDocTypeLabel(detectDocType(doc)),
        version: doc.version || "",
        revision: doc.revision || "",
        status: doc.docStatus || "",
        approvedBy: doc.approvedBy || "",
        mandatory: Boolean(doc.isMandatory),
      })),
    };

    try {
      const result = await runAiDocumentDraft(payload);
      setAiDocDraft(result);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unbekannter KI-Fehler.";
      setMessage(text);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleSaveDraftToSupabase = async () => {
    if (!user?.id) {
      setMessage("Bitte zuerst einloggen.");
      return;
    }
    if (!selectedDevice) {
      setMessage("Bitte zuerst ein Gerät auswählen.");
      return;
    }
    if (!aiDocDraft?.contentMarkdown?.trim()) {
      setMessage("Bitte zuerst einen Dokumententwurf generieren.");
      return;
    }

    setIsSavingDraft(true);
    setMessage(null);

    const title = aiDocDraft.title || aiDocType || "qms-draft";
    const safeTitle = slugifyKey(title) || "qms-draft";
    const keyParts = [
      slugifyKey(selectedDevice.name || "device"),
      slugifyKey(selectedDevice.batch || "nobatch"),
      slugifyKey(aiDocType || "document"),
    ].filter(Boolean);
    const documentKey = keyParts.join("__");
    const filename = `${safeTitle}.md`;

    const formData = new FormData();
    formData.append(
      "file",
      new File([aiDocDraft.contentMarkdown], filename, {
        type: "text/markdown;charset=utf-8",
      })
    );
    formData.append("documentKey", documentKey);
    formData.append("revision", draftRevision || "R1");
    formData.append("userId", user.id);

    try {
      const response = await fetch("/api/qms-documents", {
        method: "POST",
        body: formData,
      });

      const raw = (await response.json()) as {
        error?: string;
        doc?: { version?: number; revision?: string };
      };

      if (!response.ok) {
        throw new Error(raw.error || "Speichern in Supabase fehlgeschlagen.");
      }

      const now = new Date().toISOString();
      const upload = await uploadMarkdownToDocsBucket(
        selectedDevice.id,
        filename,
        aiDocDraft.contentMarkdown
      );

      const newDoc: Doc = {
        id: crypto.randomUUID(),
        deviceId: selectedDevice.id,
        name: title,
        cid: upload.cid,
        url: upload.url,
        createdAt: now,
        category: aiDocType,
        docType: "other",
        version: "1.0",
        revision: draftRevision || "R1",
        docStatus: "Draft",
        approvedBy: "",
        assignmentScope: "device",
        assignedBatch: "",
        assignedProductGroup: "",
        isMandatory: false,
        purpose: "KI-generierter QMS-Draft",
      };
      await insertDocWithFallback(newDoc);
      setDocs((prev) => [newDoc, ...prev]);

      setMessage(
        `Dokument gespeichert: ${documentKey} (Version ${raw.doc?.version ?? "?"}, Revision ${
          raw.doc?.revision || draftRevision || "R1"
        })`
      );
    } catch (err) {
      const text =
        err instanceof Error ? err.message : "Unerwarteter Fehler beim Speichern.";
      setMessage(text);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleAutoGenerateMissingDocuments = async () => {
    if (!selectedDevice) {
      setMessage("Bitte zuerst ein Gerät auswählen.");
      return;
    }
    if (missingRequiredTypes.length === 0) {
      setMessage("Keine fehlenden Pflichtdokumente vorhanden.");
      return;
    }

    setIsAutoGeneratingMissing(true);
    setMessage(null);

    const createdDocs: Doc[] = [];
    const failedTypes: string[] = [];

    for (const docType of missingRequiredTypes) {
      const docTypeLabel = getDocTypeLabel(docType);
      try {
        const draft = await runAiDocumentDraft({
          documentType: docTypeLabel,
          source: "docs-module-autogen-missing",
          selectedDevice: {
            id: selectedDevice.id,
            name: selectedDevice.name,
            serial: selectedDevice.serial,
            batch: selectedDevice.batch,
            genericDeviceGroup: selectedDevice.genericDeviceGroup,
            riskClass: selectedDevice.riskClass,
            intendedPurpose: selectedDevice.intendedPurpose,
            udiDi: selectedDevice.udiDi,
            udiPi: selectedDevice.udiPi,
          },
          requiredDocuments: {
            total: groupHealth.requiredTotal,
            present: groupHealth.requiredPresent,
            approved: groupHealth.requiredApproved,
            missing: groupHealth.missingLabels,
          },
          requestedDocType: docType,
        });

        const docTitle =
          draft.title?.trim() || `${docTypeLabel} – ${selectedDevice.name} – ${selectedDevice.batch || "nobatch"}`;
        const filename = `${slugifyKey(docTitle) || slugifyKey(docTypeLabel) || "document"}.md`;
        const upload = await uploadMarkdownToDocsBucket(
          selectedDevice.id,
          filename,
          draft.contentMarkdown || ""
        );

        const now = new Date().toISOString();
        const newDoc: Doc = {
          id: crypto.randomUUID(),
          deviceId: selectedDevice.id,
          name: docTitle,
          cid: upload.cid,
          url: upload.url,
          createdAt: now,
          category: docTypeLabel,
          docType,
          version: "1.0",
          revision: draftRevision || "R1",
          docStatus: "Draft",
          approvedBy: "",
          assignmentScope: "device",
          assignedBatch: "",
          assignedProductGroup: "",
          isMandatory: true,
          purpose: `Automatisch erzeugtes Pflichtdokument (${docTypeLabel})`,
        };

        await insertDocWithFallback(newDoc);
        createdDocs.push(newDoc);
      } catch (err) {
        console.error(err);
        failedTypes.push(docTypeLabel);
      }
    }

    if (createdDocs.length > 0) {
      setDocs((prev) => [...createdDocs, ...prev]);
    }

    if (createdDocs.length > 0 && failedTypes.length === 0) {
      setMessage(`${createdDocs.length} Pflichtdokument(e) wurden automatisch erstellt.`);
    } else if (createdDocs.length > 0 && failedTypes.length > 0) {
      setMessage(
        `${createdDocs.length} Pflichtdokument(e) erstellt. Fehlgeschlagen: ${failedTypes.join(", ")}.`
      );
    } else {
      setMessage(
        `Automatische Erstellung fehlgeschlagen. Betroffen: ${failedTypes.join(", ")}.`
      );
    }

    setIsAutoGeneratingMissing(false);
  };

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
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Pflichtdokument-Matrix (Gruppe)</div>
            <button
              onClick={handleAutoGenerateMissingDocuments}
              disabled={isAutoGeneratingMissing || missingRequiredTypes.length === 0}
              className="rounded-lg border border-violet-500/50 bg-violet-900/25 px-3 py-2 text-xs text-violet-100 disabled:opacity-50"
            >
              {isAutoGeneratingMissing
                ? "Erstellt Pflichtdokumente..."
                : "Fehlende Dokumente mit KI erstellen"}
            </button>
          </div>
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
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">QMS Dokument Draft</div>
              <div className="text-xs text-slate-400">
                Aktiv: nutzt Daten aus der Geräteübersicht (ausgewähltes Gerät + Dokumentstatus).
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-2">
            <select
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              value={aiDocType}
              onChange={(e) => setAiDocType(e.target.value)}
            >
              <option value="IFU">IFU</option>
              <option value="Risk Analysis">Risk Analysis</option>
              <option value="SOP">SOP</option>
              <option value="CAPA">CAPA</option>
              <option value="Change Control">Change Control</option>
              <option value="Audit Report">Audit Report</option>
            </select>
            <button
              onClick={handleGenerateQmsDocumentDraft}
              disabled={isGeneratingDraft}
              className="rounded-lg border border-emerald-500/60 bg-emerald-900/30 px-4 py-2 text-sm font-medium hover:bg-emerald-800/40 disabled:opacity-60"
            >
              {isGeneratingDraft ? "Generating..." : "Generate Document"}
            </button>
          </div>

          {aiDocDraft?.contentMarkdown && (
            <div className="space-y-2">
              <div className="text-xs text-slate-300">
                {aiDocDraft.title || "Dokumententwurf"}
              </div>
              <textarea
                className="w-full min-h-[260px] rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none"
                value={aiDocDraft.contentMarkdown}
                onChange={(e) =>
                  setAiDocDraft((prev) =>
                    prev ? { ...prev, contentMarkdown: e.target.value } : prev
                  )
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs"
                  onClick={() => copyToClipboard(aiDocDraft.contentMarkdown || "")}
                >
                  Text kopieren
                </button>
                <button
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs"
                  onClick={() =>
                    downloadTextFile(
                      `${(aiDocDraft.title || aiDocType || "qms-draft")
                        .replace(/\s+/g, "-")
                        .toLowerCase()}.md`,
                      aiDocDraft.contentMarkdown || "",
                      "text/markdown;charset=utf-8"
                    )
                  }
                >
                  Als .md herunterladen
                </button>
                <button
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs"
                  onClick={() =>
                    downloadTextFile(
                      `${(aiDocDraft.title || aiDocType || "qms-draft")
                        .replace(/\s+/g, "-")
                        .toLowerCase()}.csv`,
                      toExcelCsv(
                        aiDocDraft.title || aiDocType,
                        aiDocDraft.contentMarkdown || "",
                        aiDocDraft.checklist || []
                      ),
                      "text/csv;charset=utf-8"
                    )
                  }
                >
                  Als Excel (.csv) herunterladen
                </button>
                <button
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs"
                  onClick={() =>
                    downloadTextFile(
                      `${(aiDocDraft.title || aiDocType || "qms-draft")
                        .replace(/\s+/g, "-")
                        .toLowerCase()}.doc`,
                      toWordHtml(
                        aiDocDraft.title || aiDocType,
                        aiDocDraft.contentMarkdown || "",
                        aiDocDraft.checklist || []
                      ),
                      "application/msword;charset=utf-8"
                    )
                  }
                >
                  Als Word (.doc) herunterladen
                </button>
                <input
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs w-[88px]"
                  value={draftRevision}
                  onChange={(e) => setDraftRevision(e.target.value)}
                  placeholder="R1"
                />
                <button
                  className="rounded-lg border border-sky-500/40 bg-sky-900/20 px-3 py-2 text-xs text-sky-100 disabled:opacity-60"
                  onClick={handleSaveDraftToSupabase}
                  disabled={isSavingDraft}
                >
                  {isSavingDraft ? "Speichert..." : "In Supabase speichern"}
                </button>
              </div>
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
