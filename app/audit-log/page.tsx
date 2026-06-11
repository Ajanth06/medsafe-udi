"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "../components/AuthGate";
import { supabase } from "../../lib/supabaseClient";
import type { AuditEntry } from "../../types/medsafe";

function mapAuditRow(row: Record<string, unknown>): AuditEntry {
  return {
    id: String(row.id),
    deviceId: (row.device_id as string | null) ?? null,
    action: String(row.action ?? ""),
    message: String(row.message ?? ""),
    timestamp: String(row.timestamp ?? row.created_at ?? ""),
  };
}

export default function AuditLogPage() {
  return (
    <AuthGate title="Audit-Log">
      {() => <AuditLogContent />}
    </AuthGate>
  );
}

function AuditLogContent() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(500);

      if (!error && data) {
        setEntries(data.map((row) => mapAuditRow(row as Record<string, unknown>)));
      }
      setLoading(false);
    };

    void load();
  }, []);

  const actions = useMemo(() => {
    const unique = new Set(entries.map((e) => e.action).filter(Boolean));
    return [...unique].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (actionFilter !== "all" && entry.action !== actionFilter) return false;
      if (!needle) return true;
      return (
        entry.action.toLowerCase().includes(needle) ||
        entry.message.toLowerCase().includes(needle) ||
        (entry.deviceId || "").toLowerCase().includes(needle)
      );
    });
  }, [entries, search, actionFilter]);

  const exportCsv = () => {
    const header = ["Zeitstempel", "Aktion", "Nachricht", "Gerät-ID"];
    const rows = filtered.map((e) => [
      e.timestamp,
      e.action,
      e.message.replace(/"/g, '""'),
      e.deviceId || "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `medsafe-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Audit-Log</h1>
          <p className="text-sm text-slate-400">
            Zentrale Übersicht aller protokollierten Aktionen.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-100 disabled:opacity-40"
        >
          CSV exportieren
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche in Aktion oder Nachricht …"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
        >
          <option value="all">Alle Aktionen</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Einträge werden geladen …</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">Keine Audit-Einträge gefunden.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Zeit</th>
                  <th className="px-4 py-3">Aktion</th>
                  <th className="px-4 py-3">Nachricht</th>
                  <th className="px-4 py-3">Gerät</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800/80 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-300">
                      {entry.timestamp
                        ? new Date(entry.timestamp).toLocaleString("de-DE")
                        : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{entry.message}</td>
                    <td className="px-4 py-3">
                      {entry.deviceId ? (
                        <Link
                          href={`/?device=${entry.deviceId}#udi`}
                          className="text-xs text-emerald-400 underline"
                        >
                          {entry.deviceId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-slate-500">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Angezeigt: {filtered.length} von {entries.length} Einträgen (max. 500 geladen).
      </p>
    </div>
  );
}
