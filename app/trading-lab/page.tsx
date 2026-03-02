"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Exchange = "Binance" | "Coinbase" | "Kraken";
type BotMode = "Live" | "Paper" | "Manual";
type BotStatus = "running" | "stopped";
type FeedStatus = "idle" | "live" | "error";
type SocketStatus = "connecting" | "live" | "closed" | "error";

type Quote = {
  bid: number;
  ask: number;
  updatedAt: string;
  source: "rest" | "ws";
};

type Opportunity = {
  buyExchange: Exchange;
  sellExchange: Exchange;
  grossSpreadPct: number;
};

type PairState = {
  pair: string;
  quotes: Partial<Record<Exchange, Quote>>;
  opportunities: Opportunity[];
  errors?: Partial<Record<Exchange, string>>;
};

type MarketResponse = {
  updatedAt: string;
  pairs: PairState[];
};

type QuoteSnapshot = {
  capturedAt: string;
  pairs: PairState[];
};

type ExchangeStatus = {
  exchange: string;
  mode: string;
  configured: boolean;
  reachable: boolean;
};

type BotConfig = {
  id: string;
  name: string;
  pair: string;
  buyExchange: Exchange;
  sellExchange: Exchange;
  mode: BotMode;
  status: BotStatus;
  minNetSpreadPct: number;
  maxCapitalUsd: number;
  feeBps: number;
  slippageBps: number;
  totalTrades: number;
  cumulativePnlUsd: number;
  lastSignal: string;
  lastStartedAt: string | null;
};

type TradeEntry = {
  id: string;
  botId: string;
  botName: string;
  pair: string;
  buyExchange: Exchange;
  sellExchange: Exchange;
  grossSpreadPct: number;
  feeImpactPct: number;
  slippageImpactPct: number;
  netEdgePct: number;
  notionalUsdt: number;
  pnlUsdt: number;
  createdAt: string;
  mode: BotMode;
  executionMode?: string;
  provider?: string;
};

type BacktestResult = {
  botId: string;
  trades: number;
  winRatePct: number;
  totalPnlUsd: number;
  maxDrawdownUsd: number;
  avgEdgePct: number;
};

const EXCHANGES: Exchange[] = ["Binance", "Coinbase", "Kraken"];
const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

const BINANCE_STREAMS: Record<string, string> = {
  "BTC/USDT": "btcusdt@bookTicker",
  "ETH/USDT": "ethusdt@bookTicker",
  "SOL/USDT": "solusdt@bookTicker",
};

const BINANCE_SYMBOL_TO_PAIR: Record<string, string> = {
  BTCUSDT: "BTC/USDT",
  ETHUSDT: "ETH/USDT",
  SOLUSDT: "SOL/USDT",
};

const INITIAL_BOTS: BotConfig[] = [
  {
    id: "bot-btc-binance-kraken",
    name: "BTC Cross-Exchange",
    pair: "BTC/USDT",
    buyExchange: "Binance",
    sellExchange: "Kraken",
    mode: "Live",
    status: "stopped",
    minNetSpreadPct: 0.6,
    maxCapitalUsd: 25000,
    feeBps: 12,
    slippageBps: 8,
    totalTrades: 0,
    cumulativePnlUsd: 0,
    lastSignal: "Waiting for feed",
    lastStartedAt: null,
  },
  {
    id: "bot-eth-coinbase-binance",
    name: "ETH Spread Hunter",
    pair: "ETH/USDT",
    buyExchange: "Coinbase",
    sellExchange: "Binance",
    mode: "Paper",
    status: "stopped",
    minNetSpreadPct: 0.45,
    maxCapitalUsd: 15000,
    feeBps: 10,
    slippageBps: 7,
    totalTrades: 0,
    cumulativePnlUsd: 0,
    lastSignal: "Waiting for feed",
    lastStartedAt: null,
  },
  {
    id: "bot-sol-kraken-binance",
    name: "SOL Rebalance Bot",
    pair: "SOL/USDT",
    buyExchange: "Kraken",
    sellExchange: "Binance",
    mode: "Manual",
    status: "stopped",
    minNetSpreadPct: 0.8,
    maxCapitalUsd: 9000,
    feeBps: 15,
    slippageBps: 10,
    totalTrades: 0,
    cumulativePnlUsd: 0,
    lastSignal: "Waiting for feed",
    lastStartedAt: null,
  },
];

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USDT`;

const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const formatPctWithBps = (value: number) =>
  `${formatPct(value)} (${Math.round(value * 100)} bps)`;

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("de-DE");
};

const buildEmptyMarket = (): MarketResponse => ({
  updatedAt: new Date().toISOString(),
  pairs: PAIRS.map((pair) => ({
    pair,
    quotes: {},
    opportunities: [],
    errors: {},
  })),
});

const computeNetMetrics = (
  buyAsk: number,
  sellBid: number,
  feeBps: number,
  slippageBps: number
) => {
  const gross = (sellBid - buyAsk) / buyAsk;
  const fees = feeBps / 10000;
  const slippage = slippageBps / 10000;
  const latencyBuffer = 0.0005;
  const net = gross - fees * 2 - slippage * 2 - latencyBuffer;

  return {
    grossSpreadPct: Number((gross * 100).toFixed(4)),
    feeImpactPct: Number((fees * 2 * 100).toFixed(4)),
    slippageImpactPct: Number((slippage * 2 * 100).toFixed(4)),
    netEdgePct: Number((net * 100).toFixed(4)),
    latencyBufferPct: Number((latencyBuffer * 100).toFixed(4)),
  };
};

const buildOpportunities = (
  quotes: Partial<Record<Exchange, Quote>>
): Opportunity[] => {
  const entries = Object.entries(quotes) as Array<[Exchange, Quote]>;
  const opportunities: Opportunity[] = [];

  for (const [buyExchange, buyQuote] of entries) {
    for (const [sellExchange, sellQuote] of entries) {
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

const findPairState = (market: MarketResponse | null, pair: string) =>
  market?.pairs.find((entry) => entry.pair === pair) || null;

const isBotMisconfigured = (bot: BotConfig) =>
  bot.buyExchange === bot.sellExchange;

const computeBotEdge = (bot: BotConfig, market: MarketResponse | null) => {
  if (isBotMisconfigured(bot)) {
    return null;
  }

  const pairState = findPairState(market, bot.pair);
  if (!pairState) {
    return null;
  }

  const buyQuote = pairState.quotes[bot.buyExchange];
  const sellQuote = pairState.quotes[bot.sellExchange];

  if (!buyQuote || !sellQuote) {
    return null;
  }

  const metrics = computeNetMetrics(
    buyQuote.ask,
    sellQuote.bid,
    bot.feeBps,
    bot.slippageBps
  );

  return {
    buyPrice: buyQuote.ask,
    sellPrice: sellQuote.bid,
    ...metrics,
  };
};

const buildBacktest = (
  bot: BotConfig,
  market: MarketResponse | null,
  quoteHistory: QuoteSnapshot[]
): BacktestResult => {
  const snapshots = quoteHistory
    .map((snapshot) =>
      findPairState({ updatedAt: snapshot.capturedAt, pairs: snapshot.pairs }, bot.pair)
    )
    .filter((entry): entry is PairState => Boolean(entry));
  let runningEquity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let sumEdges = 0;
  let totalPnl = 0;
  let trades = 0;

  const sourceSnapshots =
    snapshots.length > 0
      ? snapshots
      : (() => {
          const pairState = findPairState(market, bot.pair);
          return pairState ? [pairState] : [];
        })();

  for (const [index, snapshot] of sourceSnapshots.entries()) {
    const buyAsk = snapshot.quotes[bot.buyExchange]?.ask;
    const sellBid = snapshot.quotes[bot.sellExchange]?.bid;

    if (!buyAsk || !sellBid) {
      continue;
    }

    const metrics = computeNetMetrics(
      buyAsk,
      sellBid,
      bot.feeBps,
      bot.slippageBps
    );

    if (metrics.netEdgePct <= bot.minNetSpreadPct) {
      continue;
    }

    const notionalUsdt = bot.maxCapitalUsd * (0.45 + (((index + 1) % 4) * 0.12));
    const pnlUsdt = Number(
      (notionalUsdt * (metrics.netEdgePct / 100)).toFixed(2)
    );

    trades += 1;
    sumEdges += metrics.netEdgePct;
    totalPnl += pnlUsdt;
    runningEquity += pnlUsdt;
    peak = Math.max(peak, runningEquity);
    maxDrawdown = Math.max(maxDrawdown, peak - runningEquity);

    if (pnlUsdt > 0) {
      wins += 1;
    }
  }

  return {
    botId: bot.id,
    trades,
    winRatePct: Number((trades === 0 ? 0 : (wins / trades) * 100).toFixed(1)),
    totalPnlUsd: Number(totalPnl.toFixed(2)),
    maxDrawdownUsd: Number(maxDrawdown.toFixed(2)),
    avgEdgePct: Number((trades === 0 ? 0 : sumEdges / trades).toFixed(3)),
  };
};

const botStatusClass = (status: BotStatus) =>
  status === "running"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : "border-slate-600 bg-slate-800/80 text-slate-300";

const feedStatusClass = (status: FeedStatus | SocketStatus) => {
  if (status === "live") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }

  if (status === "error") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }

  return "border-amber-500/40 bg-amber-500/10 text-amber-200";
};

export default function TradingLabPage() {
  const [bots, setBots] = useState(INITIAL_BOTS);
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [quoteHistory, setQuoteHistory] = useState<QuoteSnapshot[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeEntry[]>([]);
  const [backtests, setBacktests] = useState<Record<string, BacktestResult>>({});
  const [restStatus, setRestStatus] = useState<FeedStatus>("idle");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [feedError, setFeedError] = useState<string>("");
  const [binanceStatus, setBinanceStatus] = useState<ExchangeStatus | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const lastTradeAtRef = useRef<Record<string, number>>({});
  const botsRef = useRef(INITIAL_BOTS);
  const marketRef = useRef<MarketResponse | null>(null);

  useEffect(() => {
    botsRef.current = bots;
  }, [bots]);

  useEffect(() => {
    marketRef.current = market;
  }, [market]);

  useEffect(() => {
    let active = true;

    const loadExchangeStatus = async () => {
      try {
        const response = await fetch("/api/trading/binance/status", {
          cache: "no-store",
        });
        const data = (await response.json()) as ExchangeStatus;

        if (active && response.ok) {
          setBinanceStatus(data);
        }
      } catch {
        if (active) {
          setBinanceStatus(null);
        }
      }
    };

    void loadExchangeStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadMarket = async () => {
      try {
        const response = await fetch("/api/trading/quotes", {
          cache: "no-store",
        });
        const previousMarket = marketRef.current;
        const data = response.ok
          ? ((await response.json()) as MarketResponse)
          : previousMarket;

        if (!active) {
          return;
        }

        if (!data) {
          throw new Error("feed_unavailable");
        }

        setMarket((previous) => {
          if (!previous && data) {
            return data;
          }

          if (!previous) {
            return buildEmptyMarket();
          }

          return {
            updatedAt: data.updatedAt,
            pairs: data.pairs.map((pair) => {
              const existing = previous.pairs.find(
                (entry) => entry.pair === pair.pair
              );
              const mergedQuotes = {
                ...pair.quotes,
                ...(existing?.quotes.Binance?.source === "ws"
                  ? { Binance: existing.quotes.Binance }
                  : {}),
              };

              return {
                ...pair,
                quotes: mergedQuotes,
                opportunities: buildOpportunities(mergedQuotes),
              };
            }),
          };
        });
        setQuoteHistory((previous) => {
          const nextSnapshot = {
            capturedAt: data.updatedAt,
            pairs: data.pairs,
          };
          return [nextSnapshot, ...previous].slice(0, 120);
        });
        setRestStatus("live");
        setFeedError("");
      } catch (error) {
        if (!active) {
          return;
        }

        setRestStatus("error");
        setFeedError(
          error instanceof Error ? error.message : "quotes_fetch_failed"
        );
        setMarket((previous) => previous || buildEmptyMarket());
      }
    };

    loadMarket();
    const intervalId = window.setInterval(loadMarket, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const streams = Array.from(new Set(botsRef.current.map((bot) => BINANCE_STREAMS[bot.pair])))
      .filter(Boolean)
      .join("/");

    if (!streams) {
      setSocketStatus("closed");
      return;
    }

    let cancelled = false;

    const connectSocket = () => {
      if (cancelled) {
        return;
      }

      setSocketStatus("connecting");

      const socket = new WebSocket(
        `wss://stream.binance.com:9443/stream?streams=${streams}`
      );

      socket.onopen = () => {
        setSocketStatus("live");
      };

      socket.onerror = () => {
        setSocketStatus("error");
      };

      socket.onclose = () => {
        setSocketStatus("closed");
        if (!cancelled) {
          reconnectTimeoutRef.current = window.setTimeout(connectSocket, 2000);
        }
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          data?: { s?: string; b?: string; a?: string };
        };

        const symbol = payload.data?.s;
        const pair = symbol ? BINANCE_SYMBOL_TO_PAIR[symbol] : null;

        if (!pair) {
          return;
        }

        const bid = Number(payload.data?.b);
        const ask = Number(payload.data?.a);

        if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
          return;
        }

        setMarket((previous) => {
          const base = previous || buildEmptyMarket();
          const nextPairs = base.pairs.map((entry) => {
            if (entry.pair !== pair) {
              return entry;
            }

            const quotes = {
              ...entry.quotes,
              Binance: {
                bid,
                ask,
                updatedAt: new Date().toISOString(),
                source: "ws" as const,
              },
            };

            return {
              ...entry,
              quotes,
              opportunities: buildOpportunities(quotes),
            };
          });

          const nextMarket = {
            updatedAt: new Date().toISOString(),
            pairs: nextPairs,
          };

          setQuoteHistory((previousHistory) => [
            {
              capturedAt: nextMarket.updatedAt,
              pairs: nextPairs,
            },
            ...previousHistory,
          ].slice(0, 120));

          return nextMarket;
        });
      };

      socketRef.current = socket;
    };

    connectSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!market) {
      return;
    }

    const botList = botsRef.current;
    const tradeBatch: TradeEntry[] = [];
    const signalMap: Record<
      string,
      { signal: string; pnlUsd?: number; traded?: boolean }
    > = {};
    const now = Date.now();

    for (const bot of botList) {
      if (isBotMisconfigured(bot)) {
        signalMap[bot.id] = { signal: "Invalid config: buy and sell exchange identical" };
        continue;
      }

      const edge = computeBotEdge(bot, market);

      if (!edge) {
        signalMap[bot.id] = { signal: "Missing quotes" };
        continue;
      }

      if (bot.status !== "running") {
        signalMap[bot.id] = {
          signal: `Ready ${formatPctWithBps(edge.netEdgePct)} net`,
        };
        continue;
      }

      const tradeCooldown = 45000;
      const lastTradeAt = lastTradeAtRef.current[bot.id] || 0;
      const isExecutable = edge.netEdgePct > bot.minNetSpreadPct;
      const notionalUsdt = Number((bot.maxCapitalUsd * 0.55).toFixed(2));

      if (!isExecutable) {
        signalMap[bot.id] = {
          signal: `Watching ${formatPctWithBps(edge.netEdgePct)} net`,
        };
        continue;
      }

      if (Math.abs(edge.grossSpreadPct) < 0.02) {
        signalMap[bot.id] = {
          signal: `Rejected low gross spread ${formatPctWithBps(edge.grossSpreadPct)}`,
        };
        continue;
      }

      if (notionalUsdt > 50000) {
        signalMap[bot.id] = {
          signal: "Rejected notional above 50,000 USDT limit",
        };
        continue;
      }

      if (now - lastTradeAt < tradeCooldown) {
        signalMap[bot.id] = {
          signal: `Cooldown after ${formatPctWithBps(edge.netEdgePct)} trigger`,
        };
        continue;
      }

      lastTradeAtRef.current[bot.id] = now;
      const pnlUsdt = Number(
        (notionalUsdt * (edge.netEdgePct / 100)).toFixed(2)
      );

      tradeBatch.push({
        id: `${bot.id}-${now}`,
        botId: bot.id,
        botName: bot.name,
        pair: bot.pair,
        buyExchange: bot.buyExchange,
        sellExchange: bot.sellExchange,
        grossSpreadPct: edge.grossSpreadPct,
        feeImpactPct: edge.feeImpactPct,
        slippageImpactPct: edge.slippageImpactPct,
        netEdgePct: edge.netEdgePct,
        notionalUsdt,
        pnlUsdt,
        createdAt: new Date(now).toISOString(),
        mode: bot.mode,
      });

      signalMap[bot.id] = {
        signal: `Executed ${formatPctWithBps(edge.netEdgePct)} net`,
        pnlUsd: pnlUsdt,
        traded: true,
      };
    }

    if (tradeBatch.length > 0) {
      void (async () => {
        const executedTrades = await Promise.all(
          tradeBatch.map(async (trade) => {
            try {
              const response = await fetch("/api/trading/paper/execute", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(trade),
              });

              if (!response.ok) {
                return trade;
              }

              const executed = (await response.json()) as TradeEntry;
              return {
                ...trade,
                ...executed,
              };
            } catch {
              return trade;
            }
          })
        );

        setTradeHistory((previous) =>
          [...executedTrades, ...previous].slice(0, 50)
        );
      })();
    }

    setBots((previous) =>
      previous.map((bot) => {
        const update = signalMap[bot.id];
        if (!update) {
          return bot;
        }

        const nextBot = {
          ...bot,
          lastSignal: update.signal,
          totalTrades: update.traded ? bot.totalTrades + 1 : bot.totalTrades,
          cumulativePnlUsd: update.traded
            ? Number((bot.cumulativePnlUsd + (update.pnlUsd || 0)).toFixed(2))
            : bot.cumulativePnlUsd,
        };

        if (
          nextBot.lastSignal === bot.lastSignal &&
          nextBot.totalTrades === bot.totalTrades &&
          nextBot.cumulativePnlUsd === bot.cumulativePnlUsd
        ) {
          return bot;
        }

        return nextBot;
      })
    );
  }, [market]);

  useEffect(() => {
    if (!market || Object.keys(backtests).length > 0) {
      return;
    }

    const initialResults = Object.fromEntries(
      botsRef.current.map((bot) => [bot.id, buildBacktest(bot, market, quoteHistory)])
    );
    setBacktests(initialResults);
  }, [market, backtests, quoteHistory]);

  const botEdges = useMemo(
    () =>
      Object.fromEntries(
        bots.map((bot) => [bot.id, computeBotEdge(bot, market)])
      ) as Record<string, ReturnType<typeof computeBotEdge>>,
    [bots, market]
  );
  const totalPnlUsd = bots.reduce((sum, bot) => sum + bot.cumulativePnlUsd, 0);
  const runningBots = bots.filter((bot) => bot.status === "running").length;
  const totalTrades = bots.reduce((sum, bot) => sum + bot.totalTrades, 0);
  const topOpportunities = useMemo(
    () =>
      (market?.pairs || [])
        .flatMap((pair) =>
          pair.opportunities.slice(0, 2).map((opportunity) => ({
            pair: pair.pair,
            ...opportunity,
          }))
        )
        .sort((a, b) => b.grossSpreadPct - a.grossSpreadPct)
        .slice(0, 6),
    [market]
  );
  const binanceBots = useMemo(
    () =>
      bots.filter(
        (bot) => bot.buyExchange === "Binance" || bot.sellExchange === "Binance"
      ),
    [bots]
  );
  const runningBinanceBots = binanceBots.filter(
    (bot) => bot.status === "running"
  ).length;
  const binancePnlUsdt = binanceBots.reduce(
    (sum, bot) => sum + bot.cumulativePnlUsd,
    0
  );
  const binanceTradeCount = binanceBots.reduce(
    (sum, bot) => sum + bot.totalTrades,
    0
  );
  const binanceOpportunities = useMemo(
    () =>
      topOpportunities.filter(
        (entry) =>
          entry.buyExchange === "Binance" || entry.sellExchange === "Binance"
      ),
    [topOpportunities]
  );

  const updateBot = (
    botId: string,
    patch: Partial<Omit<BotConfig, "id" | "totalTrades" | "cumulativePnlUsd">>
  ) => {
    setBots((previous) =>
      previous.map((bot) => (bot.id === botId ? { ...bot, ...patch } : bot))
    );
  };

  const toggleBot = (botId: string) => {
    setBots((previous) =>
      previous.map((bot) => {
        if (bot.id !== botId) {
          return bot;
        }

        const nextStatus: BotStatus =
          bot.status === "running" ? "stopped" : "running";

        return {
          ...bot,
          status: nextStatus,
          lastStartedAt:
            nextStatus === "running" ? new Date().toISOString() : bot.lastStartedAt,
          lastSignal:
            nextStatus === "running" ? "Bot armed and waiting" : "Bot stopped",
        };
      })
    );
  };

  const runBacktest = (botId: string) => {
    const bot = botsRef.current.find((entry) => entry.id === botId);
    if (!bot) {
      return;
    }

    setBacktests((previous) => ({
      ...previous,
      [botId]: buildBacktest(bot, market, quoteHistory),
    }));
  };

  const runAllBacktests = () => {
    setBacktests(
      Object.fromEntries(
        botsRef.current.map((bot) => [bot.id, buildBacktest(bot, market, quoteHistory)])
      )
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(217,70,239,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.14),_transparent_28%),rgba(15,23,42,0.94)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-fuchsia-300/80">
                Trading Lab
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                Crypto Arbitrage Bot Control
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300/80 md:text-base">
                Konfigurierbare Bots fuer Cross-Exchange-Arbitrage mit Start- und
                Stop-Control, Live-Quotes, WebSocket-Feed, PnL-Monitoring,
                Backtesting und Trade-Historie.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Running Bots</div>
                <div className="mt-1 text-2xl font-semibold">{runningBots}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Total Trades</div>
                <div className="mt-1 text-2xl font-semibold">{totalTrades}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Realized PnL</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">
                  {formatUsdt(totalPnlUsd)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Market Snapshot</div>
                <div className="mt-1 text-sm font-semibold">
                  {formatDateTime(market?.updatedAt || null)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-3xl border border-amber-400/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(15,23,42,0.92))] p-5 shadow-xl shadow-black/20">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-amber-200/80">
                  Binance Trading Lab
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  Binance Execution Desk
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Eigenstaendiger Bereich fuer Binance-Paper-Execution, Venue-Health,
                  aktive Bot-Kapazitaet und spaetere Erweiterung auf Testnet oder
                  Live-Orders mit serverseitigen Guards.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-100">
                  Binance
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-200">
                  Paper
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs text-slate-400">Binance Bots</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">
                  {binanceBots.length}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs text-slate-400">Running</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">
                  {runningBinanceBots}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs text-slate-400">Trades</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">
                  {binanceTradeCount}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs text-slate-400">PnL</div>
                <div className="mt-1 text-2xl font-semibold text-amber-200">
                  {formatUsdt(binancePnlUsdt)}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Venue Status
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/70 px-3 py-3">
                    <span className="text-slate-400">API Credentials</span>
                    <span className={binanceStatus?.configured ? "text-emerald-300" : "text-amber-200"}>
                      {binanceStatus?.configured ? "Configured" : "Missing"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/70 px-3 py-3">
                    <span className="text-slate-400">Exchange Reachability</span>
                    <span className={binanceStatus?.reachable ? "text-emerald-300" : "text-slate-300"}>
                      {binanceStatus?.reachable ? "Online" : "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/70 px-3 py-3">
                    <span className="text-slate-400">Execution Profile</span>
                    <span className="text-amber-200">Paper Trading</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/70 px-3 py-3">
                    <span className="text-slate-400">WebSocket Feed</span>
                    <span className={socketStatus === "live" ? "text-emerald-300" : "text-slate-300"}>
                      {socketStatus}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Binance Opportunities
                </div>
                <div className="mt-3 space-y-3">
                  {binanceOpportunities.length === 0 ? (
                    <div className="rounded-2xl border border-white/8 bg-slate-950/70 px-4 py-4 text-sm text-slate-400">
                      Aktuell keine Binance-bezogenen Routen im Opportunity-Feed.
                    </div>
                  ) : (
                    binanceOpportunities.slice(0, 3).map((entry) => (
                      <div
                        key={`${entry.pair}-${entry.buyExchange}-${entry.sellExchange}-binance`}
                        className="rounded-2xl border border-white/8 bg-slate-950/70 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-100">{entry.pair}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              Buy {entry.buyExchange} / Sell {entry.sellExchange}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-emerald-300">
                            {formatPctWithBps(entry.grossSpreadPct)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Binance Focus
            </div>
            <h2 className="mt-1 text-xl font-semibold">Venue-bound Bots</h2>

            <div className="mt-5 space-y-3">
              {binanceBots.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-400">
                  Noch keine Bots mit Binance als Buy- oder Sell-Exchange vorhanden.
                </div>
              ) : (
                binanceBots.map((bot) => (
                  <div
                    key={`binance-focus-${bot.id}`}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-100">{bot.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {bot.pair} / {bot.buyExchange} {"->"} {bot.sellExchange}
                        </div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${botStatusClass(bot.status)}`}>
                        {bot.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-white/8 bg-slate-950/70 px-3 py-3">
                        <div className="text-slate-500">Signal</div>
                        <div className="mt-1 text-slate-200">{bot.lastSignal}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-slate-950/70 px-3 py-3">
                        <div className="text-slate-500">PnL</div>
                        <div className="mt-1 text-amber-200">
                          {formatUsdt(bot.cumulativePnlUsd)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.85fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Bot Fleet
                </div>
                <h2 className="mt-1 text-xl font-semibold">Configurations</h2>
              </div>
              <button
                onClick={runAllBacktests}
                className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-medium text-fuchsia-100 transition hover:border-fuchsia-300 hover:bg-fuchsia-500/20"
              >
                Run All Backtests
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              {bots.map((bot) => {
                const edge = botEdges[bot.id];
                const backtest = backtests[bot.id];
                const misconfigured = isBotMisconfigured(bot);

                return (
                  <div
                    key={bot.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{bot.name}</h3>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${botStatusClass(
                              bot.status
                            )}`}
                          >
                            {bot.status}
                          </span>
                          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-sky-100">
                            {bot.mode}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-400">
                          Last start: {formatDateTime(bot.lastStartedAt)}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                          Signal: {bot.lastSignal}
                        </div>
                        {misconfigured && (
                          <div className="mt-1 text-sm text-rose-300">
                            Buy and sell exchange must be different.
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleBot(bot.id)}
                          disabled={misconfigured}
                          className={
                            "rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 " +
                            (bot.status === "running"
                              ? "bg-rose-600 text-white hover:bg-rose-500"
                              : "bg-emerald-600 text-white hover:bg-emerald-500")
                          }
                        >
                          {bot.status === "running" ? "Stop" : "Start"}
                        </button>
                        <button
                          onClick={() => runBacktest(bot.id)}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:border-sky-400/60 hover:bg-sky-500/10"
                        >
                          Backtest
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs text-slate-400">
                        Pair
                        <select
                          value={bot.pair}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              pair: event.target.value as BotConfig["pair"],
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        >
                          {PAIRS.map((pair) => (
                            <option key={pair} value={pair}>
                              {pair}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs text-slate-400">
                        Buy Exchange
                        <select
                          value={bot.buyExchange}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              buyExchange: event.target.value as Exchange,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        >
                          {EXCHANGES.map((exchange) => (
                            <option key={exchange} value={exchange}>
                              {exchange}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs text-slate-400">
                        Sell Exchange
                        <select
                          value={bot.sellExchange}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              sellExchange: event.target.value as Exchange,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        >
                          {EXCHANGES.map((exchange) => (
                            <option key={exchange} value={exchange}>
                              {exchange}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs text-slate-400">
                        Mode
                        <select
                          value={bot.mode}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              mode: event.target.value as BotMode,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        >
                          <option value="Live">Live</option>
                          <option value="Paper">Paper</option>
                          <option value="Manual">Manual</option>
                        </select>
                      </label>

                      <label className="text-xs text-slate-400">
                        Min Net Spread %
                        <input
                          type="number"
                          step="0.05"
                          value={bot.minNetSpreadPct}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              minNetSpreadPct: Number(event.target.value || 0),
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                      </label>

                      <label className="text-xs text-slate-400">
                        Max Capital USDT
                        <input
                          type="number"
                          step="100"
                          value={bot.maxCapitalUsd}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              maxCapitalUsd: Number(event.target.value || 0),
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                      </label>

                      <label className="text-xs text-slate-400">
                        Fee bps
                        <input
                          type="number"
                          step="1"
                          value={bot.feeBps}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              feeBps: Number(event.target.value || 0),
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                      </label>

                      <label className="text-xs text-slate-400">
                        Slippage bps
                        <input
                          type="number"
                          step="1"
                          value={bot.slippageBps}
                          onChange={(event) =>
                            updateBot(bot.id, {
                              slippageBps: Number(event.target.value || 0),
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Gross Spread</div>
                        <div className="mt-1 text-lg font-semibold text-sky-200">
                          {edge ? formatPct(edge.grossSpreadPct) : "-"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Fees</div>
                        <div className="mt-1 text-lg font-semibold text-amber-200">
                          {edge ? `-${formatPct(edge.feeImpactPct).replace("+", "")}` : "-"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Slippage</div>
                        <div className="mt-1 text-lg font-semibold text-rose-200">
                          {edge
                            ? `-${formatPct(edge.slippageImpactPct).replace("+", "")}`
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Net Edge</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-300">
                          {edge ? formatPctWithBps(edge.netEdgePct) : "-"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Trades / PnL</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">
                          {bot.totalTrades} / {formatUsdt(bot.cumulativePnlUsd)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Backtest</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">
                          {backtest
                            ? `${formatUsdt(backtest.totalPnlUsd)} / ${backtest.winRatePct}% win`
                            : "not run"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Connectivity
            </div>
            <h2 className="mt-1 text-xl font-semibold">Live Feed Health</h2>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">REST Quote API</span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${feedStatusClass(
                      restStatus
                    )}`}
                  >
                    {restStatus}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">Binance WebSocket</span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${feedStatusClass(
                      socketStatus
                    )}`}
                  >
                    {socketStatus}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Binance Paper Account</span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${
                      binanceStatus?.configured
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {binanceStatus?.configured ? "configured" : "missing"}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {binanceStatus
                    ? `Reachable: ${binanceStatus.reachable ? "yes" : "no"} / Mode: ${binanceStatus.mode}`
                    : "Status unavailable"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                <div className="text-slate-500">Feed Errors</div>
                <div className="mt-1">
                  {feedError || "No upstream error reported."}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Best Opportunities
              </div>
              <div className="mt-3 space-y-3">
                {topOpportunities.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    Waiting for price snapshots...
                  </div>
                ) : (
                  topOpportunities.map((opportunity) => (
                    <div
                      key={`${opportunity.pair}-${opportunity.buyExchange}-${opportunity.sellExchange}`}
                      className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm"
                    >
                      <div className="font-medium text-slate-100">
                        {opportunity.pair}
                      </div>
                      <div className="mt-1 text-slate-400">
                        Buy {opportunity.buyExchange} / Sell {opportunity.sellExchange}
                      </div>
                      <div className="mt-1 text-emerald-300">
                        Gross {formatPct(opportunity.grossSpreadPct)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Market Matrix
                </div>
                <h2 className="mt-1 text-xl font-semibold">Quotes and Spreads</h2>
              </div>
              <div className="text-xs text-slate-400">
                Updated {formatDateTime(market?.updatedAt || null)}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {(market?.pairs || buildEmptyMarket().pairs).map((pairState) => (
                <div
                  key={pairState.pair}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-lg font-semibold">{pairState.pair}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Top route:{" "}
                        {pairState.opportunities[0]
                          ? `${pairState.opportunities[0].buyExchange} -> ${pairState.opportunities[0].sellExchange} (${formatPct(
                              pairState.opportunities[0].grossSpreadPct
                            )})`
                          : "none"}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {EXCHANGES.map((exchange) => {
                        const quote = pairState.quotes[exchange];
                        return (
                          <div
                            key={`${pairState.pair}-${exchange}`}
                            className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3 text-sm"
                          >
                            <div className="text-slate-400">{exchange}</div>
                            <div className="mt-2 text-slate-100">
                              Bid: {quote ? quote.bid.toFixed(2) : "-"}
                            </div>
                            <div className="text-slate-300">
                              Ask: {quote ? quote.ask.toFixed(2) : "-"}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {quote
                                ? `${quote.source.toUpperCase()} ${formatDateTime(
                                    quote.updatedAt
                                  )}`
                                : pairState.errors?.[exchange] || "No quote"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Backtesting
            </div>
            <h2 className="mt-1 text-xl font-semibold">Scenario Results</h2>

            <div className="mt-5 space-y-3">
              {bots.map((bot) => {
                const result = backtests[bot.id];
                return (
                  <div
                    key={`backtest-${bot.id}`}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-100">{bot.name}</div>
                        <div className="text-xs text-slate-500">
                          {bot.pair} / {bot.buyExchange} {"->"} {bot.sellExchange}
                        </div>
                      </div>
                      <button
                        onClick={() => runBacktest(bot.id)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 transition hover:border-sky-400/60 hover:bg-sky-500/10"
                      >
                        Refresh
                      </button>
                    </div>

                    {result ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">PnL</div>
                          <div className="mt-1 font-semibold text-emerald-300">
                            {formatUsdt(result.totalPnlUsd)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">Win Rate</div>
                          <div className="mt-1 font-semibold text-slate-100">
                            {result.winRatePct}%
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">Avg Edge</div>
                          <div className="mt-1 font-semibold text-sky-200">
                            {formatPctWithBps(result.avgEdgePct)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">Max Drawdown</div>
                          <div className="mt-1 font-semibold text-rose-200">
                            {formatUsdt(result.maxDrawdownUsd)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-slate-400">
                        Backtest has not been run yet.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                Trade History
              </div>
              <h2 className="mt-1 text-xl font-semibold">Execution Ledger</h2>
            </div>
            <div className="text-xs text-slate-500">
              Paper executions are generated when active bots exceed their threshold.
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Bot</th>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 font-medium">Gross</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">Notional</th>
                  <th className="px-4 py-3 font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={7}>
                      No executions yet. Start a bot and wait for a positive net edge.
                    </td>
                  </tr>
                ) : (
                  tradeHistory.map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-t border-white/6 text-slate-200"
                    >
                      <td className="px-4 py-3 text-slate-400">
                        {formatDateTime(trade.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{trade.botName}</div>
                        <div className="text-xs text-slate-500">
                          {trade.mode}
                          {trade.executionMode ? ` / ${trade.executionMode}` : ""}
                          {trade.provider ? ` / ${trade.provider}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {trade.pair}: {trade.buyExchange} {"->"} {trade.sellExchange}
                      </td>
                      <td className="px-4 py-3 text-sky-200">
                        {formatPct(trade.grossSpreadPct)}
                      </td>
                      <td className="px-4 py-3 text-emerald-300">
                        {formatPctWithBps(trade.netEdgePct)}
                      </td>
                      <td className="px-4 py-3">{formatUsdt(trade.notionalUsdt)}</td>
                      <td className="px-4 py-3 text-emerald-300">
                        {formatUsdt(trade.pnlUsdt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
