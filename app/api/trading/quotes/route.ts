import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Exchange = "Binance" | "Coinbase" | "Kraken";

type PairConfig = {
  pair: string;
  binance: string;
  coinbase: string;
  kraken: string;
};

type Quote = {
  bid: number;
  ask: number;
  updatedAt: string;
  source: "rest";
};

type Opportunity = {
  buyExchange: Exchange;
  sellExchange: Exchange;
  grossSpreadPct: number;
};

const PAIRS: PairConfig[] = [
  {
    pair: "BTC/USDT",
    binance: "BTCUSDT",
    coinbase: "BTC-USDT",
    kraken: "XBTUSDT",
  },
  {
    pair: "ETH/USDT",
    binance: "ETHUSDT",
    coinbase: "ETH-USDT",
    kraken: "ETHUSDT",
  },
  {
    pair: "SOL/USDT",
    binance: "SOLUSDT",
    coinbase: "SOL-USDT",
    kraken: "SOLUSDT",
  },
];

const fetchJson = async (url: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "medsafe-trading-lab",
      },
      cache: "no-store",
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
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error("invalid_number");
  }
  return num;
};

const loadBinanceQuote = async (symbol: string): Promise<Quote> => {
  const data = await fetchJson(
    `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`
  );

  return {
    bid: toNumber(data.bidPrice),
    ask: toNumber(data.askPrice),
    updatedAt: new Date().toISOString(),
    source: "rest",
  };
};

const loadCoinbaseQuote = async (symbol: string): Promise<Quote> => {
  const data = await fetchJson(
    `https://api.exchange.coinbase.com/products/${symbol}/book?level=1`
  );

  return {
    bid: toNumber(data.bids?.[0]?.[0]),
    ask: toNumber(data.asks?.[0]?.[0]),
    updatedAt: new Date().toISOString(),
    source: "rest",
  };
};

const loadKrakenQuote = async (symbol: string): Promise<Quote> => {
  const data = await fetchJson(
    `https://api.kraken.com/0/public/Ticker?pair=${symbol}`
  );

  const result = data.result || {};
  const firstKey = Object.keys(result)[0];

  if (!firstKey) {
    throw new Error("kraken_pair_missing");
  }

  return {
    bid: toNumber(result[firstKey]?.b?.[0]),
    ask: toNumber(result[firstKey]?.a?.[0]),
    updatedAt: new Date().toISOString(),
    source: "rest",
  };
};

const buildOpportunities = (
  quotes: Partial<Record<Exchange, Quote>>
): Opportunity[] => {
  const exchanges = Object.entries(quotes) as Array<[Exchange, Quote]>;
  const opportunities: Opportunity[] = [];

  for (const [buyExchange, buyQuote] of exchanges) {
    for (const [sellExchange, sellQuote] of exchanges) {
      if (buyExchange === sellExchange) {
        continue;
      }

      const grossSpreadPct =
        ((sellQuote.bid - buyQuote.ask) / buyQuote.ask) * 100;

      if (grossSpreadPct > 0) {
        opportunities.push({
          buyExchange,
          sellExchange,
          grossSpreadPct: Number(grossSpreadPct.toFixed(4)),
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.grossSpreadPct - a.grossSpreadPct);
};

export async function GET() {
  const payload = await Promise.all(
    PAIRS.map(async (pairConfig) => {
      const [binance, coinbase, kraken] = await Promise.allSettled([
        loadBinanceQuote(pairConfig.binance),
        loadCoinbaseQuote(pairConfig.coinbase),
        loadKrakenQuote(pairConfig.kraken),
      ]);

      const quotes: Partial<Record<Exchange, Quote>> = {};
      const errors: Partial<Record<Exchange, string>> = {};

      if (binance.status === "fulfilled") {
        quotes.Binance = binance.value;
      } else {
        errors.Binance = binance.reason?.message || "binance_failed";
      }

      if (coinbase.status === "fulfilled") {
        quotes.Coinbase = coinbase.value;
      } else {
        errors.Coinbase = coinbase.reason?.message || "coinbase_failed";
      }

      if (kraken.status === "fulfilled") {
        quotes.Kraken = kraken.value;
      } else {
        errors.Kraken = kraken.reason?.message || "kraken_failed";
      }

      return {
        pair: pairConfig.pair,
        quotes,
        opportunities: buildOpportunities(quotes),
        errors,
      };
    })
  );

  return NextResponse.json(
    {
      updatedAt: new Date().toISOString(),
      pairs: payload,
    },
    { status: 200 }
  );
}
