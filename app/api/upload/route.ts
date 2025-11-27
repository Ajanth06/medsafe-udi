import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });

    // Cookie setzen: in Prod secure, in Dev nicht
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
