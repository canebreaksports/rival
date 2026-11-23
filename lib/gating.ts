// Game-week gating: a matchup unlocks Monday 7:00 AM Central of its game week (same moment for everyone; owner's
// call, Nov 2026, was Sunday) and locks 11:59 PM Central on game day. Thursday–Saturday games share the Monday unlock. DST-aware via Intl.
import type { Game } from "./types";

export const TZ = "America/Chicago";
export const UNLOCK_HOUR = 7;

export const dateOf = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) };

/** Sunday (YYYY-MM-DD) of the week containing a YYYY-MM-DD date, by calendar arithmetic (time-zone free). */
export function sundayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d), dow = new Date(t).getUTCDay();
  return new Date(t - dow * 86400e3).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of a game's week: the day after its Sunday. Games are Thursday–Saturday. */
export function mondayOf(date: string) {
  const [y, m, d] = sundayOf(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + 86400e3).toISOString().slice(0, 10);
}

/** Offset of a time zone from UTC at an instant, in ms (e.g. −6h for CST). */
function tzOffset(t: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(t)).filter(x => x.type !== "literal").map(x => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** The instant that is YYYY-MM-DD hh:mm wall-clock time in a time zone. */
export function zonedInstant(date: string, h: number, m: number, tz = TZ): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m);
  let t = wall - tzOffset(wall, tz);
  t = wall - tzOffset(t, tz); // second pass settles DST edges
  return new Date(t);
}

export function windowOf(g: Game) {
  const start = zonedInstant(mondayOf(g.date), UNLOCK_HOUR, 0);
  const end = new Date(zonedInstant(g.date, 23, 59).getTime() + 59_999);
  const day = new Date(g.date + "T12:00:00Z"); // for display: noon UTC is the same calendar day across US time zones
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

export const dfmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
/** Unlock moment in Central time, e.g. "Mon, Nov 23 · 7 AM CT". */
export const unlockFmt = (d: Date) =>
  `${dfmt(d)} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined, timeZone: TZ }).replace(":00", "")} CT`;
