"use client";

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-200 bg-white px-4 py-6 flex flex-col">
      {/* Logo / Titel */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center font-semibold">
          MS
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">MedSafe-UDI</div>
          <div className="text-xs text-slate-500">MDR Device Cockpit</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-2">
        {/* Dashboard – aktiv */}
        <button className="w-full text-left rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-sm">
          <div className="text-sm font-semibold">Dashboard</div>
          <div className="text-xs text-slate-300">
            Geräte, Dokumente &amp; Audit auf einen Blick
          </div>
        </button>

        {/* Geräte */}
        <button className="w-full text-left rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition">
          <div className="font-medium">Geräte</div>
          <div className="text-xs text-slate-500">
            UDI, Seriennummern, Chargen
          </div>
        </button>

        {/* Dokumente */}
        <button className="w-full text-left rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition">
          <div className="font-medium">Dokumente</div>
          <div className="text-xs text-slate-500">
            DMR, DHR, Serviceberichte
          </div>
        </button>

        {/* Audit / Historie */}
        <button className="w-full text-left rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition">
          <div className="font-medium">Audit / Historie</div>
          <div className="text-xs text-slate-500">
            Änderungsverlauf &amp; Aktivitäten
          </div>
        </button>
      </nav>

      {/* Footer unten */}
      <div className="mt-auto px-2 pt-6 text-xs text-slate-400">
        v0.1 • Local Prototype
      </div>
    </aside>
  );
}
