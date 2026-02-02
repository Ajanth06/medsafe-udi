export type RiskLevel = "High" | "Medium" | "Low";
export type Acceptability = "Nicht akzeptabel" | "Review" | "Akzeptabel";
export type ActionStatus = "Open" | "In Progress" | "Closed";
export type ReassessmentReason =
  | "PMS data"
  | "complaint trend"
  | "design change"
  | "other";

export type FmeaRowInput = {
  id?: string;
  project_id: string;
  effect: string;
  cause: string;
  controls: string;
  s: number;
  o: number;
  d: number;
  rpn?: number | null;
  risk_level?: RiskLevel | null;
  acceptability?: Acceptability | null;
  actions: string;
  owner_role: string | null;
  due_date: string | null;
  status: ActionStatus;
  residual_s: number | null;
  residual_o: number | null;
  residual_d: number | null;
  residual_rpn?: number | null;
  reassessment_enabled: boolean;
  reassessment_reason: ReassessmentReason | null;
  justification_text: string | null;
  approved_by: string | null;
  approval_date: string | null;
};

export const clampScore = (value: number) => {
  if (Number.isNaN(value)) return 1;
  return Math.min(10, Math.max(1, Math.round(value)));
};

export const computeRPN = (s: number, o: number, d: number) =>
  clampScore(s) * clampScore(o) * clampScore(d);

export const getRiskLevel = (rpn: number): RiskLevel => {
  if (rpn >= 150) return "High";
  if (rpn >= 60) return "Medium";
  return "Low";
};

export const getAcceptability = (riskLevel: RiskLevel): Acceptability => {
  switch (riskLevel) {
    case "High":
      return "Nicht akzeptabel";
    case "Medium":
      return "Review";
    default:
      return "Akzeptabel";
  }
};

export const deriveRow = (row: FmeaRowInput) => {
  const rpn = computeRPN(row.s, row.o, row.d);
  const riskLevel = getRiskLevel(rpn);
  const acceptability = getAcceptability(riskLevel);

  let residualRpn: number | null = null;
  if (
    row.residual_s !== null &&
    row.residual_o !== null &&
    row.residual_d !== null
  ) {
    residualRpn = computeRPN(row.residual_s, row.residual_o, row.residual_d);
  }

  return {
    rpn,
    risk_level: riskLevel,
    acceptability,
    residual_rpn: residualRpn,
  };
};

export type RowValidationErrors = Record<string, string>;

export const validateRow = (row: FmeaRowInput): RowValidationErrors => {
  const errors: RowValidationErrors = {};

  const s = clampScore(row.s);
  const o = clampScore(row.o);
  const d = clampScore(row.d);
  if (s < 1 || s > 10) errors.s = "S muss zwischen 1 und 10 liegen.";
  if (o < 1 || o > 10) errors.o = "O muss zwischen 1 und 10 liegen.";
  if (d < 1 || d > 10) errors.d = "D muss zwischen 1 und 10 liegen.";

  const residualValues = [row.residual_s, row.residual_o, row.residual_d];
  const residualFilled = residualValues.filter((v) => v !== null).length;
  if (residualFilled > 0 && residualFilled < 3) {
    errors.residual_group = "Residual S/O/D müssen vollständig sein.";
  }

  const { rpn, acceptability, residual_rpn } = deriveRow(row);

  if (
    residual_rpn !== null &&
    residual_rpn > rpn &&
    !row.reassessment_enabled
  ) {
    errors.residual_rpn =
      "Residual risk cannot be higher than initial risk. Add justification or revise controls.";
  }

  if (row.reassessment_enabled) {
    if (!row.reassessment_reason) {
      errors.reassessment_reason = "Re-assessment Grund auswählen.";
    }
    if (!row.justification_text || row.justification_text.trim().length < 20) {
      errors.justification_text =
        "Justification muss mindestens 20 Zeichen haben.";
    }
    if (!row.approved_by) {
      errors.approved_by = "Quality Approval erforderlich.";
    }
    if (!row.approval_date) {
      errors.approval_date = "Approval Date erforderlich.";
    }
  }

  if (acceptability === "Nicht akzeptabel") {
    if (!row.actions || !row.actions.trim()) {
      errors.actions = "Actions erforderlich (nicht akzeptabel).";
    }
    if (!row.owner_role) {
      errors.owner_role = "Owner erforderlich (nicht akzeptabel).";
    }
    if (!row.due_date) {
      errors.due_date = "Due Date erforderlich (nicht akzeptabel).";
    }
    if (row.status === "Closed") {
      errors.status = "Status darf nicht Closed sein (nicht akzeptabel).";
    }
  }

  return errors;
};
