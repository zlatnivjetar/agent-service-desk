import { NextRequest, NextResponse } from "next/server";

// BetterAuth uses __Secure- prefix on HTTPS (production), plain name on HTTP (local).
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_COOKIE_SECURE = "__Secure-better-auth.session_token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SESSION_COOKIE_SECURE);

  // Already on login — redirect authenticated users away
  if (pathname === "/login") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/tickets", request.url));
    }
    return NextResponse.next();
  }

  // Unauthenticated → send to login
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude API routes, static files, and image optimization
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
