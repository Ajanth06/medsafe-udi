import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Exchange = "Binance" | "Coinbase" | "Kraken";
type BotMode = "Live" | "Paper" | "Manual";

type PaperExecutionRequest = {
  botId: string;
  botName: string;
  pair: string;
  buyExchange: Exchange;
  sellExchange: Exchange;
  grossSpreadPct: number;
  feeImpactPct: number;
  slippageImpactPct: number;
  latencyBufferPct: number;
  netEdgePct: number;
  notionalUsdt: number;
  mode: BotMode;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PaperExecutionRequest;

    if (!body?.botId || !body?.pair) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    if (body.buyExchange === body.sellExchange) {
      return NextResponse.json({ error: "invalid_route" }, { status: 400 });
    }

    if (body.mode === "Live") {
      return NextResponse.json(
        { error: "live_execution_not_enabled" },
        { status: 400 }
      );
    }

    if (
      (body.buyExchange === "Binance" || body.sellExchange === "Binance") &&
      (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET)
    ) {
      return NextResponse.json(
        { error: "binance_not_configured" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        id: crypto.randomUUID(),
        status: "filled",
        executionMode: "paper",
        provider: "server",
        executedAt: new Date().toISOString(),
        ...body,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "paper_execution_failed",
      },
      { status: 500 }
    );
  }
}
