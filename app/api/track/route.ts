// POST /api/track — anonymous play counts. Records: each device's chosen school, and per matchup how many players
// started / finished it, split by whether it involves their own school. Each device counts once per matchup.
import { NextResponse } from "next/server";
import { DATA } from "@/lib/data";
import { weekSlug } from "@/lib/build";
import { involvesOwn, redis, storageConfigured, validateEvent } from "@/lib/track-server";

export const dynamic = "force-dynamic";
const SLUGS = new Set(DATA.schedule.games.map(weekSlug));

export async function POST(req: Request) {
  if (!storageConfigured()) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try { body = JSON.parse(await req.text()) } catch { return new NextResponse(null, { status: 400 }) }
  const ev = validateEvent(body, SLUGS);
  if (!ev) return new NextResponse(null, { status: 400 });
  try {
    if (ev.e === "pick") await redis([["HSET", "rival:fans", ev.pid, ev.school]]);
    else {
      const side = involvesOwn(ev.slug, ev.school) ? "own" : "other";
      const [first] = await redis([["SADD", `rival:${ev.e}:${ev.slug}`, ev.pid]]); // once per device per matchup
      if (first === 1) {
        const cmds: (string | number)[][] = [["HINCRBY", `rival:${ev.e}s`, `${ev.slug}|${ev.school}|${side}`, 1]];
        if (ev.e === "finish") cmds.push(["HINCRBY", "rival:points", `${ev.slug}|${ev.school}`, ev.pts], ["HINCRBY", "rival:hints", `${ev.slug}|${ev.school}`, ev.hints]);
        await redis(cmds);
      }
    }
  } catch { return new NextResponse(null, { status: 502 }) }
  return new NextResponse(null, { status: 204 });
}
