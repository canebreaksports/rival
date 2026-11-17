// Game-week gating (spec §2): unlocks 00:00 local on the Sunday of game week, locks 23:59 local on game day.
import type { Game } from "./types";

export const dateOf = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) };

export function windowOf(g: Game) {
  const day = dateOf(g.date);
  const start = new Date(day); start.setDate(day.getDate() - day.getDay()); // Sunday 00:00 (Friday games share it)
  const end = new Date(day); end.setHours(23, 59, 59, 999);
  return { start, end, day };
}

export const isLive = (g: Game, now: Date) => { const w = windowOf(g); return now >= w.start && now <= w.end };
export const liveGames = (games: Game[], now: Date) => games.filter(g => isLive(g, now));

export function nextGames(games: Game[], now: Date): Game[] {
  const up = games.filter(g => windowOf(g).start > now);
  if (!up.length) return [];
  const first = Math.min(...up.map(g => windowOf(g).start.getTime()));
  return up.filter(g => windowOf(g).start.getTime() === first);
}

export const dfmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
