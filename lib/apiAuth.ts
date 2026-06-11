import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  return { supabaseUrl, supabaseAnonKey };
}

export function createRouteHandlerClient(req: Request) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
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
}

function extractAccessTokenFromCookies(cookieHeader: string): string | null {
  if (!cookieHeader) return null;

  const chunks = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("-auth-token"))
    .map((part) => {
      const eq = part.indexOf("=");
      return eq >= 0 ? part.slice(eq + 1) : "";
    })
    .filter(Boolean);

  if (chunks.length === 0) return null;

  try {
    const raw = chunks.join("");
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(
      decoded.startsWith("base64-") ? atob(decoded.slice(7)) : decoded
    ) as { access_token?: string };
    return parsed.access_token || null;
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: Request
): Promise<{ user: User; supabase: ReturnType<typeof createRouteHandlerClient> } | NextResponse> {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase-Konfiguration fehlt." },
      { status: 500 }
    );
  }

  let authHeader = req.headers.get("authorization") || "";

  if (!authHeader) {
    const token = extractAccessTokenFromCookies(req.headers.get("cookie") || "");
    if (token) {
      authHeader = `Bearer ${token}`;
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  return { user: data.user, supabase };
}
