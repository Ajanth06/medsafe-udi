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
};

type QuoteResponse = { close?: string; percent_change?: string };
type SeriesValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
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
  },
  {
    instrument: "WTI",
    symbol: "WTI",
    market: "Commodity CFD",
    maxSpreadNote: "Max 0.06 USD",
    plus500MarketName: "Oil CFD",
    atrStopMultiplier: 1.5,
    atrTakeMultiplier: 3,
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
    throw new Error(`upstream_error:${response.status}`);
  }

  return response.json();
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
  };
};

export async function GET() {
  const apiKey = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), error: "missing_twelvedata_api_key", signals: [] },
      { status: 500 }
    );
  }

  const signals = await Promise.all(
    CONFIGS.map(async (config) => {
      const [quote, series] = await Promise.all([
        fetchJson(
          `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(config.symbol)}&apikey=${apiKey}`
        ) as Promise<QuoteResponse>,
        fetchJson(
          `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(config.symbol)}&interval=15min&outputsize=70&apikey=${apiKey}`
        ) as Promise<{ status?: string; message?: string; values?: SeriesValue[] }>,
      ]);

      if (series.status === "error" || !series.values?.length) {
        throw new Error(series.message || "twelvedata_series_failed");
      }

      return buildSignal(config, quote, series.values);
    })
  );

  return NextResponse.json(
    { updatedAt: new Date().toISOString(), source: "Twelve Data", signals },
    { status: 200 }
  );
}
