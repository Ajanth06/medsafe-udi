"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  computeDerived,
  getAcceptability,
  validateRow,
  type Acceptability,
  type FmeaRowDb,
  type ReassessmentReason,
  type RiskLevel,
} from "../../utils/riskFmea";

type Device = {
  id: string;
  name: string;
  batch?: string;
  serial: string;
  udiDi: string;
  dhrId?: string;
  dmrId?: string;
  status?: string;
  nonconformityCategory?: string;
  nonconformityAction?: string;
  nonconformitySeverity?: string;
};

type RiskAnalysisStatus = "Draft" | "In Review" | "Approved" | "Obsolete";
type RiskScope = "product_group" | "device";
type LifecyclePhase =
  | "Design"
  | "Manufacturing"
  | "Distribution"
  | "Use"
  | "Service"
  | "Decommission";
type ActionStatus = "Open" | "In Progress" | "Done";
type RowStatus = "idle" | "saving" | "saved" | "error";

type RiskAnalysis = {
  id: string;
  scope_type: RiskScope;
  group_id: string | null;
  device_id: string | null;
  title: string;
  standard: string;
  version: number;
  status: RiskAnalysisStatus;
  prepared_by: string;
  reviewed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type FmeaRowUi = Omit<
  FmeaRowDb,
  "rpn" | "risk_level" | "residual_rpn"
> & {
  rpn: number;
  risk_level: RiskLevel;
  residual_rpn: number | null;
  ui_id: string;
  acceptability: Acceptability;
  ui_status: RowStatus;
  ui_error?: string | null;
};

type FishboneNode = {
  id: string;
  risk_analysis_id: string;
  problem_statement: string;
  branch: string;
  item: string;
  created_at: string;
};

type RiskAuditEntry = {
  id: string;
  risk_analysis_id: string;
  action: string;
  details: any;
  created_at: string;
  actor: string | null;
};

const LIFECYCLE_PHASES: LifecyclePhase[] = [
  "Design",
  "Manufacturing",
  "Distribution",
  "Use",
  "Service",
  "Decommission",
];

const FISHBONE_BRANCHES = [
  "Man",
  "Machine",
  "Method",
  "Material",
  "Measurement",
  "Environment",
];

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, idx) => idx + 1);
const OWNER_ROLES = [
  "Quality Manager",
  "Design Engineering",
  "Manufacturing",
  "Service Lead",
  "Regulatory",
];
const REASSESSMENT_REASONS: ReassessmentReason[] = [
  "PMS data",
  "Complaint trend",
  "Design change",
  "Other",
];

const badgeClassForRisk = (level: RiskLevel) => {
  switch (level) {
    case "High":
      return "bg-rose-500/20 text-rose-200 border-rose-500/50";
    case "Medium":
      return "bg-amber-500/20 text-amber-200 border-amber-500/50";
    default:
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40";
  }
};

const badgeClassForAcceptance = (status: Acceptability) => {
  switch (status) {
    case "Nicht akzeptabel":
      return "bg-rose-500/20 text-rose-200 border-rose-500/50";
    case "Review":
      return "bg-amber-500/20 text-amber-200 border-amber-500/50";
    default:
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40";
  }
};

const fieldClass = (hasError: boolean, extra = "") =>
  `bg-slate-900/60 rounded px-1 py-0.5 outline-none border ${
    hasError
      ? "border-rose-500/80 focus:border-rose-400 text-rose-100"
      : "border-slate-700 focus:border-emerald-500"
  } ${extra}`;

const toCsv = (rows: FmeaRowUi[]) => {
  const header = [
    "LifecyclePhase",
    "ProcessStep",
    "FailureMode",
    "Effect",
    "Cause",
    "ExistingControls",
    "S",
    "O",
    "D",
    "RPN",
    "RiskLevel",
    "RiskAcceptance",
    "RecommendedActions",
    "Owner",
    "DueDate",
    "ActionStatus",
    "ResidualS",
    "ResidualO",
    "ResidualD",
    "ResidualRPN",
  ].join(";");

  const data = rows.map((row) =>
    [
      row.lifecycle_phase,
      row.process_step,
      row.failure_mode,
      row.effect,
      row.cause,
      row.existing_controls,
      row.severity_s,
      row.occurrence_o,
      row.detection_d,
      row.rpn,
      row.risk_level,
      row.acceptability,
      row.recommended_actions,
      row.action_owner || "",
      row.action_due || "",
      row.action_status,
      row.residual_severity_s ?? "",
      row.residual_occurrence_o ?? "",
      row.residual_detection_d ?? "",
      row.residual_rpn ?? "",
    ]
      .map((val) => `"${String(val ?? "").replace(/"/g, '""')}"`)
      .join(";")
  );

  return [header, ...data].join("\n");
};

async function groupKeyToUuid(groupKey: string) {
  const data = new TextEncoder().encode(groupKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(hash)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function RiskAnalysisPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [scope, setScope] = useState<RiskScope>("product_group");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [fmeaRows, setFmeaRows] = useState<FmeaRowUi[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [fishboneNodes, setFishboneNodes] = useState<FishboneNode[]>([]);
  const [riskAudit, setRiskAudit] = useState<RiskAuditEntry[]>([]);
  const [fishboneProblem, setFishboneProblem] = useState(
    "Temperature out of specification"
  );
  const [branchInputs, setBranchInputs] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const decorateRow = (row: FmeaRowDb): FmeaRowUi => {
    const derived = computeDerived(row);
    return {
      ...row,
      rpn: derived.rpn,
      risk_level: derived.risk_level,
      residual_rpn: derived.residual_rpn,
      acceptability: getAcceptability(derived.risk_level),
      ui_id: row.id || `temp-${Math.random().toString(36).slice(2)}`,
      ui_status: "idle",
      ui_error: null,
    };
  };

  const parseScore = (value: string, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : fallback;
  };

  const parseResidual = (value: string) => {
    if (!value) return null;
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : null;
  };

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) || null,
    [devices, selectedDeviceId]
  );

  const groupedDevices = useMemo(() => {
    const map: Record<string, Device> = {};
    for (const d of devices) {
      const key = `${d.name}__${d.batch ?? ""}`;
      if (!map[key]) {
        map[key] = d;
      }
    }
    return Object.entries(map).map(([key, representative]) => ({
      key,
      label: `${representative.name} – Charge ${representative.batch ?? "–"}`,
      device: representative,
    }));
  }, [devices]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
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
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadDevices = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("devices")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setDevices(
          (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            batch: row.batch ?? "",
            serial: row.serial,
            udiDi: row.udi_di,
            dhrId: row.dhr_id ?? "",
            dmrId: row.dmr_id ?? "",
            status: row.status ?? "",
            nonconformityCategory: row.nonconformity_category ?? "",
            nonconformityAction: row.nonconformity_action ?? "",
            nonconformitySeverity: row.nonconformity_severity ?? "",
          }))
        );
      } catch (err) {
        console.error("Risk: Geräte laden fehlgeschlagen", err);
        setMessage("Geräte konnten nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDevices();
  }, [user]);

  const addRiskAudit = async (
    riskAnalysisId: string,
    action: string,
    details: any
  ) => {
    const entry = {
      risk_analysis_id: riskAnalysisId,
      action,
      details,
      created_at: new Date().toISOString(),
      actor: user?.email ?? null,
    };
    setRiskAudit((prev) => [entry as RiskAuditEntry, ...prev]);
    const { error } = await supabase.from("risk_audit_log").insert(entry);
    if (error) {
      console.error("Risk audit insert error:", error);
    }
  };

  const loadRiskAnalysis = async () => {
    if (!user) return;
    if (scope === "product_group" && !selectedGroupKey) {
      setAnalysis(null);
      setFmeaRows([]);
      setFishboneNodes([]);
      setRiskAudit([]);
      return;
    }
    if (scope === "device" && !selectedDeviceId) {
      setAnalysis(null);
      setFmeaRows([]);
      setFishboneNodes([]);
      setRiskAudit([]);
      return;
    }

    setIsLoading(true);
    try {
      let query = supabase.from("risk_analyses").select("*").eq("scope_type", scope);

      if (scope === "product_group") {
        const groupId = await groupKeyToUuid(selectedGroupKey);
        query = query.eq("group_id", groupId);
      } else {
        query = query.eq("device_id", selectedDeviceId);
      }

      const { data: analysisRows, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;
      const current = analysisRows?.[0] ?? null;
      setAnalysis(current);

      if (!current) {
        setFmeaRows([]);
        setFishboneNodes([]);
        setRiskAudit([]);
        return;
      }

      const [{ data: fmea }, { data: fishbone }, { data: audit }] =
        await Promise.all([
          supabase
            .from("fmea_rows")
            .select("*")
            .eq("risk_analysis_id", current.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("fishbone_nodes")
            .select("*")
            .eq("risk_analysis_id", current.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("risk_audit_log")
            .select("*")
            .eq("risk_analysis_id", current.id)
            .order("created_at", { ascending: false }),
        ]);

      setFmeaRows((fmea || []).map((row: FmeaRowDb) => decorateRow(row)));
      setFishboneNodes(fishbone || []);
      setRiskAudit(audit || []);

      if (fishbone && fishbone.length > 0) {
        setFishboneProblem(fishbone[0].problem_statement || fishboneProblem);
      }
    } catch (err) {
      console.error("Risk: Analyse laden fehlgeschlagen", err);
      setMessage("Risikoanalyse konnte nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRiskAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scope, selectedGroupKey, selectedDeviceId]);

  const ensureRiskAnalysis = async () => {
    if (analysis) return analysis;
    const now = new Date().toISOString();

    let groupId: string | null = null;
    let deviceId: string | null = null;
    let title = "Risk Analysis – ISO 14971";

    if (scope === "product_group") {
      groupId = await groupKeyToUuid(selectedGroupKey);
      const groupDevice = groupedDevices.find((g) => g.key === selectedGroupKey);
      if (groupDevice) {
        title = `Risk Analysis – ${groupDevice.device.name} – Charge ${
          groupDevice.device.batch ?? "–"
        }`;
      }
    } else if (selectedDevice) {
      deviceId = selectedDevice.id;
      title = `Risk Analysis – ${selectedDevice.name} – SN ${selectedDevice.serial}`;
    }

    const payload = {
      scope_type: scope,
      group_id: groupId,
      device_id: deviceId,
      title,
      standard: "ISO 14971",
      version: 1,
      status: "Draft",
      prepared_by: user?.email ?? "",
      reviewed_by: null,
      approved_by: null,
      approved_at: null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("risk_analyses")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("Risk create error:", error);
      throw error;
    }
    setAnalysis(data);
    await addRiskAudit(data.id, "risk_created", {
      scope,
      title,
    });
    return data as RiskAnalysis;
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (scope === "product_group" && !selectedGroupKey) {
      setMessage("Bitte zuerst eine Produkt/Charge-Gruppe wählen.");
      return;
    }
    if (scope === "device" && !selectedDeviceId) {
      setMessage("Bitte zuerst ein Gerät wählen.");
      return;
    }

    if (fmeaRows.length > 0 || fishboneNodes.length > 0) {
      const confirm = window.confirm(
        "Es existieren bereits FMEA/Fishbone-Daten. Weitere Vorschläge hinzufügen?"
      );
      if (!confirm) return;
    }

    setIsGenerating(true);
    setMessage("Automatische Generierung läuft …");
    try {
      const current = await ensureRiskAnalysis();
      const now = new Date().toISOString();

      const baseFmea = [
        {
          lifecycle_phase: "Design",
          process_step: "Temperature control",
          failure_mode: "Temperature out of spec",
          effect: "Device fails to maintain safe range",
          cause: "Controller misconfiguration",
          existing_controls: "Design review, verification test",
        },
        {
          lifecycle_phase: "Use",
          process_step: "Sensor measurement",
          failure_mode: "Sensor drift",
          effect: "Incorrect temperature reading",
          cause: "Aging or calibration loss",
          existing_controls: "Calibration schedule, alarm thresholds",
        },
        {
          lifecycle_phase: "Manufacturing",
          process_step: "Assembly",
          failure_mode: "Door seal leakage",
          effect: "Cooling loss, temperature instability",
          cause: "Improper assembly or material defect",
          existing_controls: "Incoming inspection, assembly checklist",
        },
        {
          lifecycle_phase: "Distribution",
          process_step: "Transport",
          failure_mode: "Transport shock",
          effect: "Component misalignment",
          cause: "Insufficient packaging",
          existing_controls: "Packaging validation, drop tests",
        },
        {
          lifecycle_phase: "Use",
          process_step: "Power supply",
          failure_mode: "Power loss",
          effect: "Device stops cooling",
          cause: "Facility outage or plug failure",
          existing_controls: "Battery backup, alarm notification",
        },
        {
          lifecycle_phase: "Service",
          process_step: "Maintenance",
          failure_mode: "Service performed incorrectly",
          effect: "Latent performance degradation",
          cause: "Incomplete procedure",
          existing_controls: "Service SOP, training",
        },
        {
          lifecycle_phase: "Use",
          process_step: "Alarm monitoring",
          failure_mode: "Alarm failure",
          effect: "User not alerted to deviation",
          cause: "Sensor or software fault",
          existing_controls: "Alarm self-test, watchdog",
        },
        {
          lifecycle_phase: "Use",
          process_step: "Data logging",
          failure_mode: "Data logging missing",
          effect: "No evidence for compliance",
          cause: "Storage full or logging disabled",
          existing_controls: "Log checks, storage monitoring",
        },
        {
          lifecycle_phase: "Manufacturing",
          process_step: "Labeling",
          failure_mode: "Wrong labeling / UDI mismatch",
          effect: "Traceability compromised",
          cause: "Label mix-up",
          existing_controls: "Label verification, barcode scan",
        },
        {
          lifecycle_phase: "Use",
          process_step: "Cleaning",
          failure_mode: "Contamination",
          effect: "Reduced performance or infection risk",
          cause: "Improper cleaning",
          existing_controls: "IFU, cleaning SOP",
        },
        {
          lifecycle_phase: "Service",
          process_step: "Defrosting",
          failure_mode: "Condensation/ice buildup",
          effect: "Sensor errors, cooling inefficiency",
          cause: "Defrost cycle failure",
          existing_controls: "Preventive maintenance",
        },
      ];

      const ncHints: string[] = [];
      if (selectedDevice?.nonconformityCategory) {
        ncHints.push(selectedDevice.nonconformityCategory);
      }
      if (selectedDevice?.nonconformityAction) {
        ncHints.push(selectedDevice.nonconformityAction);
      }
      if (selectedDevice?.nonconformitySeverity) {
        ncHints.push(selectedDevice.nonconformitySeverity);
      }

      const extraFmea = ncHints.slice(0, 3).map((hint, idx) => ({
        lifecycle_phase: "Use" as LifecyclePhase,
        process_step: "Nonconformity feedback",
        failure_mode: `NC Hinweis ${idx + 1}`,
        effect: "Potential nonconformity risk",
        cause: hint,
        existing_controls: "NC Prozess, CAPA Review",
      }));

      const fmeaPayload: FmeaRowDb[] = [...baseFmea, ...extraFmea].map((row) => {
        const s = 6;
        const o = 4;
        const d = 4;
        const base: FmeaRowDb = {
          risk_analysis_id: current.id,
          lifecycle_phase: row.lifecycle_phase as LifecyclePhase,
          process_step: row.process_step,
          failure_mode: row.failure_mode,
          effect: row.effect,
          cause: row.cause,
          existing_controls: row.existing_controls,
          severity_s: s,
          occurrence_o: o,
          detection_d: d,
          rpn: null,
          risk_level: null,
          recommended_actions: "Review and define mitigation",
          action_owner: null,
          action_due: null,
          action_status: "Open" as ActionStatus,
          residual_severity_s: null,
          residual_occurrence_o: null,
          residual_detection_d: null,
          residual_rpn: null,
          reassessment_enabled: false,
          reassessment_reason: null,
          justification_text: null,
          approved_by: null,
          approval_date: null,
          created_at: now,
          updated_at: now,
        };
        const derived = computeDerived(base);
        return {
          ...base,
          rpn: derived.rpn,
          risk_level: derived.risk_level,
          residual_rpn: derived.residual_rpn,
        };
      });

      const fishbonePayload = FISHBONE_BRANCHES.flatMap((branch) => {
        const items: Record<string, string[]> = {
          Man: ["Operator training", "Procedure adherence"],
          Machine: ["Sensor drift", "Controller failure"],
          Method: ["Calibration process", "Alarm escalation"],
          Material: ["Seal material aging", "Insulation degradation"],
          Measurement: ["Logger accuracy", "Test method variance"],
          Environment: ["Ambient heat", "Transport shock"],
        };
        return (items[branch] || ["Unspecified cause"]).map((item) => ({
          risk_analysis_id: current.id,
          problem_statement: fishboneProblem,
          branch,
          item,
          created_at: now,
        }));
      });

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Auth required");
      for (const row of fmeaPayload) {
        const response = await fetch("/api/risk/fmea", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(row),
        });
        if (!response.ok) {
          throw new Error("FMEA upsert failed");
        }
      }

      const { error: fishError } = await supabase
        .from("fishbone_nodes")
        .insert(fishbonePayload);
      if (fishError) throw fishError;

      await addRiskAudit(current.id, "fmea_generated", {
        count: fmeaPayload.length,
      });
      await addRiskAudit(current.id, "fishbone_generated", {
        count: fishbonePayload.length,
      });

      setMessage("FMEA + Fishbone Vorschläge wurden erstellt.");
      await loadRiskAnalysis();
    } catch (err) {
      console.error("Risk generate error:", err);
      setMessage("Generierung fehlgeschlagen.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateRiskAnalysis = async (patch: Partial<RiskAnalysis>) => {
    if (!analysis) return;
    const updated = { ...analysis, ...patch, updated_at: new Date().toISOString() };
    setAnalysis(updated);
    const { error } = await supabase
      .from("risk_analyses")
      .update({
        ...patch,
        updated_at: updated.updated_at,
      })
      .eq("id", analysis.id);
    if (error) {
      console.error("Risk update error:", error);
    }
  };

  const handleStatusChange = async (next: RiskAnalysisStatus) => {
    if (!analysis) return;
    if (next === analysis.status) return;

    if (next === "Approved") {
      const approver = analysis.approved_by || user?.email || "";
      if (!approver.trim()) {
        setMessage("Bitte 'Approved by' setzen, bevor freigegeben wird.");
        return;
      }
      const confirm = window.confirm(
        "Status auf Approved setzen? Freigabe ist endgültig und auditpflichtig."
      );
      if (!confirm) return;
      await updateRiskAnalysis({
        status: next,
        approved_by: approver,
        approved_at: new Date().toISOString(),
      });
      await addRiskAudit(analysis.id, "approved", { status: next });
      return;
    }

    const confirm = window.confirm(`Status auf "${next}" setzen?`);
    if (!confirm) return;
    await updateRiskAnalysis({
      status: next,
      approved_at: null,
    });
    await addRiskAudit(analysis.id, "status_changed", { status: next });
  };

  const updateFmeaRow = (rowId: string, patch: Partial<FmeaRowUi>) => {
    setFmeaRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId && row.ui_id !== rowId) return row;
        const next = { ...row, ...patch } as FmeaRowUi;
        const derived = computeDerived(next);
        return {
          ...next,
          rpn: derived.rpn,
          risk_level: derived.risk_level,
          residual_rpn: derived.residual_rpn,
          acceptability: getAcceptability(derived.risk_level),
          ui_status: "idle",
          ui_error: null,
        };
      })
    );
    setRowErrors((prev) => ({ ...prev, [rowId]: {} }));
  };

  const saveFmeaRow = async (row: FmeaRowUi) => {
    const dbRow: FmeaRowDb = { ...row };
    delete (dbRow as any).acceptability;
    delete (dbRow as any).ui_id;
    delete (dbRow as any).ui_status;
    delete (dbRow as any).ui_error;

    const errors = validateRow(dbRow);
    if (Object.keys(errors).length > 0) {
      setRowErrors((prev) => ({ ...prev, [row.ui_id]: errors }));
      setFmeaRows((prev) =>
        prev.map((r) =>
          r.ui_id === row.ui_id
            ? { ...r, ui_status: "error", ui_error: Object.values(errors)[0] }
            : r
        )
      );
      return;
    }

    setFmeaRows((prev) =>
      prev.map((r) =>
        r.ui_id === row.ui_id ? { ...r, ui_status: "saving", ui_error: null } : r
      )
    );

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setFmeaRows((prev) =>
        prev.map((r) =>
          r.ui_id === row.ui_id
            ? { ...r, ui_status: "error", ui_error: "Bitte einloggen." }
            : r
        )
      );
      return;
    }

    const response = await fetch("/api/risk/fmea", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dbRow),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setRowErrors((prev) => ({
        ...prev,
        [row.ui_id]: payload?.errors || {},
      }));
      setFmeaRows((prev) =>
        prev.map((r) =>
          r.ui_id === row.ui_id
            ? {
                ...r,
                ui_status: "error",
                ui_error: payload?.error || "Save fehlgeschlagen.",
              }
            : r
        )
      );
      return;
    }

    const payload = await response.json();
    const saved = {
      ...decorateRow(payload.row as FmeaRowDb),
      ui_status: "saved",
      ui_error: null,
    };
    setFmeaRows((prev) =>
      prev.map((r) => (r.ui_id === row.ui_id ? saved : r))
    );
  };

  const deleteFmeaRow = async (row: FmeaRowUi) => {
    const confirm = window.confirm("Diese FMEA-Zeile löschen?");
    if (!confirm) return;
    if (!row.id) {
      setFmeaRows((prev) => prev.filter((r) => r.ui_id !== row.ui_id));
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Bitte einloggen, um zu löschen.");
      return;
    }

    const response = await fetch(`/api/risk/fmea?id=${row.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload?.error || "Delete fehlgeschlagen.");
      return;
    }

    setFmeaRows((prev) => prev.filter((r) => r.ui_id !== row.ui_id));
  };

  const handleAddFishboneItem = async (branch: string) => {
    if (!analysis) return;
    const value = (branchInputs[branch] || "").trim();
    if (!value) return;

    const payload = {
      risk_analysis_id: analysis.id,
      problem_statement: fishboneProblem,
      branch,
      item: value,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("fishbone_nodes")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("Fishbone insert error:", error);
      return;
    }
    setFishboneNodes((prev) => [...prev, data as FishboneNode]);
    setBranchInputs((prev) => ({ ...prev, [branch]: "" }));
    await addRiskAudit(analysis.id, "fishbone_generated", {
      branch,
      item: value,
    });
  };

  const handleRemoveFishboneItem = async (node: FishboneNode) => {
    if (!analysis) return;
    const { error } = await supabase
      .from("fishbone_nodes")
      .delete()
      .eq("id", node.id);
    if (error) {
      console.error("Fishbone delete error:", error);
      return;
    }
    setFishboneNodes((prev) => prev.filter((n) => n.id !== node.id));
    await addRiskAudit(analysis.id, "fishbone_node_removed", {
      branch: node.branch,
      item: node.item,
    });
  };

  const handleFishboneProblemSave = async () => {
    if (!analysis) return;
    const trimmed = fishboneProblem.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("fishbone_nodes")
      .update({ problem_statement: trimmed })
      .eq("risk_analysis_id", analysis.id);
    if (error) {
      console.error("Fishbone problem update error:", error);
      return;
    }
    setFishboneNodes((prev) =>
      prev.map((node) => ({ ...node, problem_statement: trimmed }))
    );
    await addRiskAudit(analysis.id, "fishbone_updated", {
      problem_statement: trimmed,
    });
  };

  const handleExportCsv = () => {
    if (!fmeaRows.length) {
      setMessage("Keine FMEA-Daten vorhanden.");
      return;
    }
    const csv = toCsv(fmeaRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "risk-fmea.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddFmeaRow = async () => {
    try {
      const current = await ensureRiskAnalysis();
      const now = new Date().toISOString();
      const s = 5;
      const o = 5;
      const d = 5;
      const base: FmeaRowDb = {
        risk_analysis_id: current.id,
        lifecycle_phase: "Use" as LifecyclePhase,
        process_step: "New process step",
        failure_mode: "New failure mode",
        effect: "Describe effect",
        cause: "Describe cause",
        existing_controls: "Current controls",
        severity_s: s,
        occurrence_o: o,
        detection_d: d,
        rpn: null,
        risk_level: null,
        recommended_actions: "Define mitigation",
        action_owner: null,
        action_due: null,
        action_status: "Open" as ActionStatus,
        residual_severity_s: null,
        residual_occurrence_o: null,
        residual_detection_d: null,
        residual_rpn: null,
        reassessment_enabled: false,
        reassessment_reason: null,
        justification_text: null,
        approved_by: null,
        approval_date: null,
        created_at: now,
        updated_at: now,
      };
      const derived = computeDerived(base);
      const row = decorateRow({
        ...base,
        rpn: derived.rpn,
        risk_level: derived.risk_level,
        residual_rpn: derived.residual_rpn,
      });
      setFmeaRows((prev) => [...prev, row]);
    } catch (err) {
      console.error("FMEA row add error:", err);
      setMessage("Neue FMEA-Zeile konnte nicht angelegt werden.");
    }
  };

  if (authLoading) {
    return <div className="text-slate-200">Lade …</div>;
  }

  if (!user) {
    return (
      <main className="min-h-screen text-slate-50">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-sm">
          Bitte einloggen, um die Risikoanalyse zu öffnen.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-slate-100">
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-lg shadow-black/20 backdrop-blur-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Risikoanalyse
              </div>
              <h1 className="text-2xl font-semibold">
                Risikoanalyse (ISO 14971)
              </h1>
              <div className="text-sm text-slate-400 mt-1">
                Assistenzsystem für FMEA und Fishbone – manuelle Freigabe bleibt
                verpflichtend.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
              >
                {isGenerating
                  ? "Generierung läuft …"
                  : "Automatisch generieren (FMEA + Fishbone)"}
              </button>
              <button
                onClick={handleExportCsv}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-sky-500"
              >
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm">
            {message}
          </div>
        )}

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Scope auswählen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Scope</div>
              <select
                className="w-full bg-slate-800 rounded-lg px-3 py-2 outline-none border border-slate-700 focus:border-emerald-500"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as RiskScope);
                  setSelectedDeviceId("");
                }}
              >
                <option value="product_group">Produkt/Charge-Gruppe</option>
                <option value="device">Gerät (DHR)</option>
              </select>
            </div>

            {scope === "product_group" && (
              <div className="md:col-span-2">
                <div className="text-slate-400 text-[11px] mb-1">
                  Produkt/Charge-Gruppe
                </div>
                <select
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 outline-none border border-slate-700 focus:border-emerald-500"
                  value={selectedGroupKey}
                  onChange={(e) => setSelectedGroupKey(e.target.value)}
                >
                  <option value="">Bitte wählen …</option>
                  {groupedDevices.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === "device" && (
              <div className="md:col-span-2">
                <div className="text-slate-400 text-[11px] mb-1">Gerät</div>
                <select
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 outline-none border border-slate-700 focus:border-emerald-500"
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                >
                  <option value="">Bitte wählen …</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name} – SN: {device.serial}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Status &amp; Governance</h2>
              <div className="text-xs text-slate-400">
                Manuelle Freigabe erforderlich (ISO 14971).
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["Draft", "In Review", "Approved", "Obsolete"] as const).map(
                (st) => (
                  <button
                    key={st}
                    onClick={() => handleStatusChange(st)}
                    className={`rounded-md border px-3 py-1 text-xs ${
                      analysis?.status === st
                        ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                    }`}
                  >
                    Status: {st}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Prepared by</div>
              <input
                className="w-full bg-slate-800 rounded-lg px-2 py-1 outline-none border border-slate-700 focus:border-emerald-500"
                value={analysis?.prepared_by || ""}
                onChange={(e) =>
                  setAnalysis((prev) =>
                    prev ? { ...prev, prepared_by: e.target.value } : prev
                  )
                }
                onBlur={() =>
                  updateRiskAnalysis({ prepared_by: analysis?.prepared_by || "" })
                }
              />
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Reviewed by</div>
              <input
                className="w-full bg-slate-800 rounded-lg px-2 py-1 outline-none border border-slate-700 focus:border-emerald-500"
                value={analysis?.reviewed_by || ""}
                onChange={(e) =>
                  setAnalysis((prev) =>
                    prev ? { ...prev, reviewed_by: e.target.value } : prev
                  )
                }
                onBlur={() =>
                  updateRiskAnalysis({ reviewed_by: analysis?.reviewed_by || "" })
                }
              />
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Approved by</div>
              <input
                className="w-full bg-slate-800 rounded-lg px-2 py-1 outline-none border border-slate-700 focus:border-emerald-500"
                value={analysis?.approved_by || ""}
                onChange={(e) =>
                  setAnalysis((prev) =>
                    prev ? { ...prev, approved_by: e.target.value } : prev
                  )
                }
                onBlur={() =>
                  updateRiskAnalysis({ approved_by: analysis?.approved_by || "" })
                }
              />
            </div>
            <div>
              <div className="text-slate-400 text-[11px] mb-1">Approved at</div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-[11px]">
                {analysis?.approved_at
                  ? new Date(analysis.approved_at).toLocaleString()
                  : "–"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-semibold">FMEA Editor</h2>
            <button
              onClick={handleAddFmeaRow}
              className="rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/25"
            >
              Neue FMEA-Zeile
            </button>
          </div>
          {fmeaRows.length === 0 ? (
            <div className="text-sm text-slate-400">
              Noch keine FMEA-Einträge vorhanden.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
              <table className="min-w-[1600px] w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-700 text-left">
                    <th className="py-2 pr-2">Phase</th>
                    <th className="py-2 pr-2 min-w-[160px]">Prozess</th>
                    <th className="py-2 pr-2 min-w-[180px]">Failure Mode</th>
                    <th className="py-2 pr-2 min-w-[180px]">Effect</th>
                    <th className="py-2 pr-2 min-w-[180px]">Cause</th>
                    <th className="py-2 pr-2 min-w-[200px]">Controls</th>
                    <th className="py-2 pr-2">S</th>
                    <th className="py-2 pr-2">O</th>
                    <th className="py-2 pr-2">D</th>
                    <th className="py-2 pr-2">RPN</th>
                    <th className="py-2 pr-2">Risk</th>
                    <th className="py-2 pr-2">Akzeptanz</th>
                    <th className="py-2 pr-2">Actions</th>
                    <th className="py-2 pr-2">Owner</th>
                    <th className="py-2 pr-2">Due</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2 min-w-[260px]">Residual S/O/D</th>
                    <th className="py-2 pr-2">Residual RPN</th>
                    <th className="py-2 pr-2">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {fmeaRows.map((row) => {
                    const errors = rowErrors[row.ui_id] || {};
                    const residualError =
                      errors.residual_rpn ||
                      errors.residual_severity_s ||
                      errors.residual_occurrence_o ||
                      errors.residual_detection_d;
                    return (
                      <tr key={row.ui_id} className="border-b border-slate-800 align-top">
                        <td className="py-2 pr-2">
                          <select
                            className={fieldClass(Boolean(errors.lifecycle_phase))}
                            value={row.lifecycle_phase}
                            title={errors.lifecycle_phase}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                lifecycle_phase: e.target.value as LifecyclePhase,
                              })
                            }
                          >
                            {LIFECYCLE_PHASES.map((phase) => (
                              <option key={phase} value={phase}>
                                {phase}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2 min-w-[160px]">
                          <input
                            className={fieldClass(Boolean(errors.process_step), "w-full")}
                            value={row.process_step}
                            title={errors.process_step}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, { process_step: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2 min-w-[180px]">
                          <input
                            className={fieldClass(Boolean(errors.failure_mode), "w-full")}
                            value={row.failure_mode}
                            title={errors.failure_mode}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, { failure_mode: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2 min-w-[180px]">
                          <input
                            className={fieldClass(Boolean(errors.effect), "w-full")}
                            value={row.effect}
                            title={errors.effect}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, { effect: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2 min-w-[180px]">
                          <input
                            className={fieldClass(Boolean(errors.cause), "w-full")}
                            value={row.cause}
                            title={errors.cause}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, { cause: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2 min-w-[200px]">
                          <input
                            className={fieldClass(Boolean(errors.existing_controls), "w-full")}
                            value={row.existing_controls}
                            title={errors.existing_controls}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                existing_controls: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className={fieldClass(Boolean(errors.severity_s), "w-14")}
                            value={row.severity_s}
                            title={errors.severity_s}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                severity_s: parseScore(e.target.value, row.severity_s),
                              })
                            }
                          >
                            {SCORE_OPTIONS.map((val) => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className={fieldClass(Boolean(errors.occurrence_o), "w-14")}
                            value={row.occurrence_o}
                            title={errors.occurrence_o}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                occurrence_o: parseScore(e.target.value, row.occurrence_o),
                              })
                            }
                          >
                            {SCORE_OPTIONS.map((val) => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className={fieldClass(Boolean(errors.detection_d), "w-14")}
                            value={row.detection_d}
                            title={errors.detection_d}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                detection_d: parseScore(e.target.value, row.detection_d),
                              })
                            }
                          >
                            {SCORE_OPTIONS.map((val) => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">{row.rpn}</td>
                        <td className="py-2 pr-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${badgeClassForRisk(
                              row.risk_level
                            )}`}
                          >
                            {row.risk_level}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${badgeClassForAcceptance(
                              row.acceptability
                            )}`}
                          >
                            {row.acceptability}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className={fieldClass(Boolean(errors.recommended_actions), "w-full")}
                            value={row.recommended_actions}
                            title={errors.recommended_actions}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                recommended_actions: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className={fieldClass(Boolean(errors.action_owner), "w-[170px]")}
                            value={row.action_owner ?? ""}
                            title={errors.action_owner}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                action_owner: e.target.value || null,
                              })
                            }
                          >
                            <option value="">–</option>
                            {OWNER_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            className={fieldClass(Boolean(errors.action_due))}
                            value={row.action_due || ""}
                            title={errors.action_due}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                action_due: e.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className={fieldClass(Boolean(errors.action_status))}
                            value={row.action_status}
                            title={errors.action_status}
                            onChange={(e) =>
                              updateFmeaRow(row.ui_id, {
                                action_status: e.target.value as ActionStatus,
                              })
                            }
                          >
                            {["Open", "In Progress", "Done"].map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2 min-w-[260px]">
                          <div className="flex gap-1">
                            <select
                              className={fieldClass(Boolean(residualError), "w-12")}
                              value={row.residual_severity_s ?? ""}
                              title={residualError}
                              onChange={(e) =>
                                updateFmeaRow(row.ui_id, {
                                  residual_severity_s: parseResidual(e.target.value),
                                })
                              }
                            >
                              <option value="">–</option>
                              {SCORE_OPTIONS.map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                            <select
                              className={fieldClass(Boolean(residualError), "w-12")}
                              value={row.residual_occurrence_o ?? ""}
                              title={residualError}
                              onChange={(e) =>
                                updateFmeaRow(row.ui_id, {
                                  residual_occurrence_o: parseResidual(e.target.value),
                                })
                              }
                            >
                              <option value="">–</option>
                              {SCORE_OPTIONS.map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                            <select
                              className={fieldClass(Boolean(residualError), "w-12")}
                              value={row.residual_detection_d ?? ""}
                              title={residualError}
                              onChange={(e) =>
                                updateFmeaRow(row.ui_id, {
                                  residual_detection_d: parseResidual(e.target.value),
                                })
                              }
                            >
                              <option value="">–</option>
                              {SCORE_OPTIONS.map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                          </div>
                          <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-300">
                            <input
                              type="checkbox"
                              className="accent-emerald-500"
                              checked={row.reassessment_enabled}
                              onChange={(e) =>
                                updateFmeaRow(row.ui_id, {
                                  reassessment_enabled: e.target.checked,
                                  ...(e.target.checked
                                    ? {}
                                    : {
                                        reassessment_reason: null,
                                        justification_text: null,
                                        approved_by: null,
                                        approval_date: null,
                                      }),
                                })
                              }
                            />
                            Residual higher than initial? (PMS re-assessment)
                          </label>
                          {row.reassessment_enabled && (
                            <div className="mt-2 grid grid-cols-1 gap-1">
                              <select
                                className={fieldClass(
                                  Boolean(errors.reassessment_reason),
                                  "w-full"
                                )}
                                value={row.reassessment_reason ?? ""}
                                title={errors.reassessment_reason}
                                onChange={(e) =>
                                  updateFmeaRow(row.ui_id, {
                                    reassessment_reason: e.target.value
                                      ? (e.target.value as ReassessmentReason)
                                      : null,
                                  })
                                }
                              >
                                <option value="">Reason auswählen …</option>
                                {REASSESSMENT_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                className={fieldClass(
                                  Boolean(errors.justification_text),
                                  "w-full min-h-[50px]"
                                )}
                                value={row.justification_text ?? ""}
                                title={errors.justification_text}
                                onChange={(e) =>
                                  updateFmeaRow(row.ui_id, {
                                    justification_text: e.target.value,
                                  })
                                }
                              />
                              <input
                                className={fieldClass(Boolean(errors.approved_by), "w-full")}
                                placeholder="Approved by (Quality)"
                                value={row.approved_by ?? ""}
                                title={errors.approved_by}
                                onChange={(e) =>
                                  updateFmeaRow(row.ui_id, {
                                    approved_by: e.target.value,
                                  })
                                }
                              />
                              <input
                                type="date"
                                className={fieldClass(Boolean(errors.approval_date), "w-full")}
                                value={row.approval_date ?? ""}
                                title={errors.approval_date}
                                onChange={(e) =>
                                  updateFmeaRow(row.ui_id, {
                                    approval_date: e.target.value || null,
                                  })
                                }
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2">{row.residual_rpn ?? "–"}</td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-col gap-1 min-w-[90px]">
                            <button
                              onClick={() => saveFmeaRow(row)}
                              className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-100"
                            >
                              {row.ui_status === "saving" ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => deleteFmeaRow(row)}
                              className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-100"
                            >
                              Delete
                            </button>
                            {row.ui_status === "saved" && (
                              <span className="text-[10px] text-emerald-300">Saved</span>
                            )}
                            {row.ui_status === "error" && (
                              <span className="text-[10px] text-rose-300">
                                {row.ui_error || "Error"}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Fishbone View</h2>
          <div className="text-xs text-slate-400">
            Problem Statement
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-emerald-500"
              value={fishboneProblem}
              onChange={(e) => setFishboneProblem(e.target.value)}
              onBlur={handleFishboneProblemSave}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {FISHBONE_BRANCHES.map((branch) => {
              const nodes = fishboneNodes.filter((n) => n.branch === branch);
              return (
                <div
                  key={branch}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="font-semibold text-slate-100">{branch}</div>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {nodes.length === 0 && (
                      <li className="text-slate-500">Keine Ursachen erfasst.</li>
                    )}
                    {nodes.map((node) => (
                      <li
                        key={node.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>{node.item}</span>
                        <button
                          className="text-[10px] text-rose-300 hover:text-rose-200"
                          onClick={() => handleRemoveFishboneItem(node)}
                        >
                          Entfernen
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="flex-1 bg-slate-800 rounded-md px-2 py-1 text-xs outline-none border border-slate-700 focus:border-emerald-500"
                      placeholder="Neue Ursache hinzufügen"
                      value={branchInputs[branch] || ""}
                      onChange={(e) =>
                        setBranchInputs((prev) => ({
                          ...prev,
                          [branch]: e.target.value,
                        }))
                      }
                    />
                    <button
                      className="rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-100"
                      onClick={() => handleAddFishboneItem(branch)}
                    >
                      Hinzufügen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Aktivitäten (Audit-Log)</h2>
          {riskAudit.length === 0 ? (
            <div className="text-sm text-slate-400">
              Noch keine Aktivitäten aufgezeichnet.
            </div>
          ) : (
            <ul className="space-y-2 text-sm max-h-60 overflow-y-auto">
              {riskAudit.map((entry) => (
                <li
                  key={entry.id}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2"
                >
                  <div className="text-xs text-slate-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                  <div className="font-medium mt-1">{entry.action}</div>
                  <div className="text-xs text-slate-500">
                    {entry.actor || "System"}
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
