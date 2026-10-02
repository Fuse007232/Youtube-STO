import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isRequestAllowed } from "@/lib/auth/session";

/**
 * Türsteher für das ganze Dashboard: ohne gültige Anmeldung geht es zur Login-Seite.
 * Ausgenommen (siehe matcher): Login/Logout, App-Symbol + Manifest, die öffentliche Datenschutzerklärung, der Zeitplaner-Endpunkt (eigenes Geheimwort)
 * und statische Dateien. Der Google-Login (/api/auth/youtube/*) ist NICHT ausgenommen.
 */
export function proxy(request: NextRequest) {
  if (isRequestAllowed(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Bitte anmelden." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|login|datenschutz|api/auth/login|api/auth/logout|api/cron/).*)",
  ],
};
