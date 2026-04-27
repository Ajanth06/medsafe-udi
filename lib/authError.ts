export function getAuthErrorMessage(error: { message?: string; status?: number } | null) {
  if (!error) return "Unbekannter Auth-Fehler.";

  const rawMessage = error.message?.trim() || "";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("email not confirmed")) {
    return "Die E-Mail-Adresse ist noch nicht bestätigt.";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "E-Mail oder Passwort ist falsch.";
  }

  if (normalized.includes("email rate limit exceeded")) {
    return "Zu viele Versuche. Bitte kurz warten und dann erneut probieren.";
  }

  if (normalized.includes("signup is disabled")) {
    return "Anmeldung ist derzeit deaktiviert.";
  }

  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Verbindung zu Supabase fehlgeschlagen. Bitte Internet und Projekt-Konfiguration prüfen.";
  }

  if (normalized.includes("auth session missing")) {
    return "Keine aktive Sitzung gefunden.";
  }

  return rawMessage || `Auth-Fehler${error.status ? ` (${error.status})` : ""}.`;
}
