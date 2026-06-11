function decodeJwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseKeyRole(key: string): string | null {
  return decodeJwtRole(key.trim());
}

export function assertServiceRoleKey(key: string): void {
  const role = getSupabaseKeyRole(key);
  if (role === "service_role") return;

  if (role === "anon") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ist der Anon-Key — bitte in Supabase unter Settings → API den service_role Key eintragen."
    );
  }

  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY ist ungültig oder nicht der service_role Key (Supabase → Settings → API)."
  );
}
