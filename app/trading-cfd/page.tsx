"use client";

import { useMemo, useState } from "react";

type Instrument = "EUR/USD" | "DAX" | "WTI";
type SignalSide = "BUY" | "SELL" | "WAIT";
type RiskLevel = "Low" | "Medium" | "High";
type SessionMode = "London" | "New York" | "Overlap";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

type SignalCard = {
  instrument: Instrument;
  market: string;
  price: string;
  changePct: number;
  signal: SignalSide;
  entryZone: string;
  stopLoss: string;
  takeProfit: string;
  riskReward: string;
  risk: RiskLevel;
  confidence: number;
  catalyst: string;
  thesis: string;
};

const SIGNALS: SignalCard[] = [
  {
    instrument: "EUR/USD",
    market: "FX Major",
    price: "1.0842",
    changePct: 0.34,
    signal: "BUY",
    entryZone: "1.0836 - 1.0844",
    stopLoss: "1.0818",
    takeProfit: "1.0889",
    riskReward: "1 : 2.1",
    risk: "Low",
    confidence: 78,
    catalyst: "Momentum above European session VWAP",
    thesis: "Trend remains constructive while pullbacks hold above intraday support.",
  },
  {
    instrument: "DAX",
    market: "Index CFD",
    price: "18,742",
    changePct: -0.21,
    signal: "SELL",
    entryZone: "18,730 - 18,765",
    stopLoss: "18,846",
    takeProfit: "18,540",
    riskReward: "1 : 2.4",
    risk: "Medium",
    confidence: 72,
    catalyst: "Failed retest under opening range high",
    thesis: "Index is rejecting resistance and the short setup improves if Europe stays below the morning high.",
  },
  {
    instrument: "WTI",
    market: "Commodity CFD",
    price: "78.62",
    changePct: 0.11,
    signal: "WAIT",
    entryZone: "Break 79.05 or fade 77.90",
    stopLoss: "Pending breakout confirmation",
    takeProfit: "Pending direction",
    riskReward: "Stand by",
    risk: "High",
    confidence: 58,
    catalyst: "Compression ahead of US inventory window",
    thesis: "Range is too tight for clean execution. Better to wait for expansion before committing capital.",
  },
];

const riskClass = (risk: RiskLevel) => {
  if (risk === "Low") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (risk === "High") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-200";
};

const signalClass = (signal: SignalSide) => {
  if (signal === "BUY") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (signal === "SELL") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  return "border-slate-500/40 bg-slate-500/10 text-slate-200";
};

const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function TradingCfdPage() {
  const [sessionMode, setSessionMode] = useState<SessionMode>("Overlap");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");

  const profileConfig = useMemo(() => {
    if (riskProfile === "Conservative") {
      return {
        maxRiskPerTrade: "0.40%",
        maxOpenSignals: 1,
        executionStyle: "Nur A-Setups handeln",
      };
    }

    if (riskProfile === "Aggressive") {
      return {
        maxRiskPerTrade: "1.20%",
        maxOpenSignals: 3,
        executionStyle: "Momentum und Breakout handeln",
      };
    }

    return {
      maxRiskPerTrade: "0.80%",
      maxOpenSignals: 2,
      executionStyle: "Selective continuation entries",
    };
  }, [riskProfile]);

  const signalSummary = useMemo(() => {
    const buyCount = SIGNALS.filter((entry) => entry.signal === "BUY").length;
    const sellCount = SIGNALS.filter((entry) => entry.signal === "SELL").length;
    const waitCount = SIGNALS.filter((entry) => entry.signal === "WAIT").length;
    const avgConfidence =
      SIGNALS.reduce((sum, entry) => sum + entry.confidence, 0) / SIGNALS.length;

    return {
      buyCount,
      sellCount,
      waitCount,
      avgConfidence: Math.round(avgConfidence),
    };
  }, []);

  const sessionBias = useMemo(() => {
    if (sessionMode === "London") {
      return "FX momentum priorisiert, Indizes nur nach Retest.";
    }
    if (sessionMode === "New York") {
      return "WTI und DAX auf US-Impuls beobachten, EUR/USD nur bei sauberem Follow-through.";
    }
    return "Hoechste Signalqualitaet in der London-New-York-Ueberlappung.";
  }, [sessionMode]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-rose-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_28%),rgba(15,23,42,0.94)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-rose-200/80">
                Trading CFD
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                CFD Signal Desk
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300/80 md:text-base">
                Signal-Dashboard fuer EUR/USD, DAX und WTI. Der Bot analysiert
                Marktstruktur, zeigt Buy-, Sell- und Wait-Setups mit Stop, Take Profit,
                Risk und Confidence. Die Ausfuehrung erfolgt manuell bei Plus500.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Buy Signals</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">
                  {signalSummary.buyCount}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Sell Signals</div>
                <div className="mt-1 text-2xl font-semibold text-rose-300">
                  {signalSummary.sellCount}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Wait Setups</div>
                <div className="mt-1 text-2xl font-semibold text-amber-200">
                  {signalSummary.waitCount}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Avg Confidence</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">
                  {signalSummary.avgConfidence}%
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Execution Policy
                </div>
                <h2 className="mt-1 text-xl font-semibold">Manual Plus500 Workflow</h2>
              </div>
              <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-rose-200">
                Signal Only
              </span>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Broker</div>
                <div className="mt-1 font-semibold text-slate-100">Plus500 manual execution</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Current Session Bias</div>
                <div className="mt-1 font-semibold text-slate-100">{sessionBias}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Rule</div>
                <div className="mt-1 text-slate-300">
                  Nur Signale mit klarer Struktur handeln. Der Entry wird im Dashboard
                  definiert, die Order wird anschliessend manuell bei Plus500 gesetzt.
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Session Mode
                <select
                  value={sessionMode}
                  onChange={(event) => setSessionMode(event.target.value as SessionMode)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                >
                  <option value="London">London</option>
                  <option value="New York">New York</option>
                  <option value="Overlap">Overlap</option>
                </select>
              </label>

              <label className="text-xs text-slate-400">
                Risk Profile
                <select
                  value={riskProfile}
                  onChange={(event) => setRiskProfile(event.target.value as RiskProfile)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                >
                  <option value="Conservative">Conservative</option>
                  <option value="Balanced">Balanced</option>
                  <option value="Aggressive">Aggressive</option>
                </select>
              </label>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Risk Envelope
            </div>
            <h2 className="mt-1 text-xl font-semibold">Execution Parameters</h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Risk Per Trade</div>
                <div className="mt-1 text-2xl font-semibold text-rose-200">
                  {profileConfig.maxRiskPerTrade}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Open Signals</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">
                  {profileConfig.maxOpenSignals}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Execution Style</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {profileConfig.executionStyle}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Manual Checklist
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-300">
                <div>1. Signal lesen und Entry-Zone bestaetigen.</div>
                <div>2. Stop und Take Profit exakt in Plus500 setzen.</div>
                <div>3. Nur handeln, wenn Spread und Volatilitaet zum Setup passen.</div>
                <div>4. Kein Nachkaufen ausserhalb des definierten Plans.</div>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                Signal Board
              </div>
              <h2 className="mt-1 text-xl font-semibold">EUR/USD, DAX, WTI</h2>
            </div>
            <div className="text-xs text-slate-500">
              Intraday signals with manual broker execution only.
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {SIGNALS.map((signal) => (
              <article
                key={signal.instrument}
                className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82))] p-5 shadow-lg shadow-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {signal.market}
                    </div>
                    <h3 className="mt-1 text-2xl font-semibold">{signal.instrument}</h3>
                    <div className="mt-1 text-sm text-slate-400">
                      Price {signal.price} <span className="ml-2">{formatPct(signal.changePct)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${signalClass(
                        signal.signal
                      )}`}
                    >
                      {signal.signal}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${riskClass(
                        signal.risk
                      )}`}
                    >
                      {signal.risk} risk
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Entry</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.entryZone}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Confidence</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.confidence}%</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Stop Loss</div>
                    <div className="mt-1 font-semibold text-rose-200">{signal.stopLoss}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Take Profit</div>
                    <div className="mt-1 font-semibold text-emerald-300">
                      {signal.takeProfit}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3 col-span-2">
                    <div className="text-slate-500">Risk / Reward</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.riskReward}</div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Catalyst
                  </div>
                  <div className="mt-2 text-sm text-slate-200">{signal.catalyst}</div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Thesis
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{signal.thesis}</div>
                </div>

                <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-slate-200">
                  Plus500 Action: Entry, Stop und Take Profit manuell im Broker setzen.
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Market Read
            </div>
            <h2 className="mt-1 text-xl font-semibold">Desk Bias</h2>

            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">EUR/USD</div>
                <div className="mt-1">
                  Bullish while price stays above the intraday base. Best execution is on
                  controlled pullbacks, not on impulse candles.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">DAX</div>
                <div className="mt-1">
                  Weak under local resistance. The setup improves if the market fails to
                  recover the opening range high.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">WTI</div>
                <div className="mt-1">
                  No clean edge yet. Better to wait for a breakout or a fade back into a
                  defined level before acting.
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Trading Rules
            </div>
            <h2 className="mt-1 text-xl font-semibold">What The Bot Does</h2>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Analyse</div>
                <div className="mt-1 text-slate-300">
                  Marktstruktur, Entry-Zonen, Risiko und Confidence werden im Dashboard
                  verdichtet.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Signal Output</div>
                <div className="mt-1 text-slate-300">
                  Der Bot sagt klar BUY, SELL oder WAIT und liefert die dazugehoerigen
                  Levels.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">No Auto Execution</div>
                <div className="mt-1 text-slate-300">
                  Es werden keine automatischen CFD-Orders gesendet. Die finale Ausfuehrung
                  bleibt bewusst manuell bei Plus500.
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
