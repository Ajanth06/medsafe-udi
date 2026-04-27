import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabasePublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body?.email?.trim().toLowerCase() || "";

    if (!email) {
      return NextResponse.json({ error: "E-Mail fehlt." }, { status: 400 });
    }

    const requestUrl = new URL(req.url);
    const origin = req.headers.get("origin") || requestUrl.origin;
    const redirectTo = `${origin}/reset-password`;
    const isLocalhost =
      requestUrl.hostname === "localhost" ||
      requestUrl.hostname === "127.0.0.1" ||
      requestUrl.hostname === "::1";

    if (isLocalhost) {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

      if (linkError || !linkData?.properties?.action_link) {
        return NextResponse.json(
          { error: linkError?.message || "Recovery-Link konnte nicht erzeugt werden." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          fallback: "local_recovery_link",
          recoveryLink: linkData.properties.action_link,
        },
        { status: 200 }
      );
    }

    const supabase = getSupabasePublicClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("Reset password route error:", err);
    return NextResponse.json(
      { error: err?.message || "Passwort-Reset konnte nicht gestartet werden." },
      { status: 500 }
    );
  }
}
