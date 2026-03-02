import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Instrument = "EUR/USD" | "DAX" | "WTI";
type SignalSide = "BUY" | "SELL" | "WAIT";
type Regime = "Trend" | "Range";
type RiskLevel = "Low" | "Medium" | "High";
type SessionTag = "London" | "New York" | "Overlap" | "Off Hours";

type InstrumentConfig = {
  instrument: Instrument;
  symbol: string;
  market: string;
  maxSpreadNote: string;
  plus500MarketName: string;
  atrStopMultiplier: number;
  atrTakeMultiplier: number;
  massiveTickers?: string[];
};

type QuoteResponse = {
  close?: string;
  percent_change?: string;
  bid?: number;
  ask?: number;
  source?: string;
  sourceLabel?: string;
};
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
  market: string;
  symbol: string;
  price: string;
  rawPrice: number;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  priceSource: string;
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

const CONFIGS: InstrumentConfig[] = [
  {
    instrument: "EUR/USD",
    symbol: "EUR/USD",
    market: "FX Major",
    maxSpreadNote: "Max 1.2 pip",
    plus500MarketName: "EUR/USD CFD",
    atrStopMultiplier: 1.3,
    atrTakeMultiplier: 2.6,
  },
  {
    instrument: "DAX",
    symbol: "DE40",
    market: "Index CFD",
    maxSpreadNote: "Max 2.5 points",
    plus500MarketName: "Germany 40 CFD",
    atrStopMultiplier: 1.4,
    atrTakeMultiplier: 2.8,
    massiveTickers: ["I:GDAXI", "I:DAX", "I:DE40"],
  },
  {
    instrument: "WTI",
    symbol: "WTI",
    market: "Commodity CFD",
    maxSpreadNote: "Max 0.06 USD",
    plus500MarketName: "Oil CFD",
    atrStopMultiplier: 1.5,
    atrTakeMultiplier: 3,
    massiveTickers: ["I:WTI", "I:CL1", "I:WTICRUDE"],
  },
];

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

const fetchPolygonForexQuote = async () => {
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    return null;
  }

  const data = await fetchJson(
    `https://api.polygon.io/v1/last_quote/currencies/EUR/USD?apiKey=${apiKey}`
  );
  const bid = toNumber(data.last?.bid);
  const ask = toNumber(data.last?.ask);

  return {
    bid,
    ask,
    close: ((bid + ask) / 2).toString(),
    source: "polygon",
    sourceLabel: "Polygon bid/ask",
  } satisfies QuoteResponse;
};

const fetchMassiveSnapshotQuote = async (config: InstrumentConfig) => {
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey || !config.massiveTickers?.length) {
    return null;
  }

  for (const ticker of config.massiveTickers) {
    try {
      const data = await fetchJson(
        `https://api.polygon.io/v3/snapshot/indices?ticker=${encodeURIComponent(ticker)}&apiKey=${apiKey}`
      );
      const result = Array.isArray(data.results) ? data.results[0] : null;
      const value = result?.value;

      if (typeof value === "number" && Number.isFinite(value)) {
        return {
          close: value.toString(),
          percent_change:
            typeof result?.session?.change_percent === "number"
              ? result.session.change_percent.toString()
              : undefined,
          source: "polygon",
          sourceLabel: `Massive index snapshot (${ticker})`,
        } satisfies QuoteResponse;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("invalid_number");
  return parsed;
};

const detectSession = (): SessionTag => {
  const hour = new Date().getUTCHours();
  if (hour >= 12 && hour < 16) return "Overlap";
  if (hour >= 7 && hour < 12) return "London";
  if (hour >= 16 && hour < 21) return "New York";
  return "Off Hours";
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
  if (instrument === "WTI") return value.toFixed(2);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
};

const sessionScoreFor = (instrument: Instrument, session: SessionTag) => {
  if (session === "Overlap") return 15;
  if (instrument === "EUR/USD" && session === "London") return 15;
  if (instrument === "DAX" && (session === "London" || session === "New York")) return 15;
  if (instrument === "WTI" && session === "New York") return 15;
  return 0;
};

const riskFor = (instrument: Instrument, regime: Regime): RiskLevel => {
  if (instrument === "EUR/USD" && regime === "Trend") return "Low";
  if (instrument === "WTI") return "High";
  return "Medium";
};

const buildLevels = (
  config: InstrumentConfig,
  signal: SignalSide,
  price: number,
  atr: number,
  ema20: number
) => {
  if (signal === "WAIT") {
    return {
      entryZone: `Wait near ${formatPrice(config.instrument, ema20)}`,
      stopLoss: "Pending confirmation",
      takeProfit: "Pending direction",
      riskReward: "Stand by",
    };
  }

  const anchor = signal === "BUY" ? Math.min(price, ema20) : Math.max(price, ema20);
  const stop = signal === "BUY"
    ? anchor - atr * config.atrStopMultiplier
    : anchor + atr * config.atrStopMultiplier;
  const take = signal === "BUY"
    ? anchor + atr * config.atrTakeMultiplier
    : anchor - atr * config.atrTakeMultiplier;
  const zoneLow = signal === "BUY" ? anchor - atr * 0.25 : anchor - atr * 0.15;
  const zoneHigh = signal === "BUY" ? anchor + atr * 0.15 : anchor + atr * 0.25;
  const reward = Math.abs(take - anchor);
  const risk = Math.abs(anchor - stop);

  return {
    entryZone: `${formatPrice(config.instrument, zoneLow)} - ${formatPrice(config.instrument, zoneHigh)}`,
    stopLoss: formatPrice(config.instrument, stop),
    takeProfit: formatPrice(config.instrument, take),
    riskReward: `1 : ${(reward / Math.max(risk, Number.EPSILON)).toFixed(1)}`,
  };
};

const buildSignal = (config: InstrumentConfig, quote: QuoteResponse, values: SeriesValue[]) => {
  if (values.length < 55) throw new Error("insufficient_series");

  const candles = [...values].reverse();
  const closes = candles.map((entry) => toNumber(entry.close));
  const price = quote.close ? toNumber(quote.close) : closes[closes.length - 1];
  const previous = closes[closes.length - 2];
  const ema20 = computeEma(closes.slice(-20), 20);
  const ema50 = computeEma(closes.slice(-50), 50);
  const atr = computeAtr(candles.slice(-20), 14);
  const recentAtr = computeAtr(candles.slice(-35, -10), 14);
  const atrPct = (atr / price) * 100;
  const momentumPct = ((price - closes[closes.length - 4]) / closes[closes.length - 4]) * 100;
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
  const trendScore = regime === "Trend" && (biasLong || biasShort) ? 25 : 0;
  const momentumScore =
    (biasLong && momentumPct > 0.04) || (biasShort && momentumPct < -0.04) ? 25 : 0;
  const qualityScore = volatilityExpansion || volumeRising ? 20 : 0;
  const session = detectSession();
  const sessionScore = sessionScoreFor(config.instrument, session);
  const confidence = Math.min(100, trendScore + momentumScore + qualityScore + sessionScore);

  let signal: SignalSide = "WAIT";
  if (confidence >= 70 && regime === "Trend" && biasLong) signal = "BUY";
  if (confidence >= 70 && regime === "Trend" && biasShort) signal = "SELL";

  return {
    instrument: config.instrument,
    market: config.market,
    symbol: config.symbol,
    price: formatPrice(config.instrument, price),
    rawPrice: Number(price.toFixed(6)),
    bid: quote.bid ? Number(quote.bid.toFixed(config.instrument === "EUR/USD" ? 5 : 2)) : null,
    ask: quote.ask ? Number(quote.ask.toFixed(config.instrument === "EUR/USD" ? 5 : 2)) : null,
    spread:
      quote.bid && quote.ask
        ? Number((quote.ask - quote.bid).toFixed(config.instrument === "EUR/USD" ? 5 : 2))
        : null,
    priceSource: quote.sourceLabel || "Reference price",
    changePct: Number(
      (quote.percent_change ? toNumber(quote.percent_change) : ((price - previous) / previous) * 100).toFixed(2)
    ),
    signal,
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
    plus500ExecutionText: `${signal} ${config.plus500MarketName} manuell in Plus500`,
    catalyst:
      signal === "BUY"
        ? "EMA20 liegt ueber EMA50, Trend und Expansion bestaetigen Long Bias"
        : signal === "SELL"
          ? "EMA20 liegt unter EMA50, Trend und Expansion bestaetigen Short Bias"
          : "Kein ausreichend starkes Trend-Regime oder Confidence unter Schwelle",
    thesis:
      regime === "Trend"
        ? "Pullback-Setup am Trendfilter wird bevorzugt. Breakouts nur bei Volatility Expansion."
        : "Range-Regime erkannt. Ohne Expansion wird keine aggressive Execution empfohlen.",
    updatedAt: candles[candles.length - 1]?.datetime || new Date().toISOString(),
    risk: riskFor(config.instrument, regime),
    ...buildLevels(config, signal, price, atr, ema20),
  } satisfies MarketSignal;
};

const buildUnavailableSignal = (
  config: InstrumentConfig,
  message: string
): MarketSignal => ({
  instrument: config.instrument,
  market: config.market,
  symbol: config.symbol,
  price: "unavailable",
  rawPrice: 0,
  bid: null,
  ask: null,
  spread: null,
  priceSource: "Live feed unavailable",
  changePct: 0,
  signal: "WAIT",
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
  thesis: "Ohne echten Live-Quote wird kein handelbarer Wert angezeigt.",
  entryZone: "Unavailable",
  stopLoss: "Unavailable",
  takeProfit: "Unavailable",
  riskReward: "Unavailable",
  risk: riskFor(config.instrument, "Range"),
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const apiKey = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;
  const polygonApiKey = process.env.POLYGON_API_KEY;

  if (!apiKey && !polygonApiKey) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        error: "missing_polygon_api_key_and_twelvedata_api_key",
        signals: [],
      },
      { status: 500 }
    );
  }

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
          const quotePromise =
            config.instrument === "EUR/USD" && polygonApiKey
              ? fetchPolygonForexQuote()
              : polygonApiKey
                ? fetchMassiveSnapshotQuote(config)
                : null;
          const seriesPromise: Promise<SeriesResponse> = fetchJson(
            `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(config.symbol)}&interval=15min&outputsize=70&apikey=${apiKey}`
          ) as Promise<SeriesResponse>;
          const quoteFallbackPromise = fetchJson(
            `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(config.symbol)}&apikey=${apiKey}`
          ) as Promise<QuoteResponse>;

          const [polygonQuote, quoteFallback, series] = await Promise.all([
            quotePromise,
            quoteFallbackPromise,
            seriesPromise,
          ]);

          if (series.status === "error" || !series.values?.length) {
            throw new Error(series.message || "twelvedata_series_failed");
          }

          return {
            signal: buildSignal(config, polygonQuote || quoteFallback, series.values),
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
    const hasLiveSignal = signals.some((entry) => entry.price !== "unavailable");

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        source: polygonApiKey ? "Polygon/Massive + Twelve Data" : "Twelve Data",
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
