export const TRASH_RETENTION_DAYS = 30;

export function getTrashDaysRemaining(deletedAt?: string | null): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const deletedMs = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedMs)) return TRASH_RETENTION_DAYS;
  const expiresMs = deletedMs + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = expiresMs - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export function isTrashExpired(deletedAt?: string | null): boolean {
  return getTrashDaysRemaining(deletedAt) <= 0;
}

export function isActiveDevice<T extends { deletedAt?: string | null }>(device: T) {
  return !device.deletedAt;
}
