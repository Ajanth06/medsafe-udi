import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const documentName = (formData.get("documentName") as string | null) ?? "";
    const deviceId = (formData.get("deviceId") as string | null) ?? "";

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei erhalten" },
        { status: 400 }
      );
    }

    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name);

    uploadForm.append(
      "pinataMetadata",
      JSON.stringify({
        name: documentName || file.name,
        keyvalues: { deviceId },
      })
    );

    const pinataRes = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT!}`,
        },
        body: uploadForm,
      }
    );

    if (!pinataRes.ok) {
      const errText = await pinataRes.text();
      console.error("Pinata Fehler:", errText);
      return NextResponse.json(
        { error: "Upload zu Pinata fehlgeschlagen" },
        { status: 500 }
      );
    }

    const pinataJson = await pinataRes.json();
    const cid = pinataJson.IpfsHash;
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

    return NextResponse.json(
      {
        cid,
        url,
        name: documentName || file.name,
        deviceId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
