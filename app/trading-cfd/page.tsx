"use client";

import { useEffect, useMemo, useState } from "react";

type Instrument = "EUR/USD" | "DAX" | "WTI";
type SignalSide = "BUY" | "SELL" | "WAIT";
type Regime = "Trend" | "Range";
type RiskLevel = "Low" | "Medium" | "High";
type FeedStatus = "idle" | "live" | "error";
type SessionMode = "London" | "New York" | "Overlap";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type JournalStatus = "planned" | "executed" | "closed";

type MarketSignal = {
  instrument: Instrument;
  market: string;
  symbol: string;
  price: string;
  rawPrice: number;
  changePct: number;
  signal: SignalSide;
  regime: Regime;
  ema20: number;
  ema50: number;
  atr: number;
  atrPct: number;
  momentumPct: number;
  volumeRising: boolean;
  volumeSource: string;
  confidence: number;
  session: string;
  maxSpreadNote: string;
  plus500ExecutionText: string;
  catalyst: string;
  thesis: string;
  entryZone: string;
  stopLoss: string;
  takeProfit: string;
  riskReward: string;
  risk: RiskLevel;
  updatedAt: string;
};

type SignalsResponse = {
  updatedAt: string;
  source?: string;
  error?: string;
  signals: MarketSignal[];
};

type SignalHistoryEntry = {
  id: string;
  instrument: Instrument;
  signal: SignalSide;
  confidence: number;
  regime: Regime;
  price: string;
  updatedAt: string;
};

type JournalEntry = {
  id: string;
  instrument: Instrument;
  signal: SignalSide;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  status: JournalStatus;
  notes: string;
  createdAt: string;
};

const HISTORY_KEY = "trading-cfd-signal-history";
const JOURNAL_KEY = "trading-cfd-journal";

const FALLBACK_SIGNALS: MarketSignal[] = [
  {
    instrument: "EUR/USD",
    market: "FX Major",
    symbol: "EUR/USD",
    price: "1.0842",
    rawPrice: 1.0842,
    changePct: 0.34,
    signal: "BUY",
    regime: "Trend",
    ema20: 1.0832,
    ema50: 1.0821,
    atr: 0.0011,
    atrPct: 0.1,
    momentumPct: 0.11,
    volumeRising: true,
    volumeSource: "atr proxy",
    confidence: 80,
    session: "Overlap",
    maxSpreadNote: "Max 1.2 pip",
    plus500ExecutionText: "BUY EUR/USD CFD manuell in Plus500",
    catalyst: "EMA20 liegt ueber EMA50, Trend und Expansion bestaetigen Long Bias",
    thesis: "Pullback-Setup am Trendfilter wird bevorzugt. Breakouts nur bei Volatility Expansion.",
    entryZone: "1.0838 - 1.0844",
    stopLoss: "1.0827",
    takeProfit: "1.0871",
    riskReward: "1 : 2.0",
    risk: "Low",
    updatedAt: new Date().toISOString(),
  },
  {
    instrument: "DAX",
    market: "Index CFD",
    symbol: "DE40",
    price: "18,742",
    rawPrice: 18742,
    changePct: -0.21,
    signal: "SELL",
    regime: "Trend",
    ema20: 18748,
    ema50: 18796,
    atr: 86,
    atrPct: 0.46,
    momentumPct: -0.17,
    volumeRising: true,
    volumeSource: "exchange volume",
    confidence: 78,
    session: "London",
    maxSpreadNote: "Max 2.5 points",
    plus500ExecutionText: "SELL Germany 40 CFD manuell in Plus500",
    catalyst: "EMA20 liegt unter EMA50, Trend und Expansion bestaetigen Short Bias",
    thesis: "Pullback-Setup am Trendfilter wird bevorzugt. Breakouts nur bei Volatility Expansion.",
    entryZone: "18,731 - 18,764",
    stopLoss: "18,868",
    takeProfit: "18,501",
    riskReward: "1 : 2.0",
    risk: "Medium",
    updatedAt: new Date().toISOString(),
  },
  {
    instrument: "WTI",
    market: "Commodity CFD",
    symbol: "WTI",
    price: "78.62",
    rawPrice: 78.62,
    changePct: 0.11,
    signal: "WAIT",
    regime: "Range",
    ema20: 78.54,
    ema50: 78.57,
    atr: 0.72,
    atrPct: 0.92,
    momentumPct: 0.02,
    volumeRising: false,
    volumeSource: "exchange volume",
    confidence: 45,
    session: "New York",
    maxSpreadNote: "Max 0.06 USD",
    plus500ExecutionText: "WAIT Oil CFD in Plus500, kein Entry",
    catalyst: "Kein ausreichend starkes Trend-Regime oder Confidence unter Schwelle",
    thesis: "Range-Regime erkannt. Ohne Expansion wird keine aggressive Execution empfohlen.",
    entryZone: "Wait near 78.54",
    stopLoss: "Pending confirmation",
    takeProfit: "Pending direction",
    riskReward: "Stand by",
    risk: "High",
    updatedAt: new Date().toISOString(),
  },
];

const feedStatusClass = (status: FeedStatus) =>
  status === "live"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : status === "error"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : "border-amber-500/40 bg-amber-500/10 text-amber-200";

const riskClass = (risk: RiskLevel) =>
  risk === "Low"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : risk === "High"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : "border-amber-500/40 bg-amber-500/10 text-amber-200";

const signalClass = (signal: SignalSide) =>
  signal === "BUY"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : signal === "SELL"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : "border-slate-500/40 bg-slate-500/10 text-slate-200";

const regimeClass = (regime: Regime) =>
  regime === "Trend"
    ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
    : "border-slate-500/40 bg-slate-500/10 text-slate-200";

const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("de-DE") : "-";
const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const parseNumeric = (value: string) => {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function TradingCfdPage() {
  const [sessionMode, setSessionMode] = useState<SessionMode>("Overlap");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");
  const [signals, setSignals] = useState<MarketSignal[]>(FALLBACK_SIGNALS);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument>("EUR/USD");
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(0.8);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [source, setSource] = useState("Fallback");
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("idle");
  const [feedError, setFeedError] = useState("");
  const [signalHistory, setSignalHistory] = useState<SignalHistoryEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalNotes, setJournalNotes] = useState("");
  const [journalStatus, setJournalStatus] = useState<JournalStatus>("planned");

  useEffect(() => {
    setSignalHistory(readStorage<SignalHistoryEntry[]>(HISTORY_KEY, []));
    setJournal(readStorage<JournalEntry[]>(JOURNAL_KEY, []));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(signalHistory));
    }
  }, [signalHistory]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    }
  }, [journal]);

  useEffect(() => {
    let active = true;

    const loadSignals = async () => {
      try {
        const response = await fetch("/api/trading/cfd/signals", {
          cache: "no-store",
        });
        const data = (await response.json()) as SignalsResponse;

        if (!response.ok) {
          throw new Error(data.error || "cfd_signal_feed_unavailable");
        }

        if (!active) return;

        const nextSignals = data.signals.length > 0 ? data.signals : FALLBACK_SIGNALS;
        setSignals(nextSignals);
        setUpdatedAt(data.updatedAt);
        setSource(data.source || "Twelve Data");
        setFeedStatus("live");
        setFeedError("");
      } catch (error) {
        if (!active) return;
        setFeedStatus("error");
        setFeedError(error instanceof Error ? error.message : "cfd_signal_feed_unavailable");
      }
    };

    void loadSignals();
    const intervalId = window.setInterval(loadSignals, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (signals.length === 0) return;

    setSignalHistory((previous) => {
      const additions = signals
        .filter(
          (signal) =>
            !previous.some(
              (entry) =>
                entry.instrument === signal.instrument &&
                entry.updatedAt === signal.updatedAt &&
                entry.signal === signal.signal
            )
        )
        .map((signal) => ({
          id: `${signal.instrument}-${signal.updatedAt}-${signal.signal}`,
          instrument: signal.instrument,
          signal: signal.signal,
          confidence: signal.confidence,
          regime: signal.regime,
          price: signal.price,
          updatedAt: signal.updatedAt,
        }));

      if (additions.length === 0) {
        return previous;
      }

      return [...additions.reverse(), ...previous].slice(0, 40);
    });
  }, [signals]);

  const profileConfig = useMemo(() => {
    if (riskProfile === "Conservative") {
      return { maxRiskPerTrade: "0.50%", maxOpenSignals: 1, executionStyle: "Nur A-Setups handeln" };
    }
    if (riskProfile === "Aggressive") {
      return { maxRiskPerTrade: "1.00%", maxOpenSignals: 3, executionStyle: "Breakouts nur mit Expansion handeln" };
    }
    return { maxRiskPerTrade: "0.80%", maxOpenSignals: 2, executionStyle: "Trend-Pullbacks selektiv handeln" };
  }, [riskProfile]);

  const summary = useMemo(() => {
    const buyCount = signals.filter((entry) => entry.signal === "BUY").length;
    const sellCount = signals.filter((entry) => entry.signal === "SELL").length;
    const waitCount = signals.filter((entry) => entry.signal === "WAIT").length;
    const avgConfidence =
      signals.reduce((sum, entry) => sum + entry.confidence, 0) / Math.max(signals.length, 1);
    return { buyCount, sellCount, waitCount, avgConfidence: Math.round(avgConfidence) };
  }, [signals]);

  const sessionBias = useMemo(() => {
    if (sessionMode === "London") return "London priorisiert EUR/USD und DAX, WTI nur selektiv.";
    if (sessionMode === "New York") return "New York priorisiert WTI, Indizes nur mit Follow-through.";
    return "Overlap liefert meist die saubersten CFD-Signale insgesamt.";
  }, [sessionMode]);

  const actionableSignals = useMemo(
    () => signals.filter((entry) => entry.signal !== "WAIT"),
    [signals]
  );

  const selectedSignal =
    signals.find((entry) => entry.instrument === selectedInstrument) || signals[0];

  const riskModel = useMemo(() => {
    if (!selectedSignal) return null;

    const stopValue = parseNumeric(selectedSignal.stopLoss);
    if (stopValue === null) {
      return {
        riskCapital: accountSize * (riskPercent / 100),
        stopDistance: null,
        positionSize: null,
        notionalExposure: null,
      };
    }

    const stopDistance = Math.abs(selectedSignal.rawPrice - stopValue);
    if (stopDistance <= 0) {
      return {
        riskCapital: accountSize * (riskPercent / 100),
        stopDistance: null,
        positionSize: null,
        notionalExposure: null,
      };
    }

    const riskCapital = accountSize * (riskPercent / 100);
    const positionSize = riskCapital / stopDistance;
    const notionalExposure = positionSize * selectedSignal.rawPrice;

    return {
      riskCapital,
      stopDistance,
      positionSize,
      notionalExposure,
    };
  }, [accountSize, riskPercent, selectedSignal]);

  const addJournalEntry = () => {
    if (!selectedSignal) return;

    const entry: JournalEntry = {
      id: `${selectedSignal.instrument}-${Date.now()}`,
      instrument: selectedSignal.instrument,
      signal: selectedSignal.signal,
      entry: selectedSignal.entryZone,
      stopLoss: selectedSignal.stopLoss,
      takeProfit: selectedSignal.takeProfit,
      status: journalStatus,
      notes: journalNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    setJournal((previous) => [entry, ...previous].slice(0, 50));
    setJournalNotes("");
    setJournalStatus("planned");
  };

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
                Serverseitige Signal-Engine mit `EMA20`, `EMA50`, `ATR`, Regime Detection
                und Session-Scoring fuer EUR/USD, DAX und WTI. Dazu jetzt mit
                Positionsgroessen-Rechner, Signal-Historie und manuellem Plus500-Journal.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Buy Signals</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">{summary.buyCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Sell Signals</div>
                <div className="mt-1 text-2xl font-semibold text-rose-300">{summary.sellCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Wait Setups</div>
                <div className="mt-1 text-2xl font-semibold text-amber-200">{summary.waitCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Avg Confidence</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{summary.avgConfidence}%</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Feed and Execution</div>
                <h2 className="mt-1 text-xl font-semibold">Manual Plus500 Workflow</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${feedStatusClass(feedStatus)}`}>
                {feedStatus}
              </span>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Source</div>
                <div className="mt-1 font-semibold text-slate-100">{source}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Feed Snapshot</div>
                <div className="mt-1 font-semibold text-slate-100">{formatDateTime(updatedAt)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Current Session Bias</div>
                <div className="mt-1 font-semibold text-slate-100">{sessionBias}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Feed Errors</div>
                <div className="mt-1 text-slate-300">{feedError || "No upstream error reported."}</div>
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Risk Envelope</div>
            <h2 className="mt-1 text-xl font-semibold">Execution Parameters</h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Risk Per Trade</div>
                <div className="mt-1 text-2xl font-semibold text-rose-200">{profileConfig.maxRiskPerTrade}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Open Signals</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{profileConfig.maxOpenSignals}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Execution Style</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{profileConfig.executionStyle}</div>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signal Board</div>
              <h2 className="mt-1 text-xl font-semibold">EUR/USD, DAX, WTI</h2>
            </div>
            <div className="text-xs text-slate-500">Polling every 10 seconds via `/api/trading/cfd/signals`.</div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {signals.map((signal) => (
              <article
                key={signal.instrument}
                className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82))] p-5 shadow-lg shadow-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {signal.market} / {signal.symbol}
                    </div>
                    <h3 className="mt-1 text-2xl font-semibold">{signal.instrument}</h3>
                    <div className="mt-1 text-sm text-slate-400">
                      Price {signal.price} <span className="ml-2">{formatPct(signal.changePct)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${signalClass(signal.signal)}`}>
                      {signal.signal}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${regimeClass(signal.regime)}`}>
                      {signal.regime}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${riskClass(signal.risk)}`}>
                      {signal.risk} risk
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Entry Zone</div>
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
                    <div className="mt-1 font-semibold text-emerald-300">{signal.takeProfit}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">EMA20 / EMA50</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.ema20} / {signal.ema50}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">ATR</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.atr} ({formatPct(signal.atrPct)})</div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Catalyst</div>
                  <div className="mt-2 text-sm text-slate-200">{signal.catalyst}</div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">Thesis</div>
                  <div className="mt-2 text-sm text-slate-300">{signal.thesis}</div>
                </div>

                <div className="mt-5 space-y-2 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-slate-200">
                  <div>Execute on Plus500 as: {signal.plus500ExecutionText}</div>
                  <div>Spread Check: {signal.maxSpreadNote}</div>
                  <div>Updated: {formatDateTime(signal.updatedAt)}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Risk Calculator</div>
                <h2 className="mt-1 text-xl font-semibold">Position Sizing</h2>
              </div>
              <span className="text-xs text-slate-500">Kontobasiert und signalabhängig</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Instrument
                <select
                  value={selectedInstrument}
                  onChange={(event) => setSelectedInstrument(event.target.value as Instrument)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                >
                  {signals.map((signal) => (
                    <option key={signal.instrument} value={signal.instrument}>
                      {signal.instrument}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-slate-400">
                Account Size USD
                <input
                  type="number"
                  step="100"
                  value={accountSize}
                  onChange={(event) => setAccountSize(Number(event.target.value || 0))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                />
              </label>

              <label className="text-xs text-slate-400">
                Risk %
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(event) => setRiskPercent(Number(event.target.value || 0))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                />
              </label>
            </div>

            {selectedSignal && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Signal</div>
                  <div className="mt-1 text-xl font-semibold text-slate-100">
                    {selectedSignal.instrument} {selectedSignal.signal}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Risk Capital</div>
                  <div className="mt-1 text-xl font-semibold text-rose-200">
                    {riskModel ? formatUsd(riskModel.riskCapital) : "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Stop Distance</div>
                  <div className="mt-1 text-xl font-semibold text-slate-100">
                    {riskModel?.stopDistance ? riskModel.stopDistance.toFixed(4) : "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Position Size</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-300">
                    {riskModel?.positionSize ? riskModel.positionSize.toFixed(2) : "-"}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
              Exposure: {riskModel?.notionalExposure ? formatUsd(riskModel.notionalExposure) : "nicht berechenbar"}.
              Wenn kein numerischer Stop vorliegt, bleibt der Rechner bewusst konservativ.
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Journal</div>
                <h2 className="mt-1 text-xl font-semibold">Manual Plus500 Entries</h2>
              </div>
              <span className="text-xs text-slate-500">Persistiert im Browser</span>
            </div>

            {selectedSignal && (
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  Vorschlag: {selectedSignal.plus500ExecutionText}
                </div>
                <label className="text-xs text-slate-400">
                  Status
                  <select
                    value={journalStatus}
                    onChange={(event) => setJournalStatus(event.target.value as JournalStatus)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                  >
                    <option value="planned">planned</option>
                    <option value="executed">executed</option>
                    <option value="closed">closed</option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Notes
                  <textarea
                    value={journalNotes}
                    onChange={(event) => setJournalNotes(event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                    placeholder="Zum Beispiel: Order manuell bei Plus500 gesetzt, Spread 0.8 pip, Teilgewinn geplant."
                  />
                </label>
                <button
                  onClick={addJournalEntry}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
                >
                  Save Journal Entry
                </button>
              </div>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signal History</div>
            <h2 className="mt-1 text-xl font-semibold">Recent Signal Changes</h2>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Instrument</th>
                    <th className="px-4 py-3 font-medium">Signal</th>
                    <th className="px-4 py-3 font-medium">Regime</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {signalHistory.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-slate-400" colSpan={5}>
                        Noch keine Signal-Historie gespeichert.
                      </td>
                    </tr>
                  ) : (
                    signalHistory.map((entry) => (
                      <tr key={entry.id} className="border-t border-white/6 text-slate-200">
                        <td className="px-4 py-3 text-slate-400">{formatDateTime(entry.updatedAt)}</td>
                        <td className="px-4 py-3">{entry.instrument}</td>
                        <td className="px-4 py-3">{entry.signal}</td>
                        <td className="px-4 py-3">{entry.regime}</td>
                        <td className="px-4 py-3">{entry.confidence}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Trade Journal</div>
            <h2 className="mt-1 text-xl font-semibold">Manual Execution Log</h2>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Instrument</th>
                    <th className="px-4 py-3 font-medium">Signal</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-slate-400" colSpan={5}>
                        Noch keine manuellen Plus500-Eintraege gespeichert.
                      </td>
                    </tr>
                  ) : (
                    journal.map((entry) => (
                      <tr key={entry.id} className="border-t border-white/6 text-slate-200">
                        <td className="px-4 py-3 text-slate-400">{formatDateTime(entry.createdAt)}</td>
                        <td className="px-4 py-3">{entry.instrument}</td>
                        <td className="px-4 py-3">{entry.signal}</td>
                        <td className="px-4 py-3">{entry.status}</td>
                        <td className="px-4 py-3">
                          <div>Entry {entry.entry}</div>
                          <div className="text-xs text-slate-500">
                            SL {entry.stopLoss} / TP {entry.takeProfit}
                            {entry.notes ? ` / ${entry.notes}` : ""}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Alerts</div>
            <h2 className="mt-1 text-xl font-semibold">Actionable Signals</h2>

            <div className="mt-5 space-y-3 text-sm text-slate-300">
              {actionableSignals.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  Keine frischen BUY- oder SELL-Signale. Das System sieht aktuell kein A-Setup.
                </div>
              ) : (
                actionableSignals.map((signal) => (
                  <div key={signal.instrument} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-100">{signal.instrument} {signal.signal}</div>
                      <div className="text-xs text-slate-500">{signal.confidence}% confidence</div>
                    </div>
                    <div className="mt-1 text-slate-300">
                      {signal.plus500ExecutionText} | Entry {signal.entryZone} | Stop {signal.stopLoss} | TP {signal.takeProfit}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Trading Rules</div>
            <h2 className="mt-1 text-xl font-semibold">What The Engine Does</h2>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Regime Detection</div>
                <div className="mt-1 text-slate-300">EMA20 vs EMA50 plus ATR entscheiden, ob Trend oder Range vorliegt.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Setup Generator</div>
                <div className="mt-1 text-slate-300">Entry Zone, Stop Loss und Take Profit werden live aus ATR und Trendfilter berechnet.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Persistence</div>
                <div className="mt-1 text-slate-300">Signal-Historie und manuelles Journal werden lokal im Browser gespeichert.</div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
