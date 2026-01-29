// app/api/upload/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const deviceId = formData.get("deviceId") as string | null;
    const dhrId = formData.get("dhrId") as string | null;
    const dmrId = formData.get("dmrId") as string | null;
    const name = formData.get("name") as string | null;
    const docType = formData.get("docType") as string | null;
    const version = formData.get("version") as string | null;
    const revision = formData.get("revision") as string | null;
    const status = formData.get("status") as string | null;
    const approvedBy = formData.get("approvedBy") as string | null;

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId fehlt – Upload benötigt ein Gerät." },
        { status: 400 }
      );
    }

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Keine Datei übergeben" },
        { status: 400 }
      );
    }

    // Name aus dem hochgeladenen File ziehen
    const anyFile = file as any;
    const originalName: string =
      typeof anyFile.name === "string"
        ? anyFile.name
        : `upload-${Date.now()}.pdf`;

    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");

    // Pfad im Bucket bauen: optional nach Gerät gruppieren
    const uniqueToken = `${Date.now()}-${crypto.randomUUID()}`;
    const path = deviceId
      ? `devices/${deviceId}/${uniqueToken}-${safeName}`
      : `general/${uniqueToken}-${safeName}`;

    // Blob -> Buffer (für Node)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // In Bucket "docs" hochladen
    const { error: uploadError } = await supabaseAdmin.storage
      .from("docs")
      .upload(path, buffer, {
        contentType: anyFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload-Error:", uploadError);
      return NextResponse.json(
        { error: "Upload zu Supabase fehlgeschlagen" },
        { status: 500 }
      );
    }

    let resolvedUrl: string | null = null;
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("docs")
      .createSignedUrl(path, 60 * 60 * 24);
    if (!signedError && signed?.signedUrl) {
      resolvedUrl = signed.signedUrl;
    } else {
      const { data: publicUrlData } = supabaseAdmin.storage
        .from("docs")
        .getPublicUrl(path);
      resolvedUrl = publicUrlData?.publicUrl ?? null;
    }

    let columnSet: Set<string> | null = null;
    const { data: columnRows, error: columnErr } = await supabaseAdmin
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "docs");
    if (!columnErr && columnRows) {
      columnSet = new Set(columnRows.map((row: any) => row.column_name));
    }

    const createdAt = new Date().toISOString();
    const payload: Record<string, any> = {
      device_id: deviceId,
      dhr_id: dhrId,
      dmr_id: dmrId,
      name: name || originalName,
      doc_type: docType,
      category: docType,
      version,
      revision,
      doc_status: status,
      approved_by: approvedBy,
      storage_path: path,
      cid: path,
      url: resolvedUrl,
      created_at: createdAt,
    };

    const filteredPayload =
      columnSet === null
        ? payload
        : Object.fromEntries(
            Object.entries(payload).filter(([key]) => columnSet!.has(key))
          );

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("docs")
      .insert(filteredPayload)
      .select("*")
      .single();

    if (insertError) {
      console.error("Docs Insert Error:", insertError);
      await supabaseAdmin.storage.from("docs").remove([path]);
      return NextResponse.json(
        { error: "Dokument konnte nicht in der Datenbank gespeichert werden." },
        { status: 500 }
      );
    }

    if (inserted?.device_id) {
      const auditPayload = {
        device_id: inserted.device_id,
        action: "document_uploaded",
        message: `Dokument "${inserted.name}" (${inserted.doc_type || inserted.category || "ohne Typ"}, Version: ${
          inserted.version || "-"
        }, Revision: ${inserted.revision || "-"}, Status: ${
          inserted.doc_status || "Controlled"
        }) hochgeladen.`,
        timestamp: new Date().toISOString(),
      };
      const { error: auditError } = await supabaseAdmin
        .from("audit_log")
        .insert(auditPayload);
      if (auditError) {
        console.error("Audit Insert Error:", auditError);
      }
    }

    return NextResponse.json(
      {
        doc: inserted,
        storagePath: path,
        url: resolvedUrl,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Upload-Fehler:", err);
    return NextResponse.json(
      { error: "Unerwarteter Fehler beim Upload" },
      { status: 500 }
    );
  }
}
