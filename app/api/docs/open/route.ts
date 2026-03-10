import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");
    const fallbackUrl = searchParams.get("url");

    if (!cid || !cid.trim()) {
      return NextResponse.json({ error: "cid fehlt." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from("docs")
      .createSignedUrl(cid, 60 * 60);

    if (error || !data?.signedUrl) {
      if (fallbackUrl) return NextResponse.redirect(fallbackUrl);
      return NextResponse.json(
        { error: "Dokument konnte nicht geöffnet werden." },
        { status: 500 }
      );
    }

    return NextResponse.redirect(data.signedUrl);
  } catch (err) {
    console.error("Docs open error:", err);
    return NextResponse.json(
      { error: "Unerwarteter Fehler beim Öffnen." },
      { status: 500 }
    );
  }
}
