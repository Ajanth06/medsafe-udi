import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BinancePair = "BTC/USDT" | "ETH/USDT" | "SOL/USDT";

type TestnetOrderRequest = {
  botId: string;
  botName: string;
  pair: BinancePair;
  notionalUsdt: number;
  mode: "Testnet";
};

const SYMBOLS: Record<BinancePair, string> = {
  "BTC/USDT": "BTCUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.BINANCE_TESTNET_API_KEY;
    const apiSecret = process.env.BINANCE_TESTNET_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "binance_testnet_not_configured" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as TestnetOrderRequest;

    if (!body?.botId || !body?.pair || !body?.notionalUsdt) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    if (body.mode !== "Testnet") {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
    }

    const symbol = SYMBOLS[body.pair];
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const quoteOrderQty = Number(body.notionalUsdt).toFixed(2);

    const params = new URLSearchParams({
      symbol,
      side: "BUY",
      type: "MARKET",
      quoteOrderQty,
      recvWindow,
      timestamp,
      newOrderRespType: "FULL",
    });

    const signature = createHmac("sha256", apiSecret)
      .update(params.toString())
      .digest("hex");

    params.set("signature", signature);

    const response = await fetch(
      `https://testnet.binance.vision/api/v3/order?${params.toString()}`,
      {
        method: "POST",
        headers: {
          "X-MBX-APIKEY": apiKey,
        },
        cache: "no-store",
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload?.msg || "binance_testnet_order_failed",
          details: payload,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(
      {
        id: crypto.randomUUID(),
        status: "filled",
        executionMode: "testnet",
        provider: "binance",
        executedAt: new Date().toISOString(),
        side: "BUY",
        symbol,
        order: payload,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "binance_testnet_order_failed",
      },
      { status: 500 }
    );
  }
}
