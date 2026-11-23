// Only the admin area is password-protected: every /coach page (weekly review with answers and the owner's notable
// players, coach play, stats). The game itself is open to everyone. Set COACH_PASSWORD in Vercel → Settings →
// Environment Variables; without it the admin pages stay locked.
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
