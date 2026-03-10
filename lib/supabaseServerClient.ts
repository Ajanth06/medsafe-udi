import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    const missing: string[] = [];
    if (!supabaseUrl) {
      missing.push("NEXT_PUBLIC_SUPABASE_URL (oder SUPABASE_URL)");
    }
    if (!serviceRoleKey) {
      missing.push("SUPABASE_SERVICE_ROLE_KEY (oder SUPABASE_SERVICE_KEY)");
    }
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
