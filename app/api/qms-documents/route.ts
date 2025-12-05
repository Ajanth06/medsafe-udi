// app/api/qms-documents/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseServerClient";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const documentKey = formData.get("documentKey") as string | null;
    const revision = (formData.get("revision") as string | null) || "R1";
    const createdBy = formData.get("userId") as string | null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Keine Datei übergeben." },
        { status: 400 }
      );
    }

    if (!documentKey || !documentKey.trim()) {
      return NextResponse.json(
        { error: "documentKey fehlt." },
        { status: 400 }
      );
    }

    const anyFile = file as any;
    const originalName: string =
      typeof anyFile.name === "string"
        ? anyFile.name
        : `upload-${Date.now()}.bin`;

    const mimeType: string =
      typeof anyFile.type === "string" && anyFile.type.length > 0
        ? anyFile.type
        : "application/octet-stream";

    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sizeBytes = buffer.byteLength;

    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // letzte Version holen
    const { data: existing, error: versionErr } = await supabaseAdmin
      .from("documents")
      .select("version")
      .eq("document_key", documentKey)
      .order("version", { ascending: false })
      .limit(1);

    if (versionErr) {
      console.error("Version-Fehler:", versionErr);
      return NextResponse.json(
        { error: "Fehler beim Lesen der Version." },
        { status: 500 }
      );
    }

    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    const path = `${documentKey}/v${nextVersion}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload-Error:", uploadError);
      return NextResponse.json(
        { error: "Upload zu Supabase Storage fehlgeschlagen." },
        { status: 500 }
      );
    }

    // alte Versionen dieses Keys auf is_current = false
    const { error: updateOldErr } = await supabaseAdmin
      .from("documents")
      .update({ is_current: false })
      .eq("document_key", documentKey);

    if (updateOldErr) {
      console.error("Fehler beim Aktualisieren alter Versionen:", updateOldErr);
    }

    const insertPayload = {
      document_key: documentKey,
      version: nextVersion,
      revision,
      file_name: originalName,
      file_path: path,
      sha256,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_by: createdBy || null,
      is_current: true,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("documents")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr) {
      console.error("Insert-Error documents:", insertErr);
      return NextResponse.json(
        { error: "Dokument konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        doc: inserted,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("QMS-Upload Fehler:", err);
    return NextResponse.json(
      { error: "Unerwarteter Fehler beim Upload." },
      { status: 500 }
    );
  }
}
