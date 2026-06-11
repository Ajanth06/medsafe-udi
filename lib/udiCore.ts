import type { Device, DeviceStatus, ProductUdiRegistryEntry } from "../types/medsafe";

/** EUDAMED Single Registration Number (SRN) — Format DE-MF-0000123456 */
export function generateManufacturerSrn(manufacturerName: string): string {
  const normalized = manufacturerName.trim().toUpperCase();
  if (!normalized) return "DE-MF-0000000000";

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33 + normalized.charCodeAt(i)) >>> 0;
  }
  const suffix = String(hash % 10000000000).padStart(10, "0");
  return `DE-MF-${suffix}`;
}

export function formatManufacturerSrn(value?: string): string {
  const trimmed = (value || "").trim().toUpperCase();
  if (!trimmed) return "";
  if (/^DE-MF-\d{10}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "").slice(-10).padStart(10, "0");
  return `DE-MF-${digits}`;
}

export function slugifyUdiToken(value: string): string {
  const slug = value.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "");
  return slug.replace(/^-+|-+$/g, "") || "DEVICE";
}

/** Erstes Wort der Produktbezeichnung als Familie, z. B. „vario 500“ → VARIO */
export function formatProductFamily(value: string): string {
  const first = value.trim().split(/\s+/)[0];
  return first ? first.toUpperCase() : "";
}

export function deriveProductFamilyFromName(name: string): string {
  return formatProductFamily(name);
}

/** Modellanzeige: Familie + Variante, z. B. VARIO + 500 → VARIO 500 */
export function buildProductModelLabel(family: string, modelOrName: string): string {
  const fam = formatProductFamily(family);
  const raw = modelOrName.trim();
  if (!raw) return fam;
  if (!fam) return raw;
  const rawKey = raw.toLowerCase();
  const famKey = fam.toLowerCase();
  if (rawKey === famKey) return fam;
  if (rawKey.startsWith(`${famKey} `)) {
    const rest = raw.slice(famKey.length).trim();
    return rest ? `${fam} ${rest}` : fam;
  }
  return `${fam} ${raw}`;
}

/** Fortlaufende Seriennummern pro Präfix und Produktionsdatum (global, nicht pro Charge). */
export function getNextDeviceSerialNumbers(
  devices: Device[],
  customerPrefix: string,
  productionDate: string,
  count: number
): string[] {
  const prefix = customerPrefix.trim().toUpperCase();
  if (!prefix || !productionDate || count < 1) return [];

  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-SN-${productionDate}-(\\d{3})$`);
  let max = 0;
  for (const device of devices) {
    const match = (device.serial || "").match(pattern);
    if (match) {
      max = Math.max(max, Number(match[1]) || 0);
    }
  }

  const serials: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = max + i + 1;
    serials.push(`${prefix}-SN-${productionDate}-${String(n).padStart(3, "0")}`);
  }
  return serials;
}

/** Basic UDI-DI für EUDAMED — Format: TH-BUDI-VARIO-001 */
export function generateBasicUdiDi(
  customerPrefix: string,
  productFamily: string,
  variantIndex = 1
): string {
  const prefix = slugifyUdiToken(customerPrefix || "TH");
  const family = slugifyUdiToken(productFamily);
  const seq = String(Math.max(1, variantIndex)).padStart(3, "0");
  return `${prefix}-BUDI-${family}-${seq}`;
}

/** DMR-ID gehört zum Produkttyp (nicht chargenabhängig). */
export function generateDmrId(
  customerPrefix: string,
  productFamily: string,
  revision = "REV-A"
): string {
  const prefix = slugifyUdiToken(customerPrefix);
  const family = slugifyUdiToken(productFamily);
  const rev = slugifyUdiToken(revision);
  return `${prefix}-DMR-${family}-${rev}`;
}

/** DHR-ID ist chargen-/seriennummerbezogen. */
export function generateDhrId(
  customerPrefix: string,
  productionDate: string,
  serialRunningNumber: string
): string {
  const prefix = slugifyUdiToken(customerPrefix);
  return `${prefix}-DHR-${productionDate}-${serialRunningNumber}`;
}

export function extractRevisionFromVariants(variants?: string): string {
  if (!variants?.trim()) return "REV-A";
  const match = variants.match(/REV[- ]?[A-Z0-9]+/i);
  if (match) return match[0].replace(/\s+/g, "-").toUpperCase();
  return "REV-A";
}

export function normalizeGtin14(gtin: string): string | null {
  const digits = gtin.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits.padStart(14, "0");
}

export function isLikelyGtin(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14;
}

/** GS1 Modulo-10 Prüfziffer (GTIN-8 … GTIN-14). */
export function calculateGtinCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  const len = digitsWithoutCheck.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(digitsWithoutCheck[i]);
    const posFromRight = len - i;
    sum += digit * (posFromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export type GtinValidationResult = {
  valid: boolean;
  normalized: string;
  message: string;
};

export function validateGtinCheckDigit(gtin: string): GtinValidationResult {
  const digits = gtin.replace(/\D/g, "");
  if (!digits) {
    return { valid: false, normalized: "", message: "Keine GTIN angegeben" };
  }
  if (digits.length < 8 || digits.length > 14) {
    return {
      valid: false,
      normalized: digits,
      message: "GTIN ungültig — Länge muss 8–14 Ziffern sein",
    };
  }

  const gtin14 = digits.padStart(14, "0");
  const body = gtin14.slice(0, 13);
  const check = Number(gtin14[13]);
  const expected = calculateGtinCheckDigit(body);

  if (check !== expected) {
    const corrected = `${body}${expected}`;
    return {
      valid: false,
      normalized: gtin14,
      message: `GTIN ungültig — Prüfziffer falsch (…${check} statt …${expected}). Korrekt: ${corrected}`,
    };
  }

  return {
    valid: true,
    normalized: gtin14,
    message: "GTIN gültig — Prüfziffer korrekt",
  };
}

/** Setzt die GS1-Prüfziffer, wenn nur die letzte Ziffer falsch ist. */
export function correctGtinCheckDigit(gtin: string): string {
  if (!isLikelyGtin(gtin)) return gtin.trim();
  const digits = gtin.replace(/\D/g, "").padStart(14, "0");
  const body = digits.slice(0, 13);
  return `${body}${calculateGtinCheckDigit(body)}`;
}

export function resolveGtinForSave(gtin: string): {
  value: string;
  corrected: boolean;
  valid: boolean;
  message: string;
} {
  const trimmed = gtin.trim();
  if (!isLikelyGtin(trimmed)) {
    return { value: trimmed, corrected: false, valid: true, message: "" };
  }

  const initial = validateGtinCheckDigit(trimmed);
  if (initial.valid) {
    return {
      value: initial.normalized,
      corrected: false,
      valid: true,
      message: initial.message,
    };
  }

  const corrected = correctGtinCheckDigit(trimmed);
  const afterCorrection = validateGtinCheckDigit(corrected);
  if (afterCorrection.valid) {
    return {
      value: afterCorrection.normalized,
      corrected: !initial.valid,
      valid: true,
      message: `GTIN-Prüfziffer korrigiert: ${trimmed} → ${afterCorrection.normalized}`,
    };
  }

  return {
    value: trimmed,
    corrected: false,
    valid: false,
    message: initial.message,
  };
}

/**
 * UDI-PI / Produktionskennung (GS1 Application Identifiers).
 */
export function buildUdiPi(params: {
  productionDate: string;
  serial?: string;
  batch?: string;
  includeBatchWithSerial?: boolean;
}): string {
  const { productionDate, serial, batch, includeBatchWithSerial = true } = params;
  if (!productionDate?.trim()) return "";

  const datePart = `(11)${productionDate.trim()}`;
  const trimmedSerial = serial?.trim();
  const trimmedBatch = batch?.trim();

  if (trimmedSerial) {
    let pi = `${datePart}(21)${trimmedSerial}`;
    if (trimmedBatch && includeBatchWithSerial) {
      pi += `(10)${trimmedBatch}`;
    }
    return pi;
  }

  if (trimmedBatch) {
    return `${datePart}(10)${trimmedBatch}`;
  }

  return datePart;
}

/**
 * GS1-Human-Readable: `(11)260611(21)SN…` → Zeilen mit `(AI)Wert`.
 */
export function formatGs1HumanReadable(gs1String: string): string {
  const trimmed = gs1String.trim();
  if (!trimmed) return "";

  const segments: string[] = [];
  const regex = /\((\d{2})\)([^(]*)/g;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    const value = match[2].trim();
    if (value) segments.push(`(${match[1]})${value}`);
  }

  if (segments.length > 0) return segments.join("\n");
  return trimmed;
}

/** Vollständige Label-UDI im GS1-Standard (ohne Basic UDI-DI). */
export function buildGs1HumanReadable(device: {
  udiDi: string;
  productionDate?: string;
  serial?: string;
  batch?: string;
}): string {
  const gtin14 = normalizeGtin14(device.udiDi);
  if (!gtin14) return "";

  const lines: string[] = [`(01)${gtin14}`];
  if (device.productionDate?.trim()) {
    lines.push(`(11)${device.productionDate.trim()}`);
  }
  if (device.serial?.trim()) {
    lines.push(`(21)${device.serial.trim()}`);
  }
  if (device.batch?.trim()) {
    lines.push(`(10)${device.batch.trim()}`);
  }
  return lines.join("\n");
}

/** Label-UDI = (01)GTIN + UDI-PI, jeweils als GS1-Zeile. */
export function buildLabelUdi(udiDi: string, udiPi: string): string {
  const lines: string[] = [];
  const gtin14 = normalizeGtin14(udiDi);
  if (gtin14) {
    lines.push(`(01)${gtin14}`);
  } else if ((udiDi || "").trim()) {
    lines.push(`(01)${(udiDi || "").trim()}`);
  }

  const piFormatted = formatGs1HumanReadable(udiPi || "");
  if (piFormatted) {
    lines.push(...piFormatted.split("\n"));
  }

  return lines.join("\n");
}

/** GS1 Element String für DataMatrix (bwip-js parse). */
export function buildGs1ElementString(device: {
  udiDi: string;
  productionDate?: string;
  serial?: string;
  batch?: string;
}): string {
  const gtin14 = normalizeGtin14(device.udiDi);
  if (!gtin14) return "";

  let payload = `[01]${gtin14}`;
  if (device.productionDate?.trim()) {
    payload += `[11]${device.productionDate.trim()}`;
  }
  if (device.serial?.trim()) {
    payload += `[21]${device.serial.trim()}`;
  }
  if (device.batch?.trim()) {
    payload += `[10]${device.batch.trim()}`;
  }
  return payload;
}

/** Anzeige Produktionsdatum: DDMMYY z. B. 110626 */
export function formatProductionDateDisplay(yymmdd?: string): string {
  if (!yymmdd?.trim()) return "–";
  const raw = yymmdd.trim();
  if (!/^\d{6}$/.test(raw)) return raw;
  const yy = raw.slice(0, 2);
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  return `${dd}${mm}${yy}`;
}

/** Internes GS1-Datum YYMMDD */
export function formatProductionDateInternal(yymmdd?: string): string | null {
  if (!yymmdd?.trim() || !/^\d{6}$/.test(yymmdd.trim())) return null;
  return yymmdd.trim();
}

export function formatBatchChipLabel(batch?: string, deviceCount?: number): string {
  const trimmed = batch?.trim();
  if (trimmed) {
    if (deviceCount && deviceCount > 1) {
      return `Charge: ${trimmed} · ${deviceCount} Geräte`;
    }
    return `Charge: ${trimmed}`;
  }
  if (deviceCount) return formatDeviceCountLabel(deviceCount);
  return "Charge: –";
}

export type ReleaseValidationResult = {
  ok: boolean;
  missing: string[];
};

export function validateReleaseReadiness(
  device: Pick<
    Device,
    | "manufacturerName"
    | "manufacturerSrn"
    | "name"
    | "productFamily"
    | "basicUdiDi"
    | "udiDi"
    | "serial"
    | "batch"
    | "productionDate"
    | "dmrId"
    | "dhrId"
  >
): ReleaseValidationResult {
  const missing: string[] = [];
  if (!device.manufacturerName?.trim()) missing.push("Hersteller");
  if (!device.manufacturerSrn?.trim()) missing.push("Hersteller-SRN");
  if (!device.name?.trim()) missing.push("Produktmodell");
  if (!device.productFamily?.trim()) missing.push("Produktfamilie");
  if (!device.basicUdiDi?.trim()) missing.push("Basic UDI-DI");
  if (!device.udiDi?.trim()) missing.push("UDI-DI / GTIN");
  if (!device.serial?.trim() && !device.batch?.trim()) {
    missing.push("Seriennummer oder Charge");
  }
  if (!device.productionDate?.trim()) missing.push("Produktionsdatum");
  if (!device.dmrId?.trim()) missing.push("DMR-ID");
  if (!device.dhrId?.trim()) missing.push("DHR-ID");

  if (device.udiDi?.trim() && isLikelyGtin(device.udiDi)) {
    const gtin = validateGtinCheckDigit(device.udiDi);
    if (!gtin.valid) missing.push("GTIN-Prüfziffer");
  }

  return { ok: missing.length === 0, missing };
}

export function getInitialDeviceStatus(
  device: Pick<
    Device,
    | "manufacturerName"
    | "manufacturerSrn"
    | "name"
    | "productFamily"
    | "basicUdiDi"
    | "udiDi"
    | "serial"
    | "batch"
    | "productionDate"
    | "dmrId"
    | "dhrId"
  >
): DeviceStatus {
  return validateReleaseReadiness(device).ok ? "released" : "in_production";
}

export function formatDeviceCountLabel(count: number): string {
  return `${count} Gerät${count === 1 ? "" : "e"}`;
}

/** Nach dem Laden: Hersteller aus Registry ergänzen, ungültige Freigaben zurückstufen. */
export function patchDevicesAfterLoad(
  devices: Device[],
  registry: ProductUdiRegistryEntry[],
  normalizeProductKey: (value: string) => string
): Device[] {
  return devices.map((device) => {
    let patched = { ...device };

    if (!patched.manufacturerName?.trim() || !patched.manufacturerSrn?.trim()) {
      const match = registry.find(
        (entry) =>
          normalizeProductKey(entry.productName) === normalizeProductKey(patched.name || "")
      );
      if (match) {
        patched = {
          ...patched,
          manufacturerName:
            patched.manufacturerName?.trim() || match.manufacturerName?.trim() || "",
          manufacturerSrn:
            patched.manufacturerSrn?.trim() || match.manufacturerSrn?.trim() || "",
        };
      }
    }

    if (!patched.manufacturerSrn?.trim() && patched.manufacturerName?.trim()) {
      patched = {
        ...patched,
        manufacturerSrn: generateManufacturerSrn(patched.manufacturerName),
      };
    }

    const registryMatch = registry.find(
      (entry) =>
        normalizeProductKey(entry.productName) === normalizeProductKey(patched.name || "")
    );
    const familySource =
      patched.productFamily?.trim() ||
      registryMatch?.productName?.trim() ||
      patched.name?.trim() ||
      "";
    if (familySource) {
      const family = formatProductFamily(familySource);
      const modelSource =
        registryMatch?.productName?.trim() || patched.name?.trim() || familySource;
      patched = {
        ...patched,
        productFamily: family,
        name: buildProductModelLabel(family, modelSource),
      };
    }

    if (patched.status === "released") {
      const validation = validateReleaseReadiness(patched);
      if (!validation.ok) {
        patched = { ...patched, status: "in_production" };
      }
    }

    return patched;
  });
}
