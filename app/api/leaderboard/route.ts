// GET /api/leaderboard — public: entries by school affiliation (refreshed about once a minute).
import { NextResponse } from "next/server";
import { schoolLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await schoolLeaderboard(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }) }
  catch { return NextResponse.json({ configured: true, rows: [], entries: 0, error: true }, { status: 502 }) }
}
