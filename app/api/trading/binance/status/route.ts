import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.BINANCE_TESTNET_API_KEY;
  const apiSecret = process.env.BINANCE_TESTNET_API_SECRET;
  const configured = Boolean(apiKey && apiSecret);

  let reachable = false;

  try {
    const response = await fetch("https://testnet.binance.vision/api/v3/ping", {
      cache: "no-store",
    });
    reachable = response.ok;
  } catch {
    reachable = false;
  }

  return NextResponse.json(
    {
      exchange: "Binance",
      mode: "testnet",
      environment: "testnet",
      configured,
      reachable,
    },
    { status: 200 }
  );
}
