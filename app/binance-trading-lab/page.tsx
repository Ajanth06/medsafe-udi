export default function BinanceTradingLabPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-amber-400/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(15,23,42,0.92))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-amber-200/80">
                Binance Trading Lab
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                Binance Execution Desk
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300/80 md:text-base">
                Separater Bereich fuer Binance-only Strategien, Paper-Execution,
                Venue-Monitoring und spaetere Testnet- oder Live-Orderflows.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Venue</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Binance
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Execution</div>
                <div className="mt-1 text-lg font-semibold text-amber-200">
                  Paper
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Status</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Separate Page
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Next Step
          </div>
          <h2 className="mt-1 text-xl font-semibold">Binance-only Module</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Diese Seite ist jetzt als eigener Navigationseintrag angelegt. Wenn du
            willst, verschiebe ich als Naechstes den kompletten Binance-Bereich aus
            `Trading Lab` hierher und baue daraus ein vollstaendig separates
            Dashboard.
          </p>
        </section>
      </div>
    </main>
  );
}
