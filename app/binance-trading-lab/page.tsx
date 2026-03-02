"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Pair = "BTC/USDT" | "ETH/USDT" | "SOL/USDT";
type BotMode = "Paper" | "Testnet" | "Manual";
type BotStatus = "running" | "stopped";
type FeedStatus = "idle" | "live" | "error";
type SocketStatus = "connecting" | "live" | "closed" | "error";

type Quote = {
  bid: number;
  ask: number;
  updatedAt: string;
  source: "rest" | "ws";
};

type ExchangeStatus = {
  exchange: string;
  mode: string;
  environment?: string;
  configured: boolean;
  reachable: boolean;
};

type MarketState = Record<Pair, Quote | null>;

type BinanceBot = {
  id: string;
  name: string;
  pair: Pair;
  mode: BotMode;
  status: BotStatus;
  minMovePct: number;
  maxCapitalUsdt: number;
  feeBps: number;
  slippageBps: number;
  totalTrades: number;
  cumulativePnlUsdt: number;
  lastSignal: string;
  lastStartedAt: string | null;
};

type PaperTrade = {
  id: string;
  botId: string;
  botName: string;
  pair: Pair;
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
  order?: {
    orderId?: number;
    status?: string;
    executedQty?: string;
    cummulativeQuoteQty?: string;
  };
};

type BacktestResult = {
  trades: number;
  winRatePct: number;
  totalPnlUsdt: number;
  avgEdgePct: number;
};

const BINANCE_SYMBOLS: Record<Pair, string> = {
  "BTC/USDT": "BTCUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
};

const SYMBOL_TO_PAIR: Record<string, Pair> = {
  BTCUSDT: "BTC/USDT",
  ETHUSDT: "ETH/USDT",
  SOLUSDT: "SOL/USDT",
};

const INITIAL_BOTS: BinanceBot[] = [
  {
    id: "binance-btc-pulse",
    name: "BTC Pulse Bot",
    pair: "BTC/USDT",
    mode: "Paper",
    status: "stopped",
    minMovePct: 0.18,
    maxCapitalUsdt: 20000,
    feeBps: 10,
    slippageBps: 6,
    totalTrades: 0,
    cumulativePnlUsdt: 0,
    lastSignal: "Waiting for feed",
    lastStartedAt: null,
  },
  {
    id: "binance-eth-breakout",
    name: "ETH Breakout Bot",
    pair: "ETH/USDT",
    mode: "Paper",
    status: "stopped",
    minMovePct: 0.22,
    maxCapitalUsdt: 12000,
    feeBps: 10,
    slippageBps: 7,
    totalTrades: 0,
    cumulativePnlUsdt: 0,
    lastSignal: "Waiting for feed",
    lastStartedAt: null,
  },
  {
    id: "binance-sol-scalper",
    name: "SOL Scalper",
    pair: "SOL/USDT",
    mode: "Manual",
    status: "stopped",
    minMovePct: 0.35,
    maxCapitalUsdt: 8000,
    feeBps: 12,
    slippageBps: 9,
    totalTrades: 0,
    cumulativePnlUsdt: 0,
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

const emptyMarket = (): MarketState => ({
  "BTC/USDT": null,
  "ETH/USDT": null,
  "SOL/USDT": null,
});

const computeMoveMetrics = (
  bid: number,
  ask: number,
  feeBps: number,
  slippageBps: number
) => {
  const mid = (bid + ask) / 2;
  const gross = (ask - bid) / mid;
  const fees = feeBps / 10000;
  const slippage = slippageBps / 10000;
  const latencyBuffer = 0.0005;
  const net = gross - fees * 2 - slippage * 2 - latencyBuffer;

  return {
    grossSpreadPct: Number((gross * 100).toFixed(4)),
    feeImpactPct: Number((fees * 2 * 100).toFixed(4)),
    slippageImpactPct: Number((slippage * 2 * 100).toFixed(4)),
    netEdgePct: Number((net * 100).toFixed(4)),
  };
};

const buildBacktest = (bot: BinanceBot, quoteHistory: Quote[]): BacktestResult => {
  let trades = 0;
  let wins = 0;
  let totalPnlUsdt = 0;
  let totalEdge = 0;

  for (const [index, quote] of quoteHistory.entries()) {
    const shiftedBid = Number((quote.bid * (1 - (index % 5) * 0.0004)).toFixed(6));
    const shiftedAsk = Number((quote.ask * (1 + ((index + 2) % 5) * 0.0005)).toFixed(6));
    const metrics = computeMoveMetrics(
      shiftedBid,
      shiftedAsk,
      bot.feeBps,
      bot.slippageBps
    );

    if (metrics.netEdgePct <= bot.minMovePct) {
      continue;
    }

    const notionalUsdt = bot.maxCapitalUsdt * (0.42 + ((index % 4) * 0.11));
    const pnlUsdt = Number((notionalUsdt * (metrics.netEdgePct / 100)).toFixed(2));
    trades += 1;
    totalPnlUsdt += pnlUsdt;
    totalEdge += metrics.netEdgePct;
    if (pnlUsdt > 0) {
      wins += 1;
    }
  }

  return {
    trades,
    winRatePct: Number((trades === 0 ? 0 : (wins / trades) * 100).toFixed(1)),
    totalPnlUsdt: Number(totalPnlUsdt.toFixed(2)),
    avgEdgePct: Number((trades === 0 ? 0 : totalEdge / trades).toFixed(3)),
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

export default function BinanceTradingLabPage() {
  const [bots, setBots] = useState(INITIAL_BOTS);
  const [market, setMarket] = useState<MarketState>(emptyMarket());
  const [quoteHistory, setQuoteHistory] = useState<Record<Pair, Quote[]>>({
    "BTC/USDT": [],
    "ETH/USDT": [],
    "SOL/USDT": [],
  });
  const [tradeHistory, setTradeHistory] = useState<PaperTrade[]>([]);
  const [backtests, setBacktests] = useState<Record<string, BacktestResult>>({});
  const [restStatus, setRestStatus] = useState<FeedStatus>("idle");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [binanceStatus, setBinanceStatus] = useState<ExchangeStatus | null>(null);
  const [feedError, setFeedError] = useState("");
  const [executionError, setExecutionError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const lastTradeAtRef = useRef<Record<string, number>>({});
  const botsRef = useRef(INITIAL_BOTS);

  useEffect(() => {
    botsRef.current = bots;
  }, [bots]);

  const executeBinanceTrade = async (
    bot: BinanceBot,
    notionalUsdt: number
  ): Promise<PaperTrade | null> => {
    const route =
      bot.mode === "Testnet"
        ? "/api/trading/binance/testnet/order"
        : "/api/trading/paper/execute";

    const payload =
      bot.mode === "Testnet"
        ? {
            botId: bot.id,
            botName: bot.name,
            pair: bot.pair,
            notionalUsdt,
            mode: "Testnet" as const,
          }
        : {
            id: `${bot.id}-${Date.now()}`,
            botId: bot.id,
            botName: bot.name,
            pair: bot.pair,
            buyExchange: "Binance",
            sellExchange: "Binance",
            grossSpreadPct: 0,
            feeImpactPct: 0,
            slippageImpactPct: 0,
            latencyBufferPct: 0,
            netEdgePct: 0,
            notionalUsdt,
            mode: bot.mode,
          };

    try {
      const response = await fetch(route, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setExecutionError(data?.error || "execution_failed");
        return null;
      }

      setExecutionError("");
      return data as PaperTrade;
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : "execution_failed");
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
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
    void loadStatus();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadRestQuotes = async () => {
      try {
        const response = await fetch("/api/trading/quotes", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("feed_unavailable");
        }
        const data = (await response.json()) as {
          pairs: Array<{
            pair: Pair;
            quotes: { Binance?: Quote };
          }>;
        };
        if (!active) {
          return;
        }
        setMarket((previous) => {
          const next = { ...previous };
          for (const pairEntry of data.pairs) {
            if (pairEntry.quotes.Binance) {
              next[pairEntry.pair] = pairEntry.quotes.Binance;
            }
          }
          return next;
        });
        setRestStatus("live");
        setFeedError("");
      } catch (error) {
        if (!active) {
          return;
        }
        setRestStatus("error");
        setFeedError(error instanceof Error ? error.message : "quotes_fetch_failed");
      }
    };
    void loadRestQuotes();
    const intervalId = window.setInterval(loadRestQuotes, 4000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const streams = Object.values(BINANCE_SYMBOLS)
      .map((symbol) => `${symbol.toLowerCase()}@bookTicker`)
      .join("/");
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
        const pair = payload.data?.s ? SYMBOL_TO_PAIR[payload.data.s] : null;
        if (!pair) {
          return;
        }
        const bid = Number(payload.data?.b);
        const ask = Number(payload.data?.a);
        if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
          return;
        }
        const quote: Quote = {
          bid,
          ask,
          updatedAt: new Date().toISOString(),
          source: "ws",
        };
        setMarket((previous) => ({
          ...previous,
          [pair]: quote,
        }));
        setQuoteHistory((previous) => ({
          ...previous,
          [pair]: [quote, ...previous[pair]].slice(0, 120),
        }));
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
    const now = Date.now();
    const updates: Record<string, { signal: string; pnlUsdt?: number; traded?: boolean }> = {};
    const pendingTrades: PaperTrade[] = [];

    for (const bot of botsRef.current) {
      const quote = market[bot.pair];
      if (!quote) {
        updates[bot.id] = { signal: "Missing Binance quote" };
        continue;
      }

      const metrics = computeMoveMetrics(
        quote.bid,
        quote.ask,
        bot.feeBps,
        bot.slippageBps
      );

      if (bot.status !== "running") {
        updates[bot.id] = {
          signal: `Ready ${formatPctWithBps(metrics.netEdgePct)} net`,
        };
        continue;
      }

      const notionalUsdt = Number((bot.maxCapitalUsdt * 0.55).toFixed(2));
      if (metrics.netEdgePct <= bot.minMovePct) {
        updates[bot.id] = {
          signal: `Watching ${formatPctWithBps(metrics.netEdgePct)} net`,
        };
        continue;
      }
      if (Math.abs(metrics.grossSpreadPct) < 0.02) {
        updates[bot.id] = {
          signal: `Rejected low gross spread ${formatPctWithBps(metrics.grossSpreadPct)}`,
        };
        continue;
      }
      if (notionalUsdt > 50000) {
        updates[bot.id] = { signal: "Rejected notional above 50,000 USDT limit" };
        continue;
      }
      if (now - (lastTradeAtRef.current[bot.id] || 0) < 45000) {
        updates[bot.id] = {
          signal: `Cooldown after ${formatPctWithBps(metrics.netEdgePct)} trigger`,
        };
        continue;
      }

      lastTradeAtRef.current[bot.id] = now;
      const pnlUsdt = Number((notionalUsdt * (metrics.netEdgePct / 100)).toFixed(2));
      pendingTrades.push({
        id: `${bot.id}-${now}`,
        botId: bot.id,
        botName: bot.name,
        pair: bot.pair,
        grossSpreadPct: metrics.grossSpreadPct,
        feeImpactPct: metrics.feeImpactPct,
        slippageImpactPct: metrics.slippageImpactPct,
        netEdgePct: metrics.netEdgePct,
        notionalUsdt,
        pnlUsdt,
        createdAt: new Date(now).toISOString(),
        mode: bot.mode,
      });
      updates[bot.id] = {
        signal: `Executed ${formatPctWithBps(metrics.netEdgePct)} net`,
        pnlUsdt,
        traded: true,
      };
    }

    if (pendingTrades.length > 0) {
      void (async () => {
        const executed = await Promise.all(
          pendingTrades.map(async (trade) => {
            const bot = botsRef.current.find((entry) => entry.id === trade.botId);
            if (!bot) {
              return trade;
            }
            const payload = await executeBinanceTrade(bot, trade.notionalUsdt);
            return payload ? { ...trade, ...payload } : trade;
          })
        );
        setTradeHistory((previous) => [...executed, ...previous].slice(0, 50));
      })();
    }

    setBots((previous) =>
      previous.map((bot) => {
        const update = updates[bot.id];
        if (!update) {
          return bot;
        }
        return {
          ...bot,
          lastSignal: update.signal,
          totalTrades: update.traded ? bot.totalTrades + 1 : bot.totalTrades,
          cumulativePnlUsdt: update.traded
            ? Number((bot.cumulativePnlUsdt + (update.pnlUsdt || 0)).toFixed(2))
            : bot.cumulativePnlUsdt,
        };
      })
    );
  }, [market]);

  const totalPnlUsdt = bots.reduce((sum, bot) => sum + bot.cumulativePnlUsdt, 0);
  const runningBots = bots.filter((bot) => bot.status === "running").length;
  const totalTrades = bots.reduce((sum, bot) => sum + bot.totalTrades, 0);
  const quoteCards = useMemo(
    () =>
      (Object.keys(market) as Pair[]).map((pair) => ({
        pair,
        quote: market[pair],
      })),
    [market]
  );

  const runTestnetBuy = async (botId: string) => {
    const bot = bots.find((entry) => entry.id === botId);
    if (!bot) {
      return;
    }

    const notionalUsdt = Number((bot.maxCapitalUsdt * 0.25).toFixed(2));
    const payload = await executeBinanceTrade(
      { ...bot, mode: "Testnet" },
      notionalUsdt
    );

    if (!payload) {
      return;
    }

    const quote = market[bot.pair];
    const metrics = quote
      ? computeMoveMetrics(quote.bid, quote.ask, bot.feeBps, bot.slippageBps)
      : {
          grossSpreadPct: 0,
          feeImpactPct: 0,
          slippageImpactPct: 0,
          netEdgePct: 0,
        };

    const trade: PaperTrade = {
      id: payload.id || `${bot.id}-${Date.now()}`,
      botId: bot.id,
      botName: bot.name,
      pair: bot.pair,
      grossSpreadPct: metrics.grossSpreadPct,
      feeImpactPct: metrics.feeImpactPct,
      slippageImpactPct: metrics.slippageImpactPct,
      netEdgePct: metrics.netEdgePct,
      notionalUsdt,
      pnlUsdt: Number((notionalUsdt * (metrics.netEdgePct / 100)).toFixed(2)),
      createdAt: payload.createdAt || new Date().toISOString(),
      mode: "Testnet",
      executionMode: payload.executionMode,
      provider: payload.provider,
      order: payload.order,
    };

    setTradeHistory((previous) => [trade, ...previous].slice(0, 50));
    setBots((previous) =>
      previous.map((entry) =>
        entry.id === bot.id
          ? {
              ...entry,
              totalTrades: entry.totalTrades + 1,
              cumulativePnlUsdt: Number(
                (entry.cumulativePnlUsdt + trade.pnlUsdt).toFixed(2)
              ),
              lastSignal: "Manual testnet buy executed",
            }
          : entry
      )
    );
  };

  const updateBot = (
    botId: string,
    patch: Partial<Omit<BinanceBot, "id" | "totalTrades" | "cumulativePnlUsdt">>
  ) => {
    setBots((previous) =>
      previous.map((bot) => (bot.id === botId ? { ...bot, ...patch } : bot))
    );
  };

  const runBacktest = (botId: string) => {
    const bot = bots.find((entry) => entry.id === botId);
    if (!bot) {
      return;
    }
    setBacktests((previous) => ({
      ...previous,
      [botId]: buildBacktest(bot, quoteHistory[bot.pair]),
    }));
  };

  const toggleBot = async (botId: string) => {
    const currentBot = bots.find((entry) => entry.id === botId);
    if (!currentBot) {
      return;
    }

    const nextStatus: BotStatus =
      currentBot.status === "running" ? "stopped" : "running";

    setBots((previous) =>
      previous.map((bot) =>
        bot.id === botId
          ? {
              ...bot,
              status: nextStatus,
              lastStartedAt:
                nextStatus === "running" ? new Date().toISOString() : bot.lastStartedAt,
              lastSignal:
                nextStatus === "running"
                  ? currentBot.mode === "Testnet"
                    ? "Bot armed and sending first testnet order"
                    : "Bot armed and waiting"
                  : "Bot stopped",
            }
          : bot
      )
    );

    if (nextStatus === "running" && currentBot.mode === "Testnet") {
      await runTestnetBuy(botId);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-amber-400/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(15,23,42,0.92))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-amber-200/80">
                Binance Trading Lab
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                Binance Execution Desk
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300/80 md:text-base">
                Eigenstaendiges Dashboard fuer Binance-Paper-Execution, Venue-Health,
                eigene Bots, Marktfeed, Backtests und ein separates Execution Ledger.
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
                <div className="mt-1 text-2xl font-semibold text-amber-200">
                  {formatUsdt(totalPnlUsdt)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-slate-400">Venue</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">Binance</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Venue Status
            </div>
            <h2 className="mt-1 text-xl font-semibold">Connectivity and Account</h2>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-400">API Credentials</span>
                <span className={binanceStatus?.configured ? "text-emerald-300" : "text-amber-200"}>
                  {binanceStatus?.configured ? "Configured" : "Missing"}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-400">Binance Reachability</span>
                <span className={binanceStatus?.reachable ? "text-emerald-300" : "text-slate-300"}>
                  {binanceStatus?.reachable ? "Online" : "Unknown"}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-400">Environment</span>
                <span className="text-amber-200">
                  {binanceStatus?.environment || "testnet"}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-400">REST Feed</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${feedStatusClass(restStatus)}`}>
                  {restStatus}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-400">WebSocket</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${feedStatusClass(socketStatus)}`}>
                  {socketStatus}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-300">
                <div className="text-slate-500">Feed Errors</div>
                <div className="mt-1 text-sm">{feedError || "No upstream error reported."}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-300">
                <div className="text-slate-500">Execution Errors</div>
                <div className="mt-1 text-sm">{executionError || "No execution error reported."}</div>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Market Matrix
            </div>
            <h2 className="mt-1 text-xl font-semibold">Binance Quotes</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {quoteCards.map(({ pair, quote }) => (
                <div key={pair} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="font-medium text-slate-100">{pair}</div>
                  <div className="mt-3 text-sm text-slate-300">Bid: {quote ? quote.bid.toFixed(2) : "-"}</div>
                  <div className="text-sm text-slate-300">Ask: {quote ? quote.ask.toFixed(2) : "-"}</div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {quote ? `${quote.source.toUpperCase()} ${formatDateTime(quote.updatedAt)}` : "No quote"}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Bot Fleet
            </div>
            <h2 className="mt-1 text-xl font-semibold">Binance-only Strategies</h2>
            <div className="mt-5 grid gap-4">
              {bots.map((bot) => {
                const quote = market[bot.pair];
                const edge = quote
                  ? computeMoveMetrics(quote.bid, quote.ask, bot.feeBps, bot.slippageBps)
                  : null;
                const backtest = backtests[bot.id];

                return (
                  <div key={bot.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{bot.name}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${botStatusClass(bot.status)}`}>
                            {bot.status}
                          </span>
                          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-100">
                            {bot.mode}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-400">Last start: {formatDateTime(bot.lastStartedAt)}</div>
                        <div className="mt-1 text-sm text-slate-300">Signal: {bot.lastSignal}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleBot(bot.id)}
                          className={
                            "rounded-xl px-4 py-2 text-sm font-medium transition " +
                            (bot.status === "running"
                              ? "bg-rose-600 text-white hover:bg-rose-500"
                              : "bg-emerald-600 text-white hover:bg-emerald-500")
                          }
                        >
                          {bot.status === "running" ? "Stop" : "Start"}
                        </button>
                        <button
                          onClick={() => runBacktest(bot.id)}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:border-amber-400/60 hover:bg-amber-500/10"
                        >
                          Backtest
                        </button>
                        <button
                          onClick={() => runTestnetBuy(bot.id)}
                          disabled={!binanceStatus?.configured}
                          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Testnet Buy
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs text-slate-400">
                        Pair
                        <select
                          value={bot.pair}
                          onChange={(event) => updateBot(bot.id, { pair: event.target.value as Pair })}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                        >
                          {(Object.keys(BINANCE_SYMBOLS) as Pair[]).map((pair) => (
                            <option key={pair} value={pair}>{pair}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-400">
                        Mode
                        <select
                          value={bot.mode}
                          onChange={(event) => updateBot(bot.id, { mode: event.target.value as BotMode })}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                        >
                          <option value="Paper">Paper</option>
                          <option value="Testnet">Testnet</option>
                          <option value="Manual">Manual</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-400">
                        Min Net Move %
                        <input
                          type="number"
                          step="0.05"
                          value={bot.minMovePct}
                          onChange={(event) => updateBot(bot.id, { minMovePct: Number(event.target.value || 0) })}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                        />
                      </label>
                      <label className="text-xs text-slate-400">
                        Max Capital USDT
                        <input
                          type="number"
                          step="100"
                          value={bot.maxCapitalUsdt}
                          onChange={(event) => updateBot(bot.id, { maxCapitalUsdt: Number(event.target.value || 0) })}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Gross Spread</div>
                        <div className="mt-1 text-sm font-semibold text-sky-200">{edge ? formatPct(edge.grossSpreadPct) : "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Fees</div>
                        <div className="mt-1 text-sm font-semibold text-amber-200">{edge ? `-${formatPct(edge.feeImpactPct).replace("+", "")}` : "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Slippage</div>
                        <div className="mt-1 text-sm font-semibold text-rose-200">{edge ? `-${formatPct(edge.slippageImpactPct).replace("+", "")}` : "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Net Edge</div>
                        <div className="mt-1 text-sm font-semibold text-emerald-300">{edge ? formatPctWithBps(edge.netEdgePct) : "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3">
                        <div className="text-xs text-slate-500">Backtest</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">
                          {backtest ? `${formatUsdt(backtest.totalPnlUsdt)} / ${backtest.winRatePct}%` : "not run"}
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
              Backtesting
            </div>
            <h2 className="mt-1 text-xl font-semibold">Binance Scenario Results</h2>
            <div className="mt-5 space-y-3">
              {bots.map((bot) => {
                const result = backtests[bot.id];
                return (
                  <div key={`backtest-${bot.id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-100">{bot.name}</div>
                        <div className="text-xs text-slate-500">{bot.pair} / Binance venue</div>
                      </div>
                      <button
                        onClick={() => runBacktest(bot.id)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 transition hover:border-amber-400/60 hover:bg-amber-500/10"
                      >
                        Refresh
                      </button>
                    </div>
                    {result ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">PnL</div>
                          <div className="mt-1 font-semibold text-amber-200">{formatUsdt(result.totalPnlUsdt)}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">Win Rate</div>
                          <div className="mt-1 font-semibold text-slate-100">{result.winRatePct}%</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">Trades</div>
                          <div className="mt-1 font-semibold text-slate-100">{result.trades}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3">
                          <div className="text-slate-500">Avg Edge</div>
                          <div className="mt-1 font-semibold text-sky-200">{formatPctWithBps(result.avgEdgePct)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-slate-400">Backtest has not been run yet.</div>
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
                Execution Ledger
              </div>
              <h2 className="mt-1 text-xl font-semibold">Binance Executions</h2>
            </div>
            <div className="text-xs text-slate-500">Venue-scoped history for Binance-only paper and testnet bots.</div>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Bot</th>
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">Notional</th>
                  <th className="px-4 py-3 font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={6}>
                      No executions yet. Start a Binance bot and wait for a valid trigger.
                    </td>
                  </tr>
                ) : (
                  tradeHistory.map((trade) => (
                    <tr key={trade.id} className="border-t border-white/6 text-slate-200">
                      <td className="px-4 py-3 text-slate-400">{formatDateTime(trade.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{trade.botName}</div>
                        <div className="text-xs text-slate-500">
                          {trade.mode}
                          {trade.executionMode ? ` / ${trade.executionMode}` : ""}
                          {trade.provider ? ` / ${trade.provider}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">{trade.pair}</td>
                      <td className="px-4 py-3 text-emerald-300">{formatPctWithBps(trade.netEdgePct)}</td>
                      <td className="px-4 py-3">{formatUsdt(trade.notionalUsdt)}</td>
                      <td className="px-4 py-3 text-amber-200">{formatUsdt(trade.pnlUsdt)}</td>
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
