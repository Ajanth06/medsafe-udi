const DEFAULT_ADMIN_EMAILS = ["ajanth.r@live.de"];

function normalizeEmailList(rawValue?: string | null) {
  return (rawValue || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedAdminEmails() {
  const configured = [
    ...normalizeEmailList(process.env.MEDSAFE_ADMIN_EMAILS),
    ...normalizeEmailList(process.env.NEXT_PUBLIC_MEDSAFE_ADMIN_EMAILS),
  ];

  return Array.from(
    new Set(
      configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS
    )
  );
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return getAllowedAdminEmails().includes(email.trim().toLowerCase());
}
