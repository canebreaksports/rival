// School leaderboard (owner, Nov 2026): entries (completed weekly games) by players' chosen school, from the anonymous
// tracking data (app/api/track): rival:finishs (slug|school|side -> count), rival:points (slug|school -> total), rival:fans (pid -> school).
import { redis, storageConfigured } from "./track-server";

export interface SchoolRow { school: string; entries: number; players: number; avg: number }
const pairs = (flat: unknown) => { const a = (flat as string[]) ?? [], o: [string, string][] = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o };

export async function schoolLeaderboard(): Promise<{ configured: boolean; rows: SchoolRow[]; entries: number }> {
  if (!storageConfigured()) return { configured: false, rows: [], entries: 0 };
  const [fin, pts, fans] = await redis([["HGETALL", "rival:finishs"], ["HGETALL", "rival:points"], ["HGETALL", "rival:fans"]]);
  const m = new Map<string, SchoolRow & { total: number }>();
  const row = (k: string) => m.get(k) ?? (m.set(k, { school: k, entries: 0, players: 0, avg: 0, total: 0 }), m.get(k)!);
  for (const [k, v] of pairs(fin)) row(k.split("|")[1]).entries += Number(v) || 0;
  for (const [k, v] of pairs(pts)) row(k.split("|")[1]).total += Number(v) || 0;
  for (const [, school] of pairs(fans)) row(school).players++;
  const rows = [...m.values()].filter(r => r.entries || r.players).map(r => ({ school: r.school, entries: r.entries, players: r.players, avg: r.entries ? Math.round(r.total / r.entries) : 0 }))
    .sort((x, y) => y.entries - x.entries || y.players - x.players || x.school.localeCompare(y.school));
  return { configured: true, rows, entries: rows.reduce((t, r) => t + r.entries, 0) };
}
