import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const polygonApiKey = process.env.POLYGON_API_KEY;
  const twelveDataApiKey =
    process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;

  return NextResponse.json(
    {
      ok: true,
      env: {
        polygon_api_key_present: Boolean(polygonApiKey),
        twelvedata_api_key_present: Boolean(twelveDataApiKey),
      },
      checkedAt: new Date().toISOString(),
    },
    { status: 200 }
  );
}
