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
    const path = deviceId
      ? `devices/${deviceId}/${Date.now()}-${safeName}`
      : `general/${Date.now()}-${safeName}`;

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

    // Signierte URL (z.B. 1 Stunde gültig)
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("docs")
      .createSignedUrl(path, 60 * 60);

    if (signedError || !signed?.signedUrl) {
      console.error("Signed URL Fehler:", signedError);
      return NextResponse.json(
        { error: "Signierte URL konnte nicht erzeugt werden" },
        { status: 500 }
      );
    }

    // Frontend erwartet { cid, url }
    return NextResponse.json(
      {
        cid: path,          // Storage-Pfad im Bucket
        url: signed.signedUrl, // signierte HTTPS-URL zum Öffnen
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
