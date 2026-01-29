"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

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

type FmeaRow = {
  id: string;
  risk_analysis_id: string;
  lifecycle_phase: LifecyclePhase;
  process_step: string;
  failure_mode: string;
  effect: string;
  cause: string;
  existing_controls: string;
  severity_s: number;
  occurrence_o: number;
  detection_d: number;
  rpn: number;
  risk_level: string;
  recommended_actions: string;
  action_owner: string | null;
  action_due: string | null;
  action_status: ActionStatus;
  residual_severity_s: number | null;
  residual_occurrence_o: number | null;
  residual_detection_d: number | null;
  residual_rpn: number | null;
  created_at: string;
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

const clampScore = (value: number) => {
  if (Number.isNaN(value)) return 1;
  return Math.min(10, Math.max(1, Math.round(value)));
};

const computeRpn = (s: number, o: number, d: number) =>
  clampScore(s) * clampScore(o) * clampScore(d);

const riskLevelFromRpn = (rpn: number) => {
  if (rpn >= 200) return "Critical";
  if (rpn >= 100) return "High";
  if (rpn >= 50) return "Medium";
  return "Low";
};

const badgeClassForRisk = (level: string) => {
  switch (level) {
    case "Critical":
      return "bg-rose-500/20 text-rose-200 border-rose-500/50";
    case "High":
      return "bg-amber-500/20 text-amber-200 border-amber-500/50";
    case "Medium":
      return "bg-sky-500/20 text-sky-200 border-sky-500/50";
    default:
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40";
  }
};

const toCsv = (rows: FmeaRow[]) => {
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
  const [fmeaRows, setFmeaRows] = useState<FmeaRow[]>([]);
  const [fishboneNodes, setFishboneNodes] = useState<FishboneNode[]>([]);
  const [riskAudit, setRiskAudit] = useState<RiskAuditEntry[]>([]);
  const [fishboneProblem, setFishboneProblem] = useState(
    "Temperature out of specification"
  );
  const [branchInputs, setBranchInputs] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

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

  useEffect(() => {
    const restoreLastSelection = async () => {
      if (!user || devices.length === 0) return;
      if (selectedGroupKey || selectedDeviceId) return;

      try {
        const { data, error } = await supabase
          .from("risk_analyses")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);
        if (error || !data || data.length === 0) return;
        const latest = data[0] as RiskAnalysis;

        if (latest.scope_type === "device" && latest.device_id) {
          setScope("device");
          setSelectedDeviceId(latest.device_id);
          return;
        }

        if (latest.scope_type === "product_group" && latest.group_id) {
          const groupEntries = await Promise.all(
            groupedDevices.map(async (group) => {
              const id = await groupKeyToUuid(group.key);
              return { key: group.key, id };
            })
          );
          const match = groupEntries.find((g) => g.id === latest.group_id);
          if (match) {
            setScope("product_group");
            setSelectedGroupKey(match.key);
          }
        }
      } catch (err) {
        console.error("Restore selection failed:", err);
      }
    };

    restoreLastSelection();
  }, [user, devices, groupedDevices, selectedGroupKey, selectedDeviceId]);

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

      setFmeaRows(fmea || []);
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

      const fmeaPayload = [...baseFmea, ...extraFmea].map((row) => {
        const s = 6;
        const o = 4;
        const d = 4;
        const rpn = computeRpn(s, o, d);
        return {
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
          rpn,
          risk_level: riskLevelFromRpn(rpn),
          recommended_actions: "Review and define mitigation",
          action_owner: null,
          action_due: null,
          action_status: "Open" as ActionStatus,
          residual_severity_s: null,
          residual_occurrence_o: null,
          residual_detection_d: null,
          residual_rpn: null,
          created_at: now,
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

      const { error: fmeaError } = await supabase
        .from("fmea_rows")
        .insert(fmeaPayload);
      if (fmeaError) throw fmeaError;

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

  const updateFmeaRow = async (rowId: string, patch: Partial<FmeaRow>) => {
    const existing = fmeaRows.find((row) => row.id === rowId);
    if (!existing || !analysis) return;

    const next = { ...existing, ...patch };
    const s = clampScore(Number(next.severity_s));
    const o = clampScore(Number(next.occurrence_o));
    const d = clampScore(Number(next.detection_d));
    const rpn = computeRpn(s, o, d);
    const riskLevel = riskLevelFromRpn(rpn);

    let residualRpn: number | null = null;
    const residualS = next.residual_severity_s;
    const residualO = next.residual_occurrence_o;
    const residualD = next.residual_detection_d;
    if (
      residualS !== null &&
      residualO !== null &&
      residualD !== null &&
      residualS !== undefined &&
      residualO !== undefined &&
      residualD !== undefined
    ) {
      residualRpn = computeRpn(residualS, residualO, residualD);
    }

    const payload = {
      ...patch,
      severity_s: s,
      occurrence_o: o,
      detection_d: d,
      rpn,
      risk_level: riskLevel,
      residual_rpn: residualRpn,
    };

    setFmeaRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...payload } : row))
    );

    const { error } = await supabase
      .from("fmea_rows")
      .update(payload)
      .eq("id", rowId);
    if (error) {
      console.error("FMEA update error:", error);
    } else {
      await addRiskAudit(analysis.id, "fmea_row_updated", {
        row_id: rowId,
      });
    }
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
      const rpn = computeRpn(s, o, d);
      const payload = {
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
        rpn,
        risk_level: riskLevelFromRpn(rpn),
        recommended_actions: "Define mitigation",
        action_owner: null,
        action_due: null,
        action_status: "Open" as ActionStatus,
        residual_severity_s: null,
        residual_occurrence_o: null,
        residual_detection_d: null,
        residual_rpn: null,
        created_at: now,
      };

      const { data, error } = await supabase
        .from("fmea_rows")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      setFmeaRows((prev) => [...prev, data as FmeaRow]);
      await addRiskAudit(current.id, "fmea_row_added", { row_id: data?.id });
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
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-700 text-left">
                    <th className="py-2 pr-2">Phase</th>
                    <th className="py-2 pr-2">Prozess</th>
                    <th className="py-2 pr-2">Failure Mode</th>
                    <th className="py-2 pr-2">Effect</th>
                    <th className="py-2 pr-2">Cause</th>
                    <th className="py-2 pr-2">Controls</th>
                    <th className="py-2 pr-2">S</th>
                    <th className="py-2 pr-2">O</th>
                    <th className="py-2 pr-2">D</th>
                    <th className="py-2 pr-2">RPN</th>
                    <th className="py-2 pr-2">Risk</th>
                    <th className="py-2 pr-2">Actions</th>
                    <th className="py-2 pr-2">Owner</th>
                    <th className="py-2 pr-2">Due</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Residual S/O/D</th>
                    <th className="py-2 pr-2">Residual RPN</th>
                  </tr>
                </thead>
                <tbody>
                  {fmeaRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800">
                      <td className="py-2 pr-2">
                        <select
                          className="bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.lifecycle_phase}
                          onChange={(e) =>
                            updateFmeaRow(row.id, {
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
                      <td className="py-2 pr-2">
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.process_step}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, process_step: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={() =>
                            updateFmeaRow(row.id, {
                              process_step: row.process_step,
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.failure_mode}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, failure_mode: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={() =>
                            updateFmeaRow(row.id, { failure_mode: row.failure_mode })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.effect}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, effect: e.target.value } : r
                              )
                            )
                          }
                          onBlur={() => updateFmeaRow(row.id, { effect: row.effect })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.cause}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, cause: e.target.value } : r
                              )
                            )
                          }
                          onBlur={() => updateFmeaRow(row.id, { cause: row.cause })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.existing_controls}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, existing_controls: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={() =>
                            updateFmeaRow(row.id, {
                              existing_controls: row.existing_controls,
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="w-14 bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.severity_s}
                          onChange={(e) =>
                            updateFmeaRow(row.id, {
                              severity_s: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="w-14 bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.occurrence_o}
                          onChange={(e) =>
                            updateFmeaRow(row.id, {
                              occurrence_o: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="w-14 bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.detection_d}
                          onChange={(e) =>
                            updateFmeaRow(row.id, {
                              detection_d: Number(e.target.value),
                            })
                          }
                        />
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
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.recommended_actions}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, recommended_actions: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={() =>
                            updateFmeaRow(row.id, {
                              recommended_actions: row.recommended_actions,
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.action_owner || ""}
                          onChange={(e) =>
                            setFmeaRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, action_owner: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={() =>
                            updateFmeaRow(row.id, { action_owner: row.action_owner })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          className="bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.action_due || ""}
                          onChange={(e) =>
                            updateFmeaRow(row.id, { action_due: e.target.value })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          className="bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                          value={row.action_status}
                          onChange={(e) =>
                            updateFmeaRow(row.id, {
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
                      <td className="py-2 pr-2">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-12 bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                            value={row.residual_severity_s ?? ""}
                            onChange={(e) =>
                              updateFmeaRow(row.id, {
                                residual_severity_s: Number(e.target.value),
                              })
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-12 bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                            value={row.residual_occurrence_o ?? ""}
                            onChange={(e) =>
                              updateFmeaRow(row.id, {
                                residual_occurrence_o: Number(e.target.value),
                              })
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-12 bg-slate-900/60 border border-slate-700 rounded px-1 py-0.5"
                            value={row.residual_detection_d ?? ""}
                            onChange={(e) =>
                              updateFmeaRow(row.id, {
                                residual_detection_d: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        {row.residual_rpn ?? "–"}
                      </td>
                    </tr>
                  ))}
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
