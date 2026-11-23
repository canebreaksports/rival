// Password-protects every /coach page (weekly review with answers, coach play, stats). Players' pages stay open.
// Set COACH_PASSWORD in Vercel → Settings → Environment Variables. Without it, coach pages stay locked.
import { NextResponse, type NextRequest } from "next/server";
import { coachAuthorized } from "@/lib/coach-auth";

export function proxy(request: NextRequest) {
  if (coachAuthorized(request.headers.get("authorization"), process.env.COACH_PASSWORD)) return NextResponse.next();
  return new NextResponse("Coach area: password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PITTED coach", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export const config = { matcher: ["/coach", "/coach/:path*"] };
