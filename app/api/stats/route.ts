// GET /api/stats — totals for the Coach stats page. Requires header x-stats-key matching the STATS_KEY env var.
import { NextResponse } from "next/server";
import { redis, storageConfigured } from "@/lib/track-server";

export const dynamic = "force-dynamic";
const toObj = (flat: unknown) => { const a = (flat as string[]) ?? [], o: Record<string, number | string> = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = isNaN(Number(a[i + 1])) ? a[i + 1] : Number(a[i + 1]); return o };

export async function GET(req: Request) {
  const key = process.env.STATS_KEY;
  if (!key || req.headers.get("x-stats-key") !== key) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storageConfigured()) return NextResponse.json({ configured: false });
  const [fans, starts, finishes, points, hints] = await redis([["HGETALL", "rival:fans"], ["HGETALL", "rival:starts"], ["HGETALL", "rival:finishs"], ["HGETALL", "rival:points"], ["HGETALL", "rival:hints"]]);
  return NextResponse.json({ configured: true, fans: toObj(fans), starts: toObj(starts), finishes: toObj(finishes), points: toObj(points), hints: toObj(hints) },
    { headers: { "Cache-Control": "no-store" } });
}
