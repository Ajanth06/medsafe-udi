import { NextResponse } from "next/server";
import { CFD_INSTRUMENTS, type Instrument } from "../../../../../lib/tradingCfdInstruments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignalSide = "BUY" | "SELL" | "WAIT";
type EntryMode = "NOW" | "STOP" | "WAIT";
type Regime = "Trend" | "Range";
type RiskLevel = "Low" | "Medium" | "High";
type SessionTag = "London" | "New York" | "Overlap" | "Ausserhalb";

type InstrumentConfig = (typeof CFD_INSTRUMENTS)[number];
type SeriesValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type SeriesResponse = {
  status?: string;
  message?: string;
  values?: SeriesValue[];
};

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

const CONFIGS: InstrumentConfig[] = CFD_INSTRUMENTS;

const fetchJson = async (url: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "medsafe-cfd-signals" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`upstream_error:${response.status}:${new URL(url).hostname}`);
  }

  return response.json();
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("invalid_number");
  return parsed;
};

const isPricePlausible = (config: InstrumentConfig, price: number) =>
  price >= config.minPrice && price <= config.maxPrice;

const fetchSeriesForConfig = async (config: InstrumentConfig, apiKey: string) => {
  const errors: string[] = [];

  for (const symbol of config.symbolCandidates) {
    try {
      const series = (await fetchJson(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=15min&outputsize=70&apikey=${apiKey}`
      )) as SeriesResponse;

      if (series.status === "error" || !series.values?.length) {
        throw new Error(series.message || "twelvedata_series_failed");
      }

      const latestClose = toNumber(series.values[0]?.close);

      if (!isPricePlausible(config, latestClose)) {
        throw new Error(`implausible_price:${latestClose}`);
      }

      return {
        symbol,
        values: series.values,
      };
    } catch (error) {
      errors.push(
        `${symbol}:${error instanceof Error ? error.message : "twelvedata_series_failed"}`
      );
    }
  }

  throw new Error(errors.join(" | "));
};

const detectSession = (): SessionTag => {
  const hour = new Date().getUTCHours();
  if (hour >= 12 && hour < 16) return "Overlap";
  if (hour >= 7 && hour < 12) return "London";
  if (hour >= 16 && hour < 21) return "New York";
  return "Ausserhalb";
};

const computeEma = (values: number[], period: number) => {
  const multiplier = 2 / (period + 1);
  let ema = values[0];
  for (let index = 1; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
  }
  return ema;
};

const computeAtr = (candles: SeriesValue[], period: number) => {
  const trueRanges = candles.slice(1).map((entry, index) => {
    const high = toNumber(entry.high);
    const low = toNumber(entry.low);
    const previousClose = toNumber(candles[index].close);
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });
  const sample = trueRanges.slice(-period);
  return sample.reduce((sum, value) => sum + value, 0) / Math.max(sample.length, 1);
};

const formatPrice = (instrument: Instrument, value: number) => {
  if (instrument === "EUR/USD") return value.toFixed(4);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
};

const sessionScoreFor = (instrument: Instrument, session: SessionTag) => {
  if (session === "Overlap") return 15;
  if (instrument === "EUR/USD" && session === "London") return 15;
  return 0;
};

const riskFor = (instrument: Instrument, regime: Regime): RiskLevel => {
  if (instrument === "EUR/USD" && regime === "Trend") return "Low";
  return "Medium";
};

const estimateBidAsk = (price: number, spread: number) => {
  const halfSpread = spread / 2;
  return {
    bid: Number((price - halfSpread).toFixed(6)),
    ask: Number((price + halfSpread).toFixed(6)),
    spread: Number(spread.toFixed(6)),
  };
};

const buildLevels = (
  config: InstrumentConfig,
  signal: SignalSide,
  entryMode: EntryMode,
  trendSide: Exclude<SignalSide, "WAIT"> | null,
  atr: number,
  ema20: number,
  swingHigh: number,
  swingLow: number,
  bid: number,
  ask: number
) => {
  const setupSide = signal !== "WAIT" ? signal : trendSide;

  if (!setupSide) {
    return {
      entryZone: `Warten nahe ${formatPrice(config.instrument, ema20)}`,
      stopLoss: formatPrice(config.instrument, ema20),
      takeProfit: formatPrice(config.instrument, ema20),
      riskReward: "1 : 0.0",
    };
  }

  const triggerLevel = setupSide === "BUY" ? Math.max(ema20, swingHigh) : Math.min(ema20, swingLow);
  const anchor = signal === "WAIT" ? triggerLevel : setupSide === "BUY" ? ask : bid;
  const stop = setupSide === "BUY"
    ? anchor - atr * config.atrStopMultiplier
    : anchor + atr * config.atrStopMultiplier;
  const take = setupSide === "BUY"
    ? anchor + atr * config.atrTakeMultiplier
    : anchor - atr * config.atrTakeMultiplier;
  const reward = Math.abs(take - anchor);
  const risk = Math.abs(anchor - stop);

  return {
    entryZone:
      signal === "WAIT" || entryMode === "STOP"
        ? `${setupSide === "BUY" ? "Kauf-Stop" : "Verkauf-Stop"} ${setupSide === "BUY" ? "ueber" : "unter"} ${formatPrice(config.instrument, triggerLevel)}`
        : `${setupSide === "BUY" ? "Jetzt kaufen" : "Jetzt verkaufen"} @ ${formatPrice(config.instrument, anchor)}`,
    stopLoss: formatPrice(config.instrument, stop),
    takeProfit: formatPrice(config.instrument, take),
    riskReward: `1 : ${(reward / Math.max(risk, Number.EPSILON)).toFixed(1)}`,
  };
};

const buildSignal = (
  config: InstrumentConfig,
  symbol: string,
  values: SeriesValue[]
) => {
  if (values.length < 55) throw new Error("insufficient_series");

  const candles = [...values].reverse();
  const closes = candles.map((entry) => toNumber(entry.close));
  const price = closes[closes.length - 1];
  const previous = closes[closes.length - 2];
  const ema20 = computeEma(closes.slice(-20), 20);
  const ema50 = computeEma(closes.slice(-50), 50);
  const atr = computeAtr(candles.slice(-20), 14);
  const recentAtr = computeAtr(candles.slice(-35, -10), 14);
  const atrPct = (atr / price) * 100;
  const momentumPct = ((price - closes[closes.length - 4]) / closes[closes.length - 4]) * 100;
  const highs = candles.map((entry) => toNumber(entry.high));
  const lows = candles.map((entry) => toNumber(entry.low));
  const recentSwingHigh = Math.max(...highs.slice(-6, -1));
  const recentSwingLow = Math.min(...lows.slice(-6, -1));
  const volumes = candles.map((entry) => Number(entry.volume || 0));
  const recentVolume = volumes.slice(-6, -1).filter((value) => value > 0);
  const avgVolume = recentVolume.reduce((sum, value) => sum + value, 0) / Math.max(recentVolume.length, 1);
  const currentVolume = volumes[volumes.length - 1];
  const volumeRising = currentVolume > 0 ? currentVolume > avgVolume : atr > recentAtr;
  const emaGapPct = (Math.abs(ema20 - ema50) / price) * 100;
  const volatilityExpansion = atr > recentAtr * 1.08;
  const regime: Regime = emaGapPct > atrPct * 0.35 ? "Trend" : "Range";
  const biasLong = ema20 > ema50;
  const biasShort = ema20 < ema50;
  const crossedAboveEma20 = previous <= ema20 && price > ema20;
  const crossedBelowEma20 = previous >= ema20 && price < ema20;
  const brokeSwingHigh = price > recentSwingHigh;
  const brokeSwingLow = price < recentSwingLow;
  const buyTrigger = biasLong && (crossedAboveEma20 || brokeSwingHigh);
  const sellTrigger = biasShort && (crossedBelowEma20 || brokeSwingLow);
  const trendSide: Exclude<SignalSide, "WAIT"> | null = biasLong ? "BUY" : biasShort ? "SELL" : null;
  const trendScore = regime === "Trend" && (biasLong || biasShort) ? 30 : 0;
  const triggerScore = buyTrigger || sellTrigger ? 30 : 0;
  const momentumScore =
    (biasLong && momentumPct > 0.04) || (biasShort && momentumPct < -0.04) ? 20 : 0;
  const qualityScore = volatilityExpansion || volumeRising ? 20 : 0;
  const session = detectSession();
  const sessionScore = sessionScoreFor(config.instrument, session);
  const confidence = Math.min(100, trendScore + triggerScore + momentumScore + qualityScore + sessionScore);

  let signal: SignalSide = "WAIT";
  if (buyTrigger && confidence >= 55) signal = "BUY";
  if (sellTrigger && confidence >= 55) signal = "SELL";
  const { bid, ask, spread } = estimateBidAsk(price, config.estimatedSpread);
  const spreadAccepted = spread <= config.estimatedSpread;
  const triggerPriceValue = trendSide === "BUY"
    ? Math.max(ema20, recentSwingHigh)
    : trendSide === "SELL"
      ? Math.min(ema20, recentSwingLow)
      : null;
  const entryMode: EntryMode =
    !spreadAccepted || !trendSide
      ? "WAIT"
      : trendSide === "BUY"
        ? ask >= (triggerPriceValue ?? Number.POSITIVE_INFINITY)
          ? "NOW"
          : "STOP"
        : bid <= (triggerPriceValue ?? Number.NEGATIVE_INFINITY)
          ? "NOW"
          : "STOP";
  const effectiveSignal =
    spreadAccepted && entryMode === "NOW" && trendSide ? trendSide : "WAIT";
  const executionSide = signal !== "WAIT" ? signal : trendSide;

  return {
    instrument: config.instrument,
    symbol,
    price: formatPrice(config.instrument, price),
    rawPrice: Number(price.toFixed(6)),
    bid,
    ask,
    spread,
    priceSource: `Twelve Data (${symbol}) + geschaetzter Spread`,
    changePct: Number((((price - previous) / previous) * 100).toFixed(2)),
    signal: effectiveSignal,
    trendBias: trendSide ?? "WAIT",
    entryMode,
    triggerPrice: triggerPriceValue !== null ? formatPrice(config.instrument, triggerPriceValue) : "Nicht verfuegbar",
    maxSpread: Number(config.estimatedSpread.toFixed(6)),
    regime,
    ema20: Number(ema20.toFixed(6)),
    ema50: Number(ema50.toFixed(6)),
    atr: Number(atr.toFixed(config.instrument === "EUR/USD" ? 5 : 2)),
    atrPct: Number(atrPct.toFixed(2)),
    momentumPct: Number(momentumPct.toFixed(2)),
    volumeRising,
    volumeSource: currentVolume > 0 ? "exchange volume" : "atr proxy",
    confidence,
    session,
    maxSpreadNote: config.maxSpreadNote,
    plus500ExecutionText:
      executionSide === "BUY"
        ? effectiveSignal === "BUY"
          ? `KAUF ${config.plus500MarketName} zum Briefkurs ${formatPrice(config.instrument, ask)}`
          : `Kauf-Stop ueber ${formatPrice(config.instrument, Math.max(ema20, recentSwingHigh))}`
        : executionSide === "SELL"
          ? effectiveSignal === "SELL"
            ? `VERKAUF ${config.plus500MarketName} zum Geldkurs ${formatPrice(config.instrument, bid)}`
            : `Verkauf-Stop unter ${formatPrice(config.instrument, Math.min(ema20, recentSwingLow))}`
          : `WARTEN ${config.plus500MarketName}`,
    catalyst:
      !spreadAccepted
        ? `Spread liegt ueber Limit ${formatPrice(config.instrument, config.estimatedSpread)} und blockiert Entries`
        : effectiveSignal === "BUY"
        ? "EMA20 liegt ueber EMA50 und der Preis bricht ueber EMA20 oder das letzte Swing-High"
        : effectiveSignal === "SELL"
          ? "EMA20 liegt unter EMA50 und der Preis bricht unter EMA20 oder das letzte Swing-Low"
          : trendSide === "BUY"
            ? "Trend bleibt auf Kaufseite, der Ausbruch ist noch nicht bestaetigt"
            : trendSide === "SELL"
              ? "Trend bleibt auf Verkaufsseite, der Ausbruch ist noch nicht bestaetigt"
              : "EMA20 und EMA50 liefern aktuell keinen klaren Trend",
    thesis:
      effectiveSignal === "BUY"
        ? "Plus500-Stil Kauf: Einstieg ueber Briefkurs, Stop via 1.5 ATR, Ziel via 2.0 ATR."
        : effectiveSignal === "SELL"
          ? "Plus500-Stil Verkauf: Einstieg ueber Geldkurs, Stop via 1.5 ATR, Ziel via 2.0 ATR."
          : !spreadAccepted
            ? "Spread zu hoch. Bot bleibt ohne Position, bis der Markt wieder handelbar ist."
          : trendSide === "BUY"
            ? "Trend zeigt Kaufseite. Einstieg erst beim Break ueber EMA20 oder Swing-High."
            : trendSide === "SELL"
              ? "Trend zeigt Verkaufsseite. Einstieg erst beim Break unter EMA20 oder Swing-Low."
              : "Ohne Trend bleibt das Setup defensiv.",
    updatedAt: candles[candles.length - 1]?.datetime || new Date().toISOString(),
    risk: riskFor(config.instrument, regime),
    ...buildLevels(
      config,
      effectiveSignal,
      entryMode,
      trendSide,
      atr,
      ema20,
      recentSwingHigh,
      recentSwingLow,
      bid,
      ask
    ),
  } satisfies MarketSignal;
};

const buildUnavailableSignal = (
  config: InstrumentConfig,
  message: string
): MarketSignal => ({
  instrument: config.instrument,
  symbol: config.symbolCandidates[0] || config.instrument,
  price: "nicht verfuegbar",
  rawPrice: 0,
  bid: null,
  ask: null,
  spread: null,
  priceSource: "Live-Feed nicht verfuegbar",
  changePct: 0,
  signal: "WAIT",
  trendBias: "WAIT",
  entryMode: "WAIT",
  triggerPrice: "Nicht verfuegbar",
  maxSpread: 0.00012,
  regime: "Range",
  ema20: 0,
  ema50: 0,
  atr: 0,
  atrPct: 0,
  momentumPct: 0,
  volumeRising: false,
  volumeSource: "none",
  confidence: 0,
  session: detectSession(),
  maxSpreadNote: config.maxSpreadNote,
  plus500ExecutionText: `Kein Live-${config.instrument}-Preis verfuegbar`,
  catalyst: message,
  thesis: "Ohne echten Live-Kurs wird kein handelbarer Wert angezeigt.",
  entryZone: "Nicht verfuegbar",
  stopLoss: "Nicht verfuegbar",
  takeProfit: "Nicht verfuegbar",
  riskReward: "Nicht verfuegbar",
  risk: riskFor(config.instrument, "Range"),
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const apiKey = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        error: "missing_twelvedata_api_key_for_signal_engine",
        signals: [],
      },
      { status: 500 }
    );
  }

  try {
    const results = await Promise.all(
      CONFIGS.map(async (config) => {
        try {
          const series = await fetchSeriesForConfig(config, apiKey);

          return {
            signal: buildSignal(config, series.symbol, series.values),
            error: null,
          };
        } catch (error) {
          const message =
            error instanceof Error ? `${config.instrument}:${error.message}` : `${config.instrument}:cfd_signal_route_failed`;
          return {
            signal: buildUnavailableSignal(config, message),
            error: message,
          };
        }
      })
    );

    const signals = results.map((entry) => entry.signal);
    const errors = results
      .map((entry) => entry.error)
      .filter((entry): entry is string => Boolean(entry));
    const marketErrors = Object.fromEntries(
      results
        .filter((entry) => entry.error)
        .map((entry) => [entry.signal.instrument, entry.error])
    );
  const hasLiveSignal = signals.some((entry) => entry.price !== "nicht verfuegbar");

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        source: "Twelve Data",
        error: errors.length > 0 ? errors.join(" | ") : undefined,
        marketErrors,
        hasLiveSignal,
        signals,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "cfd_signal_route_failed",
        signals: [],
      },
      { status: 500 }
    );
  }
}
