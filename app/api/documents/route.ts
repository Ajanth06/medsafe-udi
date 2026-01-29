import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    const storagePath = body?.storagePath as string | undefined;

    if (!id || !storagePath) {
      return NextResponse.json(
        { error: "Dokument-ID oder Storage-Pfad fehlt." },
        { status: 400 }
      );
    }

    const { data: docRow, error: docError } = await supabaseAdmin
      .from("docs")
      .select("*")
      .eq("id", id)
      .single();
    if (docError || !docRow) {
      return NextResponse.json(
        { error: "Dokument wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const { error: storageError } = await supabaseAdmin.storage
      .from("docs")
      .remove([storagePath]);

    if (storageError) {
      console.error("Storage Delete Error:", storageError);
      return NextResponse.json(
        { error: "Datei konnte nicht aus dem Storage gelöscht werden." },
        { status: 500 }
      );
    }

    const { error: dbError } = await supabaseAdmin.from("docs").delete().eq("id", id);
    if (dbError) {
      console.error("Docs Delete Error:", dbError);
      return NextResponse.json(
        { error: "Dokumenteintrag konnte nicht gelöscht werden." },
        { status: 500 }
      );
    }

    if (docRow.device_id) {
      const auditPayload = {
        device_id: docRow.device_id,
        action: "document_deleted",
        message: `Dokument "${docRow.name}" gelöscht.`,
        timestamp: new Date().toISOString(),
      };
      const { error: auditError } = await supabaseAdmin
        .from("audit_log")
        .insert(auditPayload);
      if (auditError) {
        console.error("Audit Insert Error:", auditError);
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Delete Error:", err);
    return NextResponse.json(
      { error: "Unerwarteter Fehler beim Löschen." },
      { status: 500 }
    );
  }
}
