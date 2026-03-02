import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const twelveDataApiKey =
    process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;
  const massiveS3ConfigPresent = Boolean(
    process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_ENDPOINT
  );

  return NextResponse.json(
    {
      ok: true,
      env: {
        twelvedata_api_key_present: Boolean(twelveDataApiKey),
        massive_s3_config_present: massiveS3ConfigPresent,
      },
      checkedAt: new Date().toISOString(),
    },
    { status: 200 }
  );
}
