import { supabase } from "./supabaseClient";

export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

export async function openAuthenticatedDocument(cid: string, fallbackUrl?: string) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Bitte zuerst anmelden.");
  }

  const params = new URLSearchParams({ cid });
  if (fallbackUrl) {
    params.set("url", fallbackUrl);
  }

  const response = await fetch(`/api/docs/open?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      window.open(location, "_blank", "noopener,noreferrer");
      return;
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Dokument konnte nicht geöffnet werden.");
  }

  if (payload?.signedUrl) {
    window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
  }
}
