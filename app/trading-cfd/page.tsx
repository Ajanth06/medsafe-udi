"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  CFD_INSTRUMENTS,
  instrumentByStreamSymbol,
  type Instrument,
} from "../../lib/tradingCfdInstruments";

type SignalSide = "BUY" | "SELL" | "WAIT";
type EntryMode = "NOW" | "STOP" | "WAIT";
type Regime = "Trend" | "Range";
type RiskLevel = "Low" | "Medium" | "High";
type FeedStatus = "idle" | "live" | "error";
type SessionMode = "London" | "New York" | "Overlap";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type JournalStatus = "planned" | "executed" | "closed";
type PositionState = "FLAT" | "LONG" | "SHORT";

type MarketSignal = {
  instrument: Instrument;
  symbol: string;
  price: string;
  rawPrice: number;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  priceSource: string;
  changePct: number;
  signal: SignalSide;
  trendBias: SignalSide;
  entryMode: EntryMode;
  triggerPrice: string;
  maxSpread: number;
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
  hasLiveSignal?: boolean;
  marketErrors?: Partial<Record<Instrument, string>>;
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

type LiveTickEvent = {
  symbol?: string;
  price?: number;
  bid?: number | null;
  ask?: number | null;
  timestamp?: number;
  datetime?: string;
};

type BotPosition = {
  status: Exclude<PositionState, "FLAT">;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  atr: number;
  openedAt: string;
};

type BotSummary = {
  status: PositionState;
  action: "BUY" | "SELL" | "WAIT" | "EXIT";
  entry: string;
  exitPlan: string;
  update: string;
  reason: string;
};

const FALLBACK_SIGNALS: MarketSignal[] = CFD_INSTRUMENTS.map((config) => ({
  instrument: config.instrument,
  symbol: config.streamSymbol,
  price: "nicht verfuegbar",
  rawPrice: 0,
  bid: null,
  ask: null,
  spread: null,
  priceSource: "Twelve Data nicht verfuegbar",
  changePct: 0,
  signal: "WAIT",
  trendBias: "WAIT",
  entryMode: "WAIT",
  triggerPrice: "Nicht verfuegbar",
  maxSpread: config.estimatedSpread,
  regime: "Range",
  ema20: 0,
  ema50: 0,
  atr: 0,
  atrPct: 0,
  momentumPct: 0,
  volumeRising: false,
  volumeSource: "none",
  confidence: 0,
  session: "Ausserhalb der Haupthandelszeiten",
  maxSpreadNote: config.maxSpreadNote,
  plus500ExecutionText: `Kein Live-Preis fuer ${config.instrument} verfuegbar`,
  catalyst: `Twelve Data liefert aktuell keinen gueltigen Wert fuer ${config.instrument}.`,
  thesis: "Ohne echten Live-Kurs wird kein handelbarer Wert angezeigt.",
  entryZone: "Nicht verfuegbar",
  stopLoss: "Nicht verfuegbar",
  takeProfit: "Nicht verfuegbar",
  riskReward: "Nicht verfuegbar",
  risk: config.instrument === "EUR/USD" ? "Low" : "Medium",
  updatedAt: new Date().toISOString(),
}));

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

const signalLabel = (signal: SignalSide) =>
  signal === "BUY" ? "KAUF" : signal === "SELL" ? "VERKAUF" : "WARTEN";

const riskLabel = (risk: RiskLevel) =>
  risk === "Low" ? "Niedriges Risiko" : risk === "High" ? "Hohes Risiko" : "Mittleres Risiko";

const feedStatusLabel = (status: FeedStatus) =>
  status === "live" ? "echtzeit" : status === "error" ? "fehler" : "wartend";

const journalStatusLabel = (status: JournalStatus) =>
  status === "planned" ? "geplant" : status === "executed" ? "ausgefuehrt" : "geschlossen";

const botActionLabel = (action: BotSummary["action"]) =>
  action === "BUY"
    ? "KAUF"
    : action === "SELL"
      ? "VERKAUF"
      : action === "EXIT"
        ? "AUSSTIEG"
        : "WARTEN";

const positionStateLabel = (status: PositionState) =>
  status === "LONG" ? "Kaufposition" : status === "SHORT" ? "Verkaufsposition" : "Keine Position";

const regimeLabel = (regime: Regime) =>
  regime === "Trend" ? "Trend" : "Seitwaerts";

const entryModeLabel = (mode: EntryMode) =>
  mode === "NOW" ? "Sofort" : mode === "STOP" ? "Stop-Order" : "Warten";

const riskProfileLabel = (profile: RiskProfile) =>
  profile === "Conservative"
    ? "Konservativ"
    : profile === "Aggressive"
      ? "Aggressiv"
      : "Ausgewogen";

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

const formatInstrumentPrice = (instrument: Instrument, value: number) => {
  if (instrument === "EUR/USD") return value.toFixed(4);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
};

const toIsoTimestamp = (tick: LiveTickEvent) => {
  if (tick.datetime) return new Date(tick.datetime).toISOString();
  if (typeof tick.timestamp === "number") return new Date(tick.timestamp * 1000).toISOString();
  return new Date().toISOString();
};

const estimateBidAskFromLast = (price: number, spread: number) => {
  const halfSpread = spread / 2;
  return {
    bid: Number((price - halfSpread).toFixed(6)),
    ask: Number((price + halfSpread).toFixed(6)),
    spread: Number(spread.toFixed(6)),
  };
};

const sessionPriority = (session: SessionMode, instrument: Instrument) => {
  if (session === "London" && instrument === "EUR/USD") return 1;
  if (session === "Overlap") return 1;
  return 0.7;
};

export default function TradingCfdPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>("Overlap");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");
  const [signals, setSignals] = useState<MarketSignal[]>(FALLBACK_SIGNALS);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument>("EUR/USD");
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(0.8);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [source, setSource] = useState("Twelve Data Echtzeitfeed");
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("idle");
  const [feedError, setFeedError] = useState("");
  const [marketErrors, setMarketErrors] = useState<Partial<Record<Instrument, string>>>({});
  const [signalHistory, setSignalHistory] = useState<SignalHistoryEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalNotes, setJournalNotes] = useState("");
  const [journalStatus, setJournalStatus] = useState<JournalStatus>("planned");
  const [botPosition, setBotPosition] = useState<BotPosition | null>(null);
  const [botUpdate, setBotUpdate] = useState("Bot wartet auf einen gueltigen Trigger.");
  const lastSyncedSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error) {
        setUser(data.user ?? null);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setSignalHistory([]);
      setJournal([]);
      return;
    }

    const loadPersistedData = async () => {
      const [{ data: historyData }, { data: journalData }] = await Promise.all([
        supabase
          .from("cfd_signal_history")
          .select("id, instrument, signal, confidence, regime, price, signal_timestamp")
          .eq("user_id", user.id)
          .order("signal_timestamp", { ascending: false })
          .limit(40),
        supabase
          .from("cfd_trade_journal")
          .select("id, instrument, signal, entry, stop_loss, take_profit, status, notes, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setSignalHistory(
        (historyData || []).map((entry) => ({
          id: entry.id,
          instrument: entry.instrument as Instrument,
          signal: entry.signal as SignalSide,
          confidence: entry.confidence,
          regime: entry.regime as Regime,
          price: entry.price,
          updatedAt: entry.signal_timestamp,
        }))
      );

      setJournal(
        (journalData || []).map((entry) => ({
          id: entry.id,
          instrument: entry.instrument as Instrument,
          signal: entry.signal as SignalSide,
          entry: entry.entry,
          stopLoss: entry.stop_loss,
          takeProfit: entry.take_profit,
          status: entry.status as JournalStatus,
          notes: entry.notes,
          createdAt: entry.created_at,
        }))
      );
    };

    void loadPersistedData();
  }, [user]);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

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
        const hasLiveSignal =
          typeof data.hasLiveSignal === "boolean"
            ? data.hasLiveSignal
            : nextSignals.some((signal) => signal.price !== "nicht verfuegbar");
        setSignals(nextSignals);
        setUpdatedAt(data.updatedAt);
        setSource(data.source || "Twelve Data Echtzeitfeed");
        setMarketErrors(data.marketErrors || {});
        setFeedStatus(hasLiveSignal ? "live" : "error");
        setFeedError(data.error || "");
        if (data.signals[0]?.updatedAt) {
          lastSyncedSnapshotRef.current = null;
        }
      } catch (error) {
        if (!active) return;
        setFeedStatus("error");
        setMarketErrors({});
        setFeedError(error instanceof Error ? error.message : "cfd_signal_feed_unavailable");
      }
    };

    const connectLiveStream = () => {
      eventSource = new EventSource("/api/trading/cfd/live");

      eventSource.addEventListener("status", (event) => {
        if (!active) return;

        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            state?: string;
            source?: string;
            reason?: string;
          };

          if (payload.source) {
            setSource(payload.source);
          }

          if (payload.state === "open" || payload.state === "subscribed") {
            setFeedStatus("live");
            setFeedError("");
          }

          if (payload.state === "closed") {
            setFeedStatus("error");
            setFeedError(payload.reason || "live_stream_closed");
          }
        } catch {
          setFeedStatus("error");
          setFeedError("live_stream_status_parse_failed");
        }
      });

      eventSource.addEventListener("tick", (event) => {
        if (!active) return;

        try {
          const tick = JSON.parse((event as MessageEvent).data) as LiveTickEvent;

          if (!Number.isFinite(tick.price) || !tick.symbol) {
            return;
          }

          const config = instrumentByStreamSymbol(tick.symbol);
          if (!config) return;

          const nextPrice = Number(tick.price);
          const estimatedQuote = estimateBidAskFromLast(nextPrice, config.estimatedSpread);
          const nextBid = typeof tick.bid === "number" ? tick.bid : estimatedQuote.bid;
          const nextAsk = typeof tick.ask === "number" ? tick.ask : estimatedQuote.ask;
          const nextSpread =
            typeof tick.bid === "number" && typeof tick.ask === "number"
              ? Number((tick.ask - tick.bid).toFixed(6))
              : estimatedQuote.spread;

          setSignals((currentSignals) =>
            currentSignals.map((signal) =>
              signal.instrument === config.instrument
                ? {
                    ...signal,
                    price: formatInstrumentPrice(signal.instrument, nextPrice),
                    rawPrice: Number(nextPrice.toFixed(6)),
                    bid: nextBid,
                    ask: nextAsk,
                    spread: nextSpread,
                    priceSource:
                      typeof tick.bid === "number" && typeof tick.ask === "number"
                        ? "Twelve Data Echtzeitstream"
                        : "Twelve Data Echtzeitstream + geschaetzter Spread",
                  }
                : signal
            )
          );
          setUpdatedAt(toIsoTimestamp(tick));
          setSource("Twelve Data Echtzeitstream");
          setFeedStatus("live");
          setFeedError("");
          setMarketErrors({});
        } catch {
          setFeedStatus("error");
          setFeedError("live_tick_parse_failed");
        }
      });

      eventSource.addEventListener("feed-error", (event) => {
        if (!active) return;

        try {
          const payload = JSON.parse((event as MessageEvent).data) as { message?: string };
          setFeedStatus("error");
          setFeedError(payload.message || "live_stream_failed");
        } catch {
          setFeedStatus("error");
          setFeedError("live_stream_failed");
        }
      });

      eventSource.onerror = () => {
        if (!active) return;
        setFeedStatus("error");
        setFeedError("live_stream_disconnected");
      };
    };

    void loadSignals();
    connectLiveStream();
    const snapshotIntervalId = window.setInterval(loadSignals, 15 * 60 * 1000);

    return () => {
      active = false;
      eventSource?.close();
      window.clearInterval(snapshotIntervalId);
    };
  }, []);

  useEffect(() => {
    if (!user || signals.length === 0) return;

    const snapshotKey = signals
      .map((signal) => `${signal.instrument}:${signal.signal}:${signal.regime}:${signal.confidence}:${signal.updatedAt}`)
      .join("|");

    if (lastSyncedSnapshotRef.current === snapshotKey) {
      return;
    }

    const syncSignalHistory = async () => {
      const payload = signals.map((signal) => ({
        user_id: user.id,
        instrument: signal.instrument,
        signal: signal.signal,
        confidence: signal.confidence,
        regime: signal.regime,
        price: signal.price,
        signal_timestamp: signal.updatedAt,
      }));

      const { data } = await supabase
        .from("cfd_signal_history")
        .upsert(payload, {
          onConflict: "user_id,instrument,signal,signal_timestamp",
          ignoreDuplicates: true,
        })
        .select("id");

      if (!data) {
        return;
      }

      const { data: historyData } = await supabase
        .from("cfd_signal_history")
        .select("id, instrument, signal, confidence, regime, price, signal_timestamp")
        .eq("user_id", user.id)
        .order("signal_timestamp", { ascending: false })
        .limit(40);

      if (!historyData) {
        return;
      }

      lastSyncedSnapshotRef.current = snapshotKey;

      setSignalHistory(
        historyData.map((entry) => ({
          id: entry.id,
          instrument: entry.instrument as Instrument,
          signal: entry.signal as SignalSide,
          confidence: entry.confidence,
          regime: entry.regime as Regime,
          price: entry.price,
          updatedAt: entry.signal_timestamp,
        }))
      );
    };

    void syncSignalHistory();
  }, [signals, user]);

  const profileConfig = useMemo(() => {
    if (riskProfile === "Conservative") {
      return {
        maxRiskPerTrade: "0.50%",
        riskCapPercent: 0.5,
        minConfidence: 75,
        allowStopEntries: false,
        maxOpenSignals: 1,
        executionStyle: "Nur A-Setups in bevorzugter Session handeln",
      };
    }
    if (riskProfile === "Aggressive") {
      return {
        maxRiskPerTrade: "1.00%",
        riskCapPercent: 1,
        minConfidence: 55,
        allowStopEntries: true,
        maxOpenSignals: 3,
        executionStyle: "Breakouts und Stop-Orders auch ausserhalb des Overlap handeln",
      };
    }
    return {
      maxRiskPerTrade: "0.80%",
      riskCapPercent: 0.8,
      minConfidence: 65,
      allowStopEntries: true,
      maxOpenSignals: 2,
      executionStyle: "Trend-Pullbacks in priorisierter Session selektiv handeln",
    };
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
    if (sessionMode === "London") return "London ist die primaere Session fuer EUR/USD.";
    if (sessionMode === "New York") return "New York liefert Momentum, aber EUR/USD braucht saubere Bestaetigung.";
    return "Overlap liefert meist die saubersten EUR/USD-Signale insgesamt.";
  }, [sessionMode]);

  const actionableSignals = useMemo(
    () => signals.filter((entry) => entry.signal !== "WAIT"),
    [signals]
  );

  const intelligencePanel = useMemo(
    () =>
      signals.map((signal) => {
        const trendStrength = Math.min(
          100,
          Math.round((Math.abs(signal.ema20 - signal.ema50) / Math.max(signal.rawPrice, Number.EPSILON)) * 10000)
        );
        const liquidityQuality = signal.volumeRising
          ? signal.bid !== null && signal.ask !== null
            ? "Handelbar"
            : "Nur Proxy"
          : "Duenn";

        return {
          instrument: signal.instrument,
          spreadLabel: signal.spread !== null ? `${signal.spread}` : signal.maxSpreadNote,
          volatilityLabel: `${signal.atr} ATR / ${formatPct(signal.atrPct)}`,
          trendStrength,
          liquidityQuality,
        };
      }),
    [signals]
  );

  const volatilityScanner = useMemo(
    () =>
      [...signals]
        .sort((a, b) => b.atrPct - a.atrPct || Math.abs(b.momentumPct) - Math.abs(a.momentumPct))
        .map((signal, index) => ({
          rank: index + 1,
          instrument: signal.instrument,
          atrPct: signal.atrPct,
          momentumPct: signal.momentumPct,
          regime: signal.regime,
        })),
    [signals]
  );

  const breakoutDetector = useMemo(
    () =>
      signals
        .filter(
          (signal) =>
            signal.regime === "Trend" &&
            signal.confidence >= 70 &&
            signal.volumeRising &&
            Math.abs(signal.momentumPct) >= 0.04
        )
        .sort((a, b) => b.confidence - a.confidence),
    [signals]
  );

  const selectedSignal =
    signals.find((entry) => entry.instrument === selectedInstrument) || signals[0];

  const selectedInstrumentPriority = selectedSignal
    ? sessionPriority(sessionMode, selectedSignal.instrument)
    : 0;

  const entryAllowedByProfile = selectedSignal
    ? selectedSignal.confidence >= profileConfig.minConfidence &&
      (profileConfig.allowStopEntries || selectedSignal.entryMode !== "STOP")
    : false;

  const entryAllowedBySession = selectedInstrumentPriority >= 0.75;

  useEffect(() => {
    if (!selectedSignal) {
      setBotPosition(null);
      setBotUpdate("Bot wartet auf einen gueltigen Trigger.");
      return;
    }

    const triggerPrice = parseNumeric(selectedSignal.triggerPrice);
    const stopLoss = parseNumeric(selectedSignal.stopLoss);
    const takeProfit = parseNumeric(selectedSignal.takeProfit);
    const bid = selectedSignal.bid ?? selectedSignal.rawPrice;
    const ask = selectedSignal.ask ?? selectedSignal.rawPrice;
    const spread = selectedSignal.spread ?? selectedSignal.maxSpread;
    const spreadTooHigh = spread > selectedSignal.maxSpread;
    const profitDistanceLong = bid;
    const profitDistanceShort = ask;

    if (spreadTooHigh) {
      if (botPosition === null) {
        setBotUpdate(`WARTEN: Spread ${spread.toFixed(6)} liegt ueber Limit ${selectedSignal.maxSpread.toFixed(6)}.`);
      }
      return;
    }

    if (!entryAllowedBySession && botPosition === null) {
      setBotUpdate(`WARTEN: ${selectedSignal.instrument} ist im Modus ${sessionMode} nicht priorisiert.`);
      return;
    }

    if (!entryAllowedByProfile && botPosition === null) {
      setBotUpdate(`WARTEN: Profil ${riskProfileLabel(riskProfile)} blockiert dieses Setup bei ${selectedSignal.confidence}% Vertrauen.`);
      return;
    }

    if (!botPosition) {
      if (
        selectedSignal.trendBias === "BUY" &&
        triggerPrice !== null &&
        stopLoss !== null &&
        takeProfit !== null &&
        ask >= triggerPrice
      ) {
        setBotPosition({
          status: "LONG",
          entryPrice: ask,
          stopLoss,
          takeProfit,
          atr: selectedSignal.atr,
          openedAt: new Date().toISOString(),
        });
        setBotUpdate(`Kaufposition aktiv seit ${formatInstrumentPrice(selectedSignal.instrument, ask)}.`);
        return;
      }

      if (
        selectedSignal.trendBias === "SELL" &&
        triggerPrice !== null &&
        stopLoss !== null &&
        takeProfit !== null &&
        bid <= triggerPrice
      ) {
        setBotPosition({
          status: "SHORT",
          entryPrice: bid,
          stopLoss,
          takeProfit,
          atr: selectedSignal.atr,
          openedAt: new Date().toISOString(),
        });
        setBotUpdate(`Verkaufsposition aktiv seit ${formatInstrumentPrice(selectedSignal.instrument, bid)}.`);
        return;
      }

      if (selectedSignal.trendBias === "BUY" && triggerPrice !== null) {
        setBotUpdate(`Keine Position: Kauf-Stop wartet ueber ${formatInstrumentPrice(selectedSignal.instrument, triggerPrice)}.`);
        return;
      }

      if (selectedSignal.trendBias === "SELL" && triggerPrice !== null) {
        setBotUpdate(`Keine Position: Verkauf-Stop wartet unter ${formatInstrumentPrice(selectedSignal.instrument, triggerPrice)}.`);
        return;
      }

      setBotUpdate("Keine Position: Kein Trendvorteil, daher warten.");
      return;
    }

    if (botPosition.status === "LONG") {
      let nextStop = botPosition.stopLoss;
      const profit = profitDistanceLong - botPosition.entryPrice;

      if (profit >= botPosition.atr) {
        nextStop = Math.max(nextStop, botPosition.entryPrice);
      }

      if (profit >= botPosition.atr * 2) {
        nextStop = Math.max(nextStop, selectedSignal.ema20, bid - botPosition.atr);
      }

      if (selectedSignal.ema20 < selectedSignal.ema50) {
        setBotPosition(null);
        setBotUpdate("Jetzt aussteigen: Trend ist von Kauf auf Verkauf gekippt.");
        return;
      }

      if (bid <= nextStop) {
        setBotPosition(null);
        setBotUpdate(`Jetzt aussteigen: Kauf-Stop getroffen bei ${formatInstrumentPrice(selectedSignal.instrument, bid)}.`);
        return;
      }

      if (bid >= botPosition.takeProfit) {
        setBotPosition(null);
        setBotUpdate(`Jetzt aussteigen: Kauf-Ziel erreicht bei ${formatInstrumentPrice(selectedSignal.instrument, bid)}.`);
        return;
      }

      if (nextStop !== botPosition.stopLoss) {
        setBotPosition({ ...botPosition, stopLoss: Number(nextStop.toFixed(6)) });
      }

      setBotUpdate(`Kaufposition laeuft. Nachgezogener Stop aktiv bei ${formatInstrumentPrice(selectedSignal.instrument, nextStop)}.`);
      return;
    }

    let nextStop = botPosition.stopLoss;
    const profit = botPosition.entryPrice - profitDistanceShort;

    if (profit >= botPosition.atr) {
      nextStop = Math.min(nextStop, botPosition.entryPrice);
    }

    if (profit >= botPosition.atr * 2) {
      nextStop = Math.min(nextStop, selectedSignal.ema20, ask + botPosition.atr);
    }

    if (selectedSignal.ema20 > selectedSignal.ema50) {
      setBotPosition(null);
      setBotUpdate("Jetzt aussteigen: Trend ist von Verkauf auf Kauf gekippt.");
      return;
    }

    if (ask >= nextStop) {
      setBotPosition(null);
      setBotUpdate(`Jetzt aussteigen: Verkauf-Stop getroffen bei ${formatInstrumentPrice(selectedSignal.instrument, ask)}.`);
      return;
    }

    if (ask <= botPosition.takeProfit) {
      setBotPosition(null);
      setBotUpdate(`Jetzt aussteigen: Verkauf-Ziel erreicht bei ${formatInstrumentPrice(selectedSignal.instrument, ask)}.`);
      return;
    }

    if (nextStop !== botPosition.stopLoss) {
      setBotPosition({ ...botPosition, stopLoss: Number(nextStop.toFixed(6)) });
    }

    setBotUpdate(`Verkaufsposition laeuft. Nachgezogener Stop aktiv bei ${formatInstrumentPrice(selectedSignal.instrument, nextStop)}.`);
  }, [botPosition, entryAllowedByProfile, entryAllowedBySession, riskProfile, selectedSignal, sessionMode]);

  const botSummary = useMemo<BotSummary | null>(() => {
    if (!selectedSignal) return null;

    const triggerPrice = parseNumeric(selectedSignal.triggerPrice);
    const spread = selectedSignal.spread ?? selectedSignal.maxSpread;
    const spreadTooHigh = spread > selectedSignal.maxSpread;

    if (botPosition?.status === "LONG") {
      return {
        status: "LONG",
        action: botUpdate.startsWith("Jetzt aussteigen") ? "EXIT" : "BUY",
        entry: `Kauf @ ${formatInstrumentPrice(selectedSignal.instrument, botPosition.entryPrice)}`,
        exitPlan: `SL ${formatInstrumentPrice(selectedSignal.instrument, botPosition.stopLoss)} | TP ${formatInstrumentPrice(selectedSignal.instrument, botPosition.takeProfit)} | Trail ab +1 ATR`,
        update: botUpdate,
        reason: "Kaufposition aktiv. Ausstieg bei Trendwechsel, Stop, Ziel oder nachgezogenem Stop.",
      };
    }

    if (botPosition?.status === "SHORT") {
      return {
        status: "SHORT",
        action: botUpdate.startsWith("Jetzt aussteigen") ? "EXIT" : "SELL",
        entry: `Verkauf @ ${formatInstrumentPrice(selectedSignal.instrument, botPosition.entryPrice)}`,
        exitPlan: `SL ${formatInstrumentPrice(selectedSignal.instrument, botPosition.stopLoss)} | TP ${formatInstrumentPrice(selectedSignal.instrument, botPosition.takeProfit)} | Trail ab +1 ATR`,
        update: botUpdate,
        reason: "Verkaufsposition aktiv. Ausstieg bei Trendwechsel, Stop, Ziel oder nachgezogenem Stop.",
      };
    }

    if (spreadTooHigh) {
      return {
        status: "FLAT",
        action: "WAIT",
        entry: `WARTEN: Spread ${spread.toFixed(6)} > ${selectedSignal.maxSpread.toFixed(6)}`,
        exitPlan: `Kein Trade bis Spread <= ${selectedSignal.maxSpread.toFixed(6)}`,
        update: botUpdate,
        reason: "Spread-Filter blockiert Entries.",
      };
    }

    if (!entryAllowedBySession) {
      return {
        status: "FLAT",
        action: "WAIT",
        entry: `WARTEN: ${selectedSignal.instrument} passt aktuell nicht zu ${sessionMode}`,
        exitPlan: `Session-Fokus fuer ${sessionMode} beachten`,
        update: botUpdate,
        reason: sessionBias,
      };
    }

    if (!entryAllowedByProfile) {
      return {
        status: "FLAT",
        action: "WAIT",
        entry: `WARTEN: Profil ${riskProfileLabel(riskProfile)} verlangt strengere Bedingungen`,
        exitPlan: `Mindestens ${profileConfig.minConfidence}% Vertrauen${profileConfig.allowStopEntries ? "" : " und Sofort-Einstieg"} noetig`,
        update: botUpdate,
        reason: "Risikoprofil beeinflusst Freigabe, Stop-Orders und Mindestvertrauen.",
      };
    }

    if (selectedSignal.trendBias === "BUY" && triggerPrice !== null) {
      return {
        status: "FLAT",
        action: selectedSignal.entryMode === "NOW" ? "BUY" : "WAIT",
        entry:
          selectedSignal.entryMode === "NOW"
            ? `JETZT KAUFEN @ ${formatInstrumentPrice(selectedSignal.instrument, selectedSignal.ask ?? selectedSignal.rawPrice)}`
            : `KAUF-STOP @ ${formatInstrumentPrice(selectedSignal.instrument, triggerPrice)}`,
        exitPlan: `SL ${selectedSignal.stopLoss} | TP ${selectedSignal.takeProfit}`,
        update: botUpdate,
        reason: selectedSignal.catalyst,
      };
    }

    if (selectedSignal.trendBias === "SELL" && triggerPrice !== null) {
      return {
        status: "FLAT",
        action: selectedSignal.entryMode === "NOW" ? "SELL" : "WAIT",
        entry:
          selectedSignal.entryMode === "NOW"
            ? `JETZT VERKAUFEN @ ${formatInstrumentPrice(selectedSignal.instrument, selectedSignal.bid ?? selectedSignal.rawPrice)}`
            : `VERKAUF-STOP @ ${formatInstrumentPrice(selectedSignal.instrument, triggerPrice)}`,
        exitPlan: `SL ${selectedSignal.stopLoss} | TP ${selectedSignal.takeProfit}`,
        update: botUpdate,
        reason: selectedSignal.catalyst,
      };
    }

    return {
      status: "FLAT",
      action: "WAIT",
      entry: "Warten",
      exitPlan: `SL ${selectedSignal.stopLoss} | TP ${selectedSignal.takeProfit}`,
      update: botUpdate,
      reason: selectedSignal.catalyst,
    };
  }, [botPosition, botUpdate, entryAllowedByProfile, entryAllowedBySession, profileConfig.allowStopEntries, profileConfig.minConfidence, riskProfile, selectedSignal, sessionBias, sessionMode]);

  const riskModel = useMemo(() => {
    if (!selectedSignal) return null;

    const stopValue = parseNumeric(selectedSignal.stopLoss);
    const effectiveRiskPercent = Math.min(riskPercent, profileConfig.riskCapPercent);
    if (stopValue === null) {
      return {
        riskCapital: accountSize * (effectiveRiskPercent / 100),
        stopDistance: null,
        positionSize: null,
        notionalExposure: null,
      };
    }

    const stopDistance = Math.abs(selectedSignal.rawPrice - stopValue);
    if (stopDistance <= 0) {
      return {
        riskCapital: accountSize * (effectiveRiskPercent / 100),
        stopDistance: null,
        positionSize: null,
        notionalExposure: null,
      };
    }

    const riskCapital = accountSize * (effectiveRiskPercent / 100);
    const positionSize = riskCapital / stopDistance;
    const notionalExposure = positionSize * selectedSignal.rawPrice;

    return {
      riskCapital,
      stopDistance,
      positionSize,
      notionalExposure,
    };
  }, [accountSize, profileConfig.riskCapPercent, riskPercent, selectedSignal]);

  const addJournalEntry = async () => {
    if (!selectedSignal || !user) return;

    const payload = {
      user_id: user.id,
      instrument: selectedSignal.instrument,
      signal: selectedSignal.signal,
      entry: selectedSignal.entryZone,
      stop_loss: selectedSignal.stopLoss,
      take_profit: selectedSignal.takeProfit,
      status: journalStatus,
      notes: journalNotes.trim(),
    };

    const { data, error } = await supabase
      .from("cfd_trade_journal")
      .insert(payload)
      .select("id, instrument, signal, entry, stop_loss, take_profit, status, notes, created_at")
      .single();

    if (error || !data) {
      return;
    }

    const nextEntry: JournalEntry = {
      id: data.id,
      instrument: data.instrument as Instrument,
      signal: data.signal as SignalSide,
      entry: data.entry,
      stopLoss: data.stop_loss,
      takeProfit: data.take_profit,
      status: data.status as JournalStatus,
      notes: data.notes,
      createdAt: data.created_at,
    };

    setJournal((previous) => [nextEntry, ...previous].slice(0, 50));
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
                CFD-Handel
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                CFD-Signalzentrale
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300/80 md:text-base">
                Serverseitige Signal-Engine mit `EMA20`, `EMA50`, `ATR`, Regime-Erkennung
                und Session-Scoring fuer EUR/USD. Dazu jetzt mit
                Positionsgroessen-Rechner, Signal-Historie und manuellem Plus500-Journal.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Kaufsignale</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">{summary.buyCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Verkaufssignale</div>
                <div className="mt-1 text-2xl font-semibold text-rose-300">{summary.sellCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Warte-Setups</div>
                <div className="mt-1 text-2xl font-semibold text-amber-200">{summary.waitCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Durchschn. Vertrauen</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{summary.avgConfidence}%</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Datenfeed und Ausfuehrung</div>
                <h2 className="mt-1 text-xl font-semibold">Manueller Plus500-Ablauf</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${feedStatusClass(feedStatus)}`}>
                {feedStatusLabel(feedStatus)}
              </span>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Speicherung</div>
                <div className="mt-1 font-semibold text-slate-100">
                  {user ? "Mit Supabase synchronisiert" : "Anmeldung fuer Historie und Journal erforderlich"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Quelle</div>
                <div className="mt-1 font-semibold text-slate-100">{source}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Preisabdeckung</div>
                <div className="mt-1 font-semibold text-slate-100">
                  {signals
                    .map((entry) => `${entry.instrument}: ${entry.priceSource}`)
                    .join(" | ")}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Feed-Zeitpunkt</div>
                <div className="mt-1 font-semibold text-slate-100">{formatDateTime(updatedAt)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Aktueller Session-Bias</div>
                <div className="mt-1 font-semibold text-slate-100">{sessionBias}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-500">Feed-Fehler</div>
                <div className="mt-1 text-slate-300">{feedError || "Kein Upstream-Fehler gemeldet."}</div>
                {Object.keys(marketErrors).length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs text-slate-400">
                    {(Object.entries(marketErrors) as Array<[Instrument, string]>).map(
                      ([instrument, error]) => (
                        <div key={instrument}>
                          <span className="text-slate-500">{instrument}:</span> {error}
                        </div>
                      )
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Session-Modus
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
                Risikoprofil
                <select
                  value={riskProfile}
                  onChange={(event) => setRiskProfile(event.target.value as RiskProfile)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                >
                  <option value="Conservative">Konservativ</option>
                  <option value="Balanced">Ausgewogen</option>
                  <option value="Aggressive">Aggressiv</option>
                </select>
                <div className="mt-2 text-[11px] text-slate-500">
                  Session wirkt jetzt direkt auf priorisierte Maerkte und Entry-Freigaben.
                </div>
              </label>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Risikorahmen</div>
            <h2 className="mt-1 text-xl font-semibold">Ausfuehrungsparameter</h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Risiko pro Trade</div>
                <div className="mt-1 text-2xl font-semibold text-rose-200">{profileConfig.maxRiskPerTrade}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Offene Signale</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{profileConfig.maxOpenSignals}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-slate-500">Ausfuehrungsstil</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{profileConfig.executionStyle}</div>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signaltafel</div>
              <h2 className="mt-1 text-xl font-semibold">EUR/USD</h2>
            </div>
            <div className="text-xs text-slate-500">Echtzeitstream ueber Twelve Data und `/api/trading/cfd/live`.</div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-1">
            {signals.map((signal) => (
              <article
                key={signal.instrument}
                className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82))] p-5 shadow-lg shadow-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {signal.symbol === signal.instrument ? "Echtzeit-Setup" : signal.symbol}
                    </div>
                    <h3 className="mt-1 text-2xl font-semibold">{signal.instrument}</h3>
                    <div className="mt-1 text-sm text-slate-400">
                      Kurs {signal.price} <span className="ml-2">{formatPct(signal.changePct)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${signalClass(signal.signal)}`}>
                      {signalLabel(signal.signal)}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${regimeClass(signal.regime)}`}>
                      {regimeLabel(signal.regime)}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${riskClass(signal.risk)}`}>
                      {riskLabel(signal.risk)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3 col-span-2">
                    <div className="text-slate-500">Preisquelle</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.priceSource}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Trendrichtung</div>
                    <div className="mt-1 font-semibold text-slate-100">{signalLabel(signal.trendBias)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Einstiegsmodus</div>
                    <div className="mt-1 font-semibold text-slate-100">{entryModeLabel(signal.entryMode)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Einstieg</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.entryZone}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Trigger-Kurs</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.triggerPrice}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Vertrauen</div>
                    <div className="mt-1 font-semibold text-slate-100">{signal.confidence}%</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Stop-Loss</div>
                    <div className="mt-1 font-semibold text-rose-200">{signal.stopLoss}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Take-Profit</div>
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
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Geld / Brief</div>
                    <div className="mt-1 font-semibold text-slate-100">
                      {signal.bid !== null && signal.ask !== null ? `${signal.bid} / ${signal.ask}` : "k.A."}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <div className="text-slate-500">Spread</div>
                    <div className="mt-1 font-semibold text-slate-100">
                      {signal.spread !== null ? signal.spread : "k.A."}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Ausloeser</div>
                  <div className="mt-2 text-sm text-slate-200">{signal.catalyst}</div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">Einschaetzung</div>
                  <div className="mt-2 text-sm text-slate-300">{signal.thesis}</div>
                </div>

                <div className="mt-5 space-y-2 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-slate-200">
                  <div>In Plus500 ausfuehren als: {signal.plus500ExecutionText}</div>
                  <div>Spread-Pruefung: {signal.maxSpreadNote}</div>
                  <div>Preis aktualisiert: {formatDateTime(updatedAt || signal.updatedAt)}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Marktbild</div>
            <h2 className="mt-1 text-xl font-semibold">Spread, Volatilitaet, Trend</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {intelligencePanel.map((entry) => (
                <div
                  key={`intel-${entry.instrument}`}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="font-semibold text-slate-100">{entry.instrument}</div>
                  <div className="mt-3 text-sm text-slate-400">Spread</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{entry.spreadLabel}</div>
                  <div className="mt-3 text-sm text-slate-400">Volatilitaet</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{entry.volatilityLabel}</div>
                  <div className="mt-3 text-sm text-slate-400">Trendstaerke</div>
                  <div className="mt-1 text-sm font-semibold text-sky-200">{entry.trendStrength}/100</div>
                  <div className="mt-3 text-sm text-slate-400">Liquiditaet</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{entry.liquidityQuality}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Volatilitaets-Scanner</div>
            <h2 className="mt-1 text-xl font-semibold">Schnellste Maerkte</h2>

            <div className="mt-5 space-y-3">
              {volatilityScanner.map((entry) => (
                <div
                  key={`scanner-${entry.instrument}`}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-100">
                      #{entry.rank} {entry.instrument}
                    </div>
                    <div className="text-slate-400">{regimeLabel(entry.regime)}</div>
                  </div>
                  <div className="mt-2 text-slate-300">
                    ATR % {formatPct(entry.atrPct)} | Momentum {formatPct(entry.momentumPct)}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Breakout-Detektor</div>
              <h2 className="mt-1 text-xl font-semibold">Kandidaten fuer Trendexpansion</h2>
            </div>
            <div className="text-xs text-slate-500">
              Vertrauen &gt;= 70, Trend-Regime, steigende Aktivitaet
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {breakoutDetector.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-400">
                Kein Markt erfuellt aktuell die Breakout-Kriterien.
              </div>
            ) : (
              breakoutDetector.map((signal) => (
                <div
                  key={`breakout-${signal.instrument}`}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-100">
                      {signal.instrument} {signalLabel(signal.signal)}
                    </div>
                    <div className="text-slate-400">{signal.confidence}% Vertrauen</div>
                  </div>
                  <div className="mt-2 text-slate-300">
                    Regime {regimeLabel(signal.regime)} | Momentum {formatPct(signal.momentumPct)} | ATR {signal.atr}
                  </div>
                  <div className="mt-2 text-slate-300">
                    In Plus500 ausfuehren als: {signal.plus500ExecutionText}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Bot-Status</div>
                <h2 className="mt-1 text-xl font-semibold">Einstiegs- / Ausstiegslogik</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${signalClass(botSummary?.action === "EXIT" ? "WAIT" : botSummary?.action === "SELL" ? "SELL" : botSummary?.action === "BUY" ? "BUY" : "WAIT")}`}>
                {positionStateLabel(botSummary?.status || "FLAT")}
              </span>
            </div>

            {botSummary && (
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-slate-500">Aktion</div>
                  <div className="mt-1 text-xl font-semibold text-slate-100">{botActionLabel(botSummary.action)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-slate-500">Einstieg</div>
                  <div className="mt-1 font-semibold text-slate-100">{botSummary.entry}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-slate-500">Ausstiegsplan</div>
                  <div className="mt-1 font-semibold text-slate-100">{botSummary.exitPlan}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-slate-500">Aktualisierung</div>
                  <div className="mt-1 text-slate-200">{botSummary.update}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-slate-500">Begruendung</div>
                  <div className="mt-1 text-slate-300">{botSummary.reason}</div>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Risikorechner</div>
                <h2 className="mt-1 text-xl font-semibold">Positionsgroesse</h2>
              </div>
              <span className="text-xs text-slate-500">Kontobasiert und signalabhaengig</span>
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
                Kontogroesse in USD
                <input
                  type="number"
                  step="100"
                  value={accountSize}
                  onChange={(event) => setAccountSize(Number(event.target.value || 0))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
                />
              </label>

              <label className="text-xs text-slate-400">
                Risiko in %
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
                    {selectedSignal.instrument} {signalLabel(selectedSignal.signal)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Risikokapital</div>
                  <div className="mt-1 text-xl font-semibold text-rose-200">
                    {riskModel ? formatUsd(riskModel.riskCapital) : "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Stop-Abstand</div>
                  <div className="mt-1 text-xl font-semibold text-slate-100">
                    {riskModel?.stopDistance ? riskModel.stopDistance.toFixed(4) : "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-slate-500">Positionsgroesse</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-300">
                    {riskModel?.positionSize ? riskModel.positionSize.toFixed(2) : "-"}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
              Exponierung: {riskModel?.notionalExposure ? formatUsd(riskModel.notionalExposure) : "nicht berechenbar"}.
              Wenn kein numerischer Stop vorliegt, bleibt der Rechner bewusst konservativ.
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Journal</div>
                <h2 className="mt-1 text-xl font-semibold">Manuelle Plus500-Eintraege</h2>
              </div>
              <span className="text-xs text-slate-500">In Supabase gespeichert</span>
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
                    <option value="planned">{journalStatusLabel("planned")}</option>
                    <option value="executed">{journalStatusLabel("executed")}</option>
                    <option value="closed">{journalStatusLabel("closed")}</option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Notizen
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
                  disabled={!user}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
                >
                  Journaleintrag speichern
                </button>
                {!user && (
                  <div className="text-xs text-amber-200">
                    Zum Speichern musst du eingeloggt sein, damit der Eintrag in Supabase deinem User zugeordnet wird.
                  </div>
                )}
              </div>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signal-Historie</div>
            <h2 className="mt-1 text-xl font-semibold">Letzte Signalwechsel</h2>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Zeit</th>
                    <th className="px-4 py-3 font-medium">Instrument</th>
                    <th className="px-4 py-3 font-medium">Signal</th>
                    <th className="px-4 py-3 font-medium">Regime</th>
                    <th className="px-4 py-3 font-medium">Vertrauen</th>
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
                        <td className="px-4 py-3">{signalLabel(entry.signal)}</td>
                        <td className="px-4 py-3">{regimeLabel(entry.regime)}</td>
                        <td className="px-4 py-3">{entry.confidence}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Trade-Journal</div>
            <h2 className="mt-1 text-xl font-semibold">Manuelles Ausfuehrungsprotokoll</h2>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Zeit</th>
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
                        <td className="px-4 py-3">{signalLabel(entry.signal)}</td>
                        <td className="px-4 py-3">{journalStatusLabel(entry.status)}</td>
                        <td className="px-4 py-3">
                          <div>Einstieg {entry.entry}</div>
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Hinweise</div>
            <h2 className="mt-1 text-xl font-semibold">Handelbare Signale</h2>

            <div className="mt-5 space-y-3 text-sm text-slate-300">
              {actionableSignals.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  Keine frischen Kauf- oder Verkaufssignale. Das System sieht aktuell kein A-Setup.
                </div>
              ) : (
                actionableSignals.map((signal) => (
                  <div key={signal.instrument} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-100">{signal.instrument} {signalLabel(signal.signal)}</div>
                      <div className="text-xs text-slate-500">{signal.confidence}% Vertrauen</div>
                    </div>
                    <div className="mt-1 text-slate-300">
                      {signal.plus500ExecutionText} | Einstieg {signal.entryZone} | Stop {signal.stopLoss} | TP {signal.takeProfit}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Handelsregeln</div>
            <h2 className="mt-1 text-xl font-semibold">Was die Engine macht</h2>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Regime-Erkennung</div>
                <div className="mt-1 text-slate-300">EMA20 vs EMA50 plus ATR entscheiden, ob Trend oder Seitwaertsphase vorliegt.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Setup-Generator</div>
                <div className="mt-1 text-slate-300">Einstieg, Stop-Loss und Take-Profit werden live aus ATR und Trendfilter berechnet.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-semibold text-slate-100">Speicherung</div>
                <div className="mt-1 text-slate-300">Signal-Historie und manuelles Journal werden lokal im Browser gespeichert.</div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
