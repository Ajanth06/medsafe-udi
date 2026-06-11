import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/apiAuth";
import { getSupabaseAdmin } from "../../../../lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");
    const fallbackUrl = searchParams.get("url");
    const format = searchParams.get("format");

    if (!cid || !cid.trim()) {
      if (fallbackUrl && fallbackUrl.trim()) {
        return NextResponse.redirect(fallbackUrl);
      }
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

    const wantsJson =
      format === "json" ||
      req.headers.get("accept")?.includes("application/json");

    if (wantsJson) {
      return NextResponse.json({ signedUrl: data.signedUrl }, { status: 200 });
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
