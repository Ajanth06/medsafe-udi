import type { BatchGroup, Device, DeviceStatus } from "../types/medsafe";

export function buildBatchGroups(devices: Device[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();

  for (const device of devices) {
    const key = `${device.name || "–"}::${device.batch || "–"}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        productName: device.name || "–",
        batch: device.batch || "–",
        quantity: 1,
        udiDi: device.udiDi || "–",
        status: device.status,
        productionDate: device.productionDate,
        createdAt: device.createdAt,
        deviceIds: [device.id],
        archivedCount: device.isArchived ? 1 : 0,
        blockedCount: device.status === "blocked" ? 1 : 0,
      });
      continue;
    }

    existing.quantity += 1;
    existing.deviceIds.push(device.id);
    if (device.isArchived) existing.archivedCount += 1;
    if (device.status === "blocked") existing.blockedCount += 1;
    if (existing.status !== device.status) {
      existing.status = "mixed";
    }
    if (
      new Date(device.createdAt || 0).getTime() >
      new Date(existing.createdAt || 0).getTime()
    ) {
      existing.createdAt = device.createdAt;
    }
    if (!existing.productionDate && device.productionDate) {
      existing.productionDate = device.productionDate;
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

export const DEVICE_STATUS_LABELS: Record<DeviceStatus | "mixed", string> = {
  released: "Freigegeben",
  blocked: "Gesperrt",
  in_production: "In Herstellung",
  recall: "Recall",
  mixed: "Gemischt",
};
