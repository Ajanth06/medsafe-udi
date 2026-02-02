import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeDerived,
  getAcceptability,
  validateRow,
  type FmeaRowDb,
} from "../../../../utils/riskFmea";

const createRouteHandlerClient = (req: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get("authorization") || "";

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
    },
  });
};

const normalizeRow = (row: FmeaRowDb): FmeaRowDb => {
  const toInt = (value: any, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : fallback;
  };

  const toNullableInt = (value: any) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : null;
  };

  return {
    ...row,
    severity_s: toInt(row.severity_s, 1),
    occurrence_o: toInt(row.occurrence_o, 1),
    detection_d: toInt(row.detection_d, 1),
    residual_severity_s: toNullableInt(row.residual_severity_s),
    residual_occurrence_o: toNullableInt(row.residual_occurrence_o),
    residual_detection_d: toNullableInt(row.residual_detection_d),
    action_due: row.action_due || null,
    approval_date: row.approval_date || null,
    reassessment_reason: row.reassessment_reason || null,
    justification_text: row.justification_text || null,
    approved_by: row.approved_by || null,
    action_owner: row.action_owner || null,
  };
};

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient(req);
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as FmeaRowDb;
    if (!body?.risk_analysis_id) {
      return NextResponse.json(
        { error: "risk_analysis_id required" },
        { status: 400 }
      );
    }

    const normalized = normalizeRow(body);
    const derived = computeDerived(normalized);
    const payload = {
      ...normalized,
      rpn: derived.rpn,
      risk_level: derived.risk_level,
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
    if (payload.id) {
      const { data: existing, error } = await supabase
        .from("fmea_rows")
        .select("*")
        .eq("id", payload.id)
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      before = existing;
    }

    const action = payload.id ? "update" : "insert";

    const { data, error } = payload.id
      ? await supabase
          .from("fmea_rows")
          .update(payload)
          .eq("id", payload.id)
          .select("*")
          .single()
      : await supabase
          .from("fmea_rows")
          .insert(payload)
          .select("*")
          .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "upsert_failed" },
        { status: 500 }
      );
    }

    const { error: auditError } = await supabase.from("risk_audit_log").insert({
      risk_analysis_id: data.risk_analysis_id,
      row_id: data.id,
      action,
      before,
      after: data,
      actor: authData.user.email || authData.user.id,
      created_at: new Date().toISOString(),
    });

    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 });
    }

    const acceptability = getAcceptability(derived.risk_level);
    return NextResponse.json(
      { row: { ...data, acceptability } },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "unexpected_error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = createRouteHandlerClient(req);
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("fmea_rows")
      .select("*")
      .eq("id", id)
      .single();
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("fmea_rows")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { error: auditError } = await supabase.from("risk_audit_log").insert({
      risk_analysis_id: existing.risk_analysis_id,
      row_id: existing.id,
      action: "delete",
      before: existing,
      after: null,
      actor: authData.user.email || authData.user.id,
      created_at: new Date().toISOString(),
    });

    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "unexpected_error" },
      { status: 500 }
    );
  }
}
