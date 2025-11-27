// app/api/upload/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";        // sichert, dass wir Node-Runtime haben
export const dynamic = "force-dynamic"; // kein Caching der Route

export async function POST(req: Request) {
  try {
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!PINATA_JWT) {
      return NextResponse.json(
        { error: "PINATA_JWT ist nicht gesetzt" },
        { status: 500 }
      );
    }

    // FormData aus der Anfrage lesen
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Keine Datei übergeben" },
        { status: 400 }
      );
    }

    // Neues FormData für Pinata bauen
    const pinataFormData = new FormData();
    pinataFormData.append("file", file);

    // Upload zu Pinata
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

    // Typische Pinata-Antwort zurückgeben
    return NextResponse.json(
      {
        ipfsHash: data.IpfsHash,
        pinSize: data.PinSize,
        timestamp: data.Timestamp,
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
