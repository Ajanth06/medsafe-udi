"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "../components/AuthGate";
import { supabase } from "../../lib/supabaseClient";
import { buildBatchGroups, DEVICE_STATUS_LABELS } from "../../lib/batchGroups";
import { isActiveDevice } from "../../lib/trash";
import type { BatchGroup, Device, DeviceStatus } from "../../types/medsafe";

function mapDeviceRow(row: Record<string, unknown>): Device {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    udiDi: String(row.udi_di ?? ""),
    serial: String(row.serial ?? ""),
    udiHash: String(row.udi_hash ?? ""),
    createdAt: String(row.created_at ?? ""),
    batch: row.batch ? String(row.batch) : undefined,
    productionDate: row.production_date ? String(row.production_date) : undefined,
    status: (row.status || "released") as DeviceStatus,
    isArchived: Boolean(row.is_archived),
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

export default function BatchesPage() {
  return (
    <AuthGate title="Chargen & Serien">
      {() => <BatchesContent />}
    </AuthGate>
  );
}

function BatchesContent() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, udi_di, serial, udi_hash, batch, production_date, status, is_archived, created_at")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setDevices(
          data
            .map((row) => mapDeviceRow(row as Record<string, unknown>))
            .filter((device) => isActiveDevice(device))
        );
      }
      setLoading(false);
    };

    void load();
  }, []);

  const visibleDevices = useMemo(
    () => (showArchived ? devices : devices.filter((d) => !d.isArchived)),
    [devices, showArchived]
  );

  const groups = useMemo(() => buildBatchGroups(visibleDevices), [visibleDevices]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter(
      (g) =>
        g.productName.toLowerCase().includes(needle) ||
        g.batch.toLowerCase().includes(needle) ||
        g.udiDi.toLowerCase().includes(needle)
    );
  }, [groups, search]);

  const totals = useMemo(
    () => ({
      groups: filtered.length,
      devices: filtered.reduce((sum, g) => sum + g.quantity, 0),
      blocked: filtered.reduce((sum, g) => sum + g.blockedCount, 0),
    }),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Chargen &amp; Serien</h1>
        <p className="text-sm text-slate-400">
          Produktionschargen mit Stückzahlen, Status und UDI-DI.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Chargen" value={String(totals.groups)} />
        <StatCard label="Geräte gesamt" value={String(totals.devices)} />
        <StatCard label="Gesperrt" value={String(totals.blocked)} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Produkt, Charge oder UDI-DI suchen …"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-600"
          />
          Archivierte einbeziehen
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Chargen werden geladen …</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">Keine Chargen gefunden.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Produkt</th>
                  <th className="px-4 py-3">Charge</th>
                  <th className="px-4 py-3">Stückzahl</th>
                  <th className="px-4 py-3">UDI-DI</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Produktionsdatum</th>
                  <th className="px-4 py-3">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((group) => (
                  <BatchRow key={group.key} group={group} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function BatchRow({ group }: { group: BatchGroup }) {
  return (
    <tr className="border-b border-slate-800/80 hover:bg-white/[0.02]">
      <td className="px-4 py-3 font-medium text-slate-100">{group.productName}</td>
      <td className="px-4 py-3 text-slate-200">{group.batch}</td>
      <td className="px-4 py-3 text-slate-200">
        {group.quantity}
        {group.archivedCount > 0 && (
          <span className="ml-2 text-xs text-slate-500">
            ({group.archivedCount} archiviert)
          </span>
        )}
      </td>
      <td className="px-4 py-3 break-all text-xs text-slate-300">{group.udiDi}</td>
      <td className="px-4 py-3">
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-200">
          {DEVICE_STATUS_LABELS[group.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-300">{group.productionDate || "–"}</td>
      <td className="px-4 py-3">
        <Link
          href={`/docs?group=${encodeURIComponent(group.productName)}&batch=${encodeURIComponent(group.batch)}`}
          className="text-xs text-sky-400 underline"
        >
          Dokumente
        </Link>
      </td>
    </tr>
  );
}
