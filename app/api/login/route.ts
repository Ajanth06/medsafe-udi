// app/api/login/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawPassword = body?.password ?? "";

    // User-Passwort + ENV-Passwort sauber trimmen
    const userPassword = String(rawPassword).trim();
    const envPassword = (process.env.ADMIN_PASSWORD ?? "").trim();

    if (!envPassword) {
      console.error("ADMIN_PASSWORD ist nicht gesetzt oder leer!");
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    if (userPassword !== envPassword) {
      // falsches Passwort
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // richtiges Passwort → Cookie setzen
    const res = NextResponse.json({ ok: true });
    const isProd = process.env.NODE_ENV === "production";

    res.cookies.set("medsafe_session", "ok", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 60 * 60 * 8, // 8 Stunden
      path: "/",
    });

    return res;
  } catch (e) {
    console.error("Login error", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
