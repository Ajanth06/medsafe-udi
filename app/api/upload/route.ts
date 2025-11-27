import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    // Passwort aus ENV lesen
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error("ADMIN_PASSWORD ist nicht gesetzt!");
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    // Falsches Passwort
    if (password !== adminPassword) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Richtiges Passwort → Session-Cookie setzen
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
