import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawPassword = body?.password ?? "";

    const userPassword = String(rawPassword).trim();
    const envPassword = (process.env.ADMIN_PASSWORD ?? "").trim();

    if (!envPassword) {
      console.error("ADMIN_PASSWORD ist nicht gesetzt!");
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    if (userPassword !== envPassword) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    const isProd = process.env.NODE_ENV === "production";

    res.cookies.set("medsafe_session", "ok", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return res;
  } catch (e) {
    console.error("Login error", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
