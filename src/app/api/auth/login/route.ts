import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  checkPassword,
  createSessionToken,
  isAuthConfigured,
  safeNextPath,
} from "@/lib/auth/session";

/** POST /api/auth/login – Formular der Login-Seite. */
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));

  if (!isAuthConfigured() || !checkPassword(password)) {
    // Kurze Pause bremst Rate-Versuche aus.
    await new Promise((r) => setTimeout(r, 800));
    const back = new URL("/login", req.url);
    back.searchParams.set("error", isAuthConfigured() ? "wrong" : "setup");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}
