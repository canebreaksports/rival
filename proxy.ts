// The whole site is password-protected (owner, Nov 2026: "players and coaches pages should be closed").
// Players' pages: PLAYER_PASSWORD (or the coach password). Coach pages (review with answers, coach play, stats): COACH_PASSWORD.
// Set both in Vercel → Settings → Environment Variables. A missing password keeps its pages locked.
import { NextResponse, type NextRequest } from "next/server";
import { siteAuthorized } from "@/lib/coach-auth";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const env = { PLAYER_PASSWORD: process.env.PLAYER_PASSWORD, COACH_PASSWORD: process.env.COACH_PASSWORD };
  if (siteAuthorized(path, request.headers.get("authorization"), env)) return NextResponse.next();
  const coach = path === "/coach" || path.startsWith("/coach/");
  return new NextResponse(coach ? "Coach area: password required." : "PITTED is in a private beta: password required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${coach ? "PITTED coach" : "PITTED"}", charset="UTF-8"`, "Cache-Control": "no-store" },
  });
}

// everything except Next's static files and images
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"] };
