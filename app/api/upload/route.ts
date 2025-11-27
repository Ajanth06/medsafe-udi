// app/api/upload/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!PINATA_JWT) {
      return NextResponse.json(
        { error: "PINATA_JWT ist nicht gesetzt" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Keine Datei übergeben" },
        { status: 400 }
      );
    }

    const pinataFormData = new FormData();
    pinataFormData.append("file", file);

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataFormData,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Pinata-Upload fehlgeschlagen", details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    // Pinata liefert normalerweise: data.IpfsHash
    const cid = data.IpfsHash;
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

    // GENAU das erwartet dein Frontend:
    return NextResponse.json(
      {
        cid,
        url,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Upload-Fehler:", err);
    return NextResponse.json(
      { error: "Unerwarteter Fehler beim Upload" },
      { status: 500 }
    );
  }
}
