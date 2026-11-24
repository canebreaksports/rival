// Coming-back features (owner, Nov 2026: "make it sticky"), from what this device has saved: the weekly streak and season stats.
import type { Game, Progress } from "./types";
import { sundayOf } from "./gating";

export interface Played { date: string; pts: number; right: number; n: number; hints: number }
/** Completed weekly runs on this device (localStorage keys "rival:<date>:<away>@<home>[#rN]"). */
export function playedRuns(): Played[] {
  const out: Played[] = [];
  try {
    for (const k of Object.keys(localStorage)) {
      const m = k.match(/^rival:(\d{4}-\d{2}-\d{2}):[A-Z]+@[A-Z]+/); if (!m) continue;
      const p = JSON.parse(localStorage.getItem(k) ?? "null") as Progress | null;
      if (p?.done) out.push({ date: m[1], pts: p.pts, right: p.right, n: p.n, hints: p.hints ?? 0 });
    }
  } catch { /* storage unavailable */ }
  return out;
}

/** Consecutive game weeks with at least one completed matchup, ending this week (or last week, if this week isn't played yet). */
export function weeklyStreak(runs: Played[], games: Game[], now: Date): { weeks: number; playedThisWeek: boolean } {
  const weeks = [...new Set(games.map(g => sundayOf(g.date)))].sort();
  const today = sundayOf(now.toISOString().slice(0, 10));
  const played = new Set(runs.map(r => sundayOf(r.date)));
  const past = weeks.filter(w => w <= today);
  if (!past.length) return { weeks: 0, playedThisWeek: false };
  const playedThisWeek = played.has(past[past.length - 1]) && past[past.length - 1] === today;
  let i = past.length - 1, n = 0;
  if (!played.has(past[i])) i--;                      // this week not played yet: the streak is still alive from last week
  for (; i >= 0 && played.has(past[i]); i--) n++;
  return { weeks: n, playedThisWeek };
}

export function seasonStats(runs: Played[]) {
  const games = runs.length, pts = runs.reduce((t, r) => t + r.pts, 0), right = runs.reduce((t, r) => t + r.right, 0), asked = runs.reduce((t, r) => t + r.n, 0);
  return { games, pts, best: games ? Math.max(...runs.map(r => r.pts)) : 0, accuracy: asked ? Math.round((right / asked) * 100) : 0 };
}

/** "2d 14h", "3h 05m", "4m". */
export function countdown(ms: number) {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm}m`;
}
