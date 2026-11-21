// Server side of tracking: input validation (pure, tested) and a tiny Upstash Redis REST client.
// Storage is optional: without KV_REST_API_URL/KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) nothing is recorded.
import { TEAM, OTHER } from "./teams";

const PID = /^[A-Za-z0-9-]{8,64}$/;
export type Valid =
  | { e: "pick"; pid: string; school: string }
  | { e: "start" | "finish"; pid: string; school: string; slug: string; pts: number; right: number; hints: number };

export function validateEvent(x: unknown, slugs: Set<string>): Valid | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const school = typeof o.school === "string" ? o.school : "";
  if (typeof o.pid !== "string" || !PID.test(o.pid) || !(school === OTHER || TEAM[school])) return null;
  if (o.e === "pick") return { e: "pick", pid: o.pid, school };
  if ((o.e === "start" || o.e === "finish") && typeof o.slug === "string" && slugs.has(o.slug)) {
    const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1000, Math.min(max, Math.round(v))) : 0);
    return { e: o.e, pid: o.pid, school, slug: o.slug, pts: n(o.pts, 5000), right: n(o.right, 20), hints: n(o.hints, 100) };
  }
  return null;
}

/** "own" when the player's school is one of the two in the matchup slug (e.g. 2026-11-21-lsu-at-tenn). */
export const involvesOwn = (slug: string, school: string) => {
  const [away, home] = slug.slice(11).split("-at-");
  return school.toLowerCase() === away || school.toLowerCase() === home;
};

const env = () => ({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
});
export const storageConfigured = () => { const { url, token } = env(); return !!(url && token) };

/** Runs Redis commands in one round trip; returns each command's result. */
export async function redis(cmds: (string | number)[][]): Promise<unknown[]> {
  const { url, token } = env();
  if (!url || !token) return [];
  const r = await fetch(`${url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds), cache: "no-store" });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return ((await r.json()) as { result: unknown }[]).map(x => x.result);
}
