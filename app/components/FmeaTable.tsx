"use client";

import React, { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  computeDerived,
  getAcceptability,
  validateRow,
  type Acceptability,
  type ActionStatus,
  type FmeaRowDb,
  type ReassessmentReason,
  type RiskLevel,
} from "../../utils/riskFmea";

type FmeaRowUi = FmeaRowDb & { acceptability: Acceptability };

type FmeaTableProps = {
  riskAnalysisId: string;
  initialRows: FmeaRowDb[];
};

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, idx) => idx + 1);
const OWNER_ROLES = [
  "Quality Manager",
  "Design Engineering",
  "Manufacturing",
  "Service Lead",
  "Regulatory",
];
const ACTION_STATUSES: ActionStatus[] = ["Open", "In Progress", "Done"];
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

const badgeClassForAcceptability = (status: Acceptability) => {
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

const toUiRow = (row: FmeaRowDb): FmeaRowUi => {
  const derived = computeDerived(row);
  return {
    ...row,
    rpn: derived.rpn,
    risk_level: derived.risk_level,
    residual_rpn: derived.residual_rpn,
    acceptability: getAcceptability(derived.risk_level),
  };
};

const toDbRow = (row: FmeaRowUi): FmeaRowDb => {
  const { acceptability, ...rest } = row;
  return rest;
};

export default function FmeaTable({ riskAnalysisId, initialRows }: FmeaTableProps) {
  const [rows, setRows] = useState<FmeaRowUi[]>(
    initialRows.map((row) => toUiRow(row))
  );
  const [errorsById, setErrorsById] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [message, setMessage] = useState<string | null>(null);

  const updateRow = (rowId: string, patch: Partial<FmeaRowUi>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, ...patch } as FmeaRowUi;
        const derived = computeDerived(next);
        return {
          ...next,
          rpn: derived.rpn,
          risk_level: derived.risk_level,
          residual_rpn: derived.residual_rpn,
          acceptability: getAcceptability(derived.risk_level),
        };
      })
    );
    setErrorsById((prev) => ({ ...prev, [rowId]: {} }));
  };

  const saveRow = async (row: FmeaRowUi) => {
    const dbRow = toDbRow(row);
    const errors = validateRow(dbRow);
    if (Object.keys(errors).length > 0) {
      setErrorsById((prev) => ({ ...prev, [row.id!]: errors }));
      setMessage(Object.values(errors)[0]);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Bitte einloggen, um zu speichern.");
      return;
    }

    const response = await fetch("/api/risk/fmea", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...dbRow,
        risk_analysis_id: riskAnalysisId,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload?.error || "Speichern fehlgeschlagen.");
      if (payload?.errors) {
        setErrorsById((prev) => ({ ...prev, [row.id!]: payload.errors }));
      }
      return;
    }

    const payload = await response.json();
    const saved = toUiRow(payload.row as FmeaRowDb);
    setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    setMessage("Gespeichert.");
  };

  const deleteRow = async (rowId: string) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Bitte einloggen, um zu löschen.");
      return;
    }

    const response = await fetch(`/api/risk/fmea?id=${rowId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload?.error || "Löschen fehlgeschlagen.");
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== rowId));
    setMessage("Gelöscht.");
  };

  const hasRows = useMemo(() => rows.length > 0, [rows.length]);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">FMEA Editor</h2>
      </div>

      {message && (
        <div className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-xs">
          {message}
        </div>
      )}

      {!hasRows ? (
        <div className="text-sm text-slate-400">Keine FMEA-Zeilen vorhanden.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
          <table className="min-w-[1400px] w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="py-2 pr-2 min-w-[180px]">Effect</th>
                <th className="py-2 pr-2 min-w-[180px]">Cause</th>
                <th className="py-2 pr-2 min-w-[200px]">Controls</th>
                <th className="py-2 pr-2">S</th>
                <th className="py-2 pr-2">O</th>
                <th className="py-2 pr-2">D</th>
                <th className="py-2 pr-2">RPN</th>
                <th className="py-2 pr-2">Risk</th>
                <th className="py-2 pr-2">Akzeptanz</th>
                <th className="py-2 pr-2 min-w-[180px]">Actions</th>
                <th className="py-2 pr-2">Owner</th>
                <th className="py-2 pr-2">Due</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2 min-w-[260px]">Residual S/O/D</th>
                <th className="py-2 pr-2">Residual RPN</th>
                <th className="py-2 pr-2">Save</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const errors = errorsById[row.id!] || {};
                const residualError =
                  errors.residual_rpn ||
                  errors.residual_severity_s ||
                  errors.residual_occurrence_o ||
                  errors.residual_detection_d;
                return (
                  <tr key={row.id} className="border-b border-slate-800 align-top">
                    <td className="py-2 pr-2 min-w-[180px]">
                      <input
                        className={fieldClass(Boolean(errors.effect), "w-full")}
                        value={row.effect}
                        title={errors.effect}
                        onChange={(e) =>
                          updateRow(row.id!, { effect: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-2 min-w-[180px]">
                      <input
                        className={fieldClass(Boolean(errors.cause), "w-full")}
                        value={row.cause}
                        title={errors.cause}
                        onChange={(e) =>
                          updateRow(row.id!, { cause: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-2 min-w-[200px]">
                      <input
                        className={fieldClass(Boolean(errors.existing_controls), "w-full")}
                        value={row.existing_controls}
                        title={errors.existing_controls}
                        onChange={(e) =>
                          updateRow(row.id!, { existing_controls: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        className={fieldClass(Boolean(errors.severity_s), "w-14")}
                        value={row.severity_s}
                        title={errors.severity_s}
                        onChange={(e) =>
                          updateRow(row.id!, { severity_s: Number(e.target.value) })
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
                          updateRow(row.id!, { occurrence_o: Number(e.target.value) })
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
                          updateRow(row.id!, { detection_d: Number(e.target.value) })
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
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${badgeClassForAcceptability(
                          row.acceptability
                        )}`}
                      >
                        {row.acceptability}
                      </span>
                    </td>
                    <td className="py-2 pr-2 min-w-[180px]">
                      <input
                        className={fieldClass(Boolean(errors.recommended_actions), "w-full")}
                        value={row.recommended_actions}
                        title={errors.recommended_actions}
                        onChange={(e) =>
                          updateRow(row.id!, { recommended_actions: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        className={fieldClass(Boolean(errors.action_owner), "w-[170px]")}
                        value={row.action_owner ?? ""}
                        title={errors.action_owner}
                        onChange={(e) =>
                          updateRow(row.id!, {
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
                          updateRow(row.id!, {
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
                          updateRow(row.id!, {
                            action_status: e.target.value as ActionStatus,
                          })
                        }
                      >
                        {ACTION_STATUSES.map((status) => (
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
                            updateRow(row.id!, {
                              residual_severity_s: e.target.value
                                ? Number(e.target.value)
                                : null,
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
                            updateRow(row.id!, {
                              residual_occurrence_o: e.target.value
                                ? Number(e.target.value)
                                : null,
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
                            updateRow(row.id!, {
                              residual_detection_d: e.target.value
                                ? Number(e.target.value)
                                : null,
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
                            updateRow(row.id!, {
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
                              updateRow(row.id!, {
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
                              updateRow(row.id!, {
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
                              updateRow(row.id!, { approved_by: e.target.value })
                            }
                          />
                          <input
                            type="date"
                            className={fieldClass(Boolean(errors.approval_date), "w-full")}
                            value={row.approval_date ?? ""}
                            title={errors.approval_date}
                            onChange={(e) =>
                              updateRow(row.id!, {
                                approval_date: e.target.value || null,
                              })
                            }
                          />
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2">{row.residual_rpn ?? "–"}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => saveRow(row)}
                          className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-100"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => deleteRow(row.id!)}
                          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-100"
                        >
                          Delete
                        </button>
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
  );
}
