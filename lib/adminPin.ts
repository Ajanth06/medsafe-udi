export function getClientAdminPin() {
  return process.env.NEXT_PUBLIC_MEDSAFE_ARCHIVE_PIN?.trim() || "0907";
}

export function getServerAdminPin() {
  return (
    process.env.MEDSAFE_ARCHIVE_PIN?.trim() ||
    process.env.NEXT_PUBLIC_MEDSAFE_ARCHIVE_PIN?.trim() ||
    "0907"
  );
}

export function isValidAdminPin(pin?: string | null) {
  const normalized = (pin || "").trim();
  return normalized.length > 0 && normalized === getServerAdminPin();
}
