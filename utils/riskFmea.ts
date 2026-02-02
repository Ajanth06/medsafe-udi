export type RiskLevel = "High" | "Medium" | "Low";
export type Acceptability = "Nicht akzeptabel" | "Review" | "Akzeptabel";
export type ActionStatus = "Open" | "In Progress" | "Done";
export type ReassessmentReason =
  | "PMS data"
  | "Complaint trend"
  | "Design change"
  | "Other";

export type FmeaRowDb = {
  id?: string;
  risk_analysis_id: string;
  lifecycle_phase: string;
  process_step: string;
  failure_mode: string;
  effect: string;
  cause: string;
  existing_controls: string;
  severity_s: number;
  occurrence_o: number;
  detection_d: number;
  rpn?: number | null;
  risk_level?: RiskLevel | null;
  recommended_actions: string;
  action_owner: string | null;
  action_due: string | null;
  action_status: ActionStatus;
  residual_severity_s: number | null;
  residual_occurrence_o: number | null;
  residual_detection_d: number | null;
  residual_rpn?: number | null;
  reassessment_enabled: boolean;
  reassessment_reason: ReassessmentReason | null;
  justification_text: string | null;
  approved_by: string | null;
  approval_date: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export const clampScore = (value: number) => {
  if (Number.isNaN(value)) return 1;
  return Math.min(10, Math.max(1, Math.round(value)));
};

export const computeRPN = (s: number, o: number, d: number) =>
  clampScore(s) * clampScore(o) * clampScore(d);

export const computeResidualRPN = (
  residual_s: number | null,
  residual_o: number | null,
  residual_d: number | null
) => {
  if (
    residual_s === null ||
    residual_o === null ||
    residual_d === null
  ) {
    return null;
  }
  return computeRPN(residual_s, residual_o, residual_d);
};

export const getRiskLevel = (rpn: number): RiskLevel => {
  if (rpn >= 150) return "High";
  if (rpn >= 60) return "Medium";
  return "Low";
};

export const getAcceptability = (level: RiskLevel): Acceptability => {
  switch (level) {
    case "High":
      return "Nicht akzeptabel";
    case "Medium":
      return "Review";
    default:
      return "Akzeptabel";
  }
};

export const computeDerived = (row: FmeaRowDb) => {
  const rpn = computeRPN(row.severity_s, row.occurrence_o, row.detection_d);
  const risk_level = getRiskLevel(rpn);
  const residual_rpn = computeResidualRPN(
    row.residual_severity_s,
    row.residual_occurrence_o,
    row.residual_detection_d
  );

  return { rpn, risk_level, residual_rpn };
};

export type RowErrors = Record<string, string>;

export const validateRow = (row: FmeaRowDb): RowErrors => {
  const errors: RowErrors = {};
  const derived = computeDerived(row);
  const acceptability = getAcceptability(derived.risk_level);

  if (row.severity_s < 1 || row.severity_s > 10) {
    errors.severity_s = "Severity muss zwischen 1 und 10 liegen.";
  }
  if (row.occurrence_o < 1 || row.occurrence_o > 10) {
    errors.occurrence_o = "Occurrence muss zwischen 1 und 10 liegen.";
  }
  if (row.detection_d < 1 || row.detection_d > 10) {
    errors.detection_d = "Detection muss zwischen 1 und 10 liegen.";
  }
  if (
    row.residual_severity_s !== null &&
    (row.residual_severity_s < 1 || row.residual_severity_s > 10)
  ) {
    errors.residual_severity_s = "Residual S muss zwischen 1 und 10 liegen.";
  }
  if (
    row.residual_occurrence_o !== null &&
    (row.residual_occurrence_o < 1 || row.residual_occurrence_o > 10)
  ) {
    errors.residual_occurrence_o = "Residual O muss zwischen 1 und 10 liegen.";
  }
  if (
    row.residual_detection_d !== null &&
    (row.residual_detection_d < 1 || row.residual_detection_d > 10)
  ) {
    errors.residual_detection_d = "Residual D muss zwischen 1 und 10 liegen.";
  }

  if (
    derived.residual_rpn !== null &&
    derived.residual_rpn > derived.rpn &&
    !row.reassessment_enabled
  ) {
    errors.residual_rpn =
      "Residual risk cannot be higher than initial risk. Add justification or revise controls.";
  }

  if (row.reassessment_enabled) {
    const allowedReasons: ReassessmentReason[] = [
      "PMS data",
      "Complaint trend",
      "Design change",
      "Other",
    ];
    if (!row.reassessment_reason) {
      errors.reassessment_reason = "Reassessment reason is required.";
    } else if (!allowedReasons.includes(row.reassessment_reason)) {
      errors.reassessment_reason = "Reassessment reason is invalid.";
    }
    if (!row.justification_text || row.justification_text.trim().length < 20) {
      errors.justification_text = "Justification must be at least 20 characters.";
    }
    if (!row.approved_by || !row.approved_by.trim()) {
      errors.approved_by = "Approved by is required.";
    }
    if (!row.approval_date) {
      errors.approval_date = "Approval date is required.";
    }
  }

  if (derived.risk_level === "High" || acceptability === "Nicht akzeptabel") {
    if (!row.recommended_actions || !row.recommended_actions.trim()) {
      errors.recommended_actions = "Recommended actions are required.";
    }
    if (!row.action_owner) {
      errors.action_owner = "Action owner is required.";
    }
    if (!row.action_due) {
      errors.action_due = "Action due date is required.";
    }
    if (row.action_status === "Done") {
      errors.action_status = "Action status cannot be Done for High risk.";
    }
  }

  return errors;
};
