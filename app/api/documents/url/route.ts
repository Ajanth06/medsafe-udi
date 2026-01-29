import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Pfad fehlt." }, { status: 400 });
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from("docs")
    .createSignedUrl(path, 60 * 60 * 24);

  if (!signedError && signed?.signedUrl) {
    return NextResponse.json({ url: signed.signedUrl }, { status: 200 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("docs")
    .getPublicUrl(path);

  if (publicUrlData?.publicUrl) {
    return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 200 });
  }

  return NextResponse.json(
    { error: "URL konnte nicht erzeugt werden." },
    { status: 500 }
  );
}
