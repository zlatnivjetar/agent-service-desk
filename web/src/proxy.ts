import { NextRequest, NextResponse } from "next/server";

// BetterAuth stores the session as a signed cookie with this name.
// We check for its presence here; actual validation happens in server routes.
const SESSION_COOKIE = "better-auth.session_token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

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
