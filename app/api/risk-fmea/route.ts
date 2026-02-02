import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseServerClient";
import {
  clampScore,
  deriveRow,
  validateRow,
  type FmeaRowInput,
} from "../../../lib/risk/fmea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buildDiff = (before: any, after: any) => {
  if (!before) {
    return { before: null, after, changes: null };
  }
  const changes: Record<string, { before: any; after: any }> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes[key] = { before: before[key], after: after[key] };
    }
  }
  return { before, after, changes };
};

const upsertRow = async (payload: any, rowId?: string) => {
  return rowId
    ? supabaseAdmin
        .from("risk_fmea_rows")
        .update(payload)
        .eq("id", rowId)
        .select("*")
        .single()
    : supabaseAdmin.from("risk_fmea_rows").insert(payload).select("*").single();
};

const logAuditDiff = async (
  rowId: string,
  action: "insert" | "update" | "delete",
  changedBy: string,
  before: any,
  after: any
) => {
  const diff = buildDiff(before, after);
  return supabaseAdmin.from("risk_audit_log").insert({
    row_id: rowId,
    action,
    changed_by: changedBy,
    diff,
    changed_at: new Date().toISOString(),
  });
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const row = body?.row as FmeaRowInput | undefined;
    const changedBy = body?.changed_by as string | undefined;

    if (!row?.project_id) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400 }
      );
    }
    if (!changedBy) {
      return NextResponse.json(
        { error: "changed_by is required" },
        { status: 400 }
      );
    }

    const s = clampScore(Number(row.s));
    const o = clampScore(Number(row.o));
    const d = clampScore(Number(row.d));

    const normalized: FmeaRowInput = {
      ...row,
      s,
      o,
      d,
    };

    const derived = deriveRow(normalized);
    const payload = {
      ...normalized,
      rpn: derived.rpn,
      risk_level: derived.risk_level,
      acceptability: derived.acceptability,
      residual_rpn: derived.residual_rpn,
      updated_at: new Date().toISOString(),
    };

    const errors = validateRow(payload);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { error: "validation_failed", errors },
        { status: 400 }
      );
    }

    let before: any = null;
    if (row.id) {
      const { data: existing, error } = await supabaseAdmin
        .from("risk_fmea_rows")
        .select("*")
        .eq("id", row.id)
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      before = existing;
    }

    const action = row.id ? "update" : "insert";

    const { data, error } = await upsertRow(payload, row.id);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "upsert_failed" },
        { status: 500 }
      );
    }

    const { error: auditError } = await logAuditDiff(
      data.id,
      action,
      changedBy,
      before,
      data
    );

    if (auditError) {
      return NextResponse.json(
        { error: auditError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ row: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "unexpected_error" },
      { status: 500 }
    );
  }
}
