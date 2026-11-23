// Who counts as a notable player (owner's rule, Nov 2026: no higher/lower questions on obscure players).
// Notable = a star (players.json), an award winner or Heisman top-5 finisher, a first-round NFL pick,
// a school top-10 career rusher or receiver, a school top-10 single season (rushing or receiving, any era),
// a 1,000-yard rushing or receiving season (2012+ season leaders), or the owner's own list below.
import type { Dataset } from "./types";

export const playerKey = (name: string, school: string) =>
  name.toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/['’.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim() + "|" + school;

/** Players the owner has called notable by name (name, school). */
export const OWNER_NOTABLE: [string, string][] = [["Dexter McCluster", "MISS"]];

const CACHE = new WeakMap<Dataset, Set<string>>();
export function notablePlayers(data: Dataset): Set<string> {
  const hit = CACHE.get(data); if (hit) return hit;
  const s = new Set<string>(), add = (n: string, k: string) => s.add(playerKey(n, k));
  for (const p of data.players.players) if (p.star) add(p.name, p.school);
  for (const w of data.honors?.everWon ?? []) add(w.name, w.school);
  for (const v of data.honors?.heisman ?? []) if (v.place <= 5) add(v.name, v.school);
  for (const p of data.draft?.picks ?? []) if (p.round === 1) add(p.name, p.school);
  for (const [k, l] of Object.entries(data.career ?? {})) for (const e of l.list) {
    add(e.name.replace(/'[^']+'\s*/g, ""), k);                                     // Carnell 'Cadillac' Williams → Carnell Williams
    const nick = e.name.match(/'([^']+)'\s+(.+)$/); if (nick) add(`${nick[1]} ${nick[2]}`, k); // … and Cadillac Williams
  }
  for (const [k, l] of Object.entries(data.careerRec ?? {})) for (const e of l.list) add(e.name, k);
  for (const [k, L] of Object.entries(data.leaders?.schools ?? {})) for (const x of L) if (x.rush >= 1000 || x.rec >= 1000) add(x.name, k);
  for (const [k, r] of Object.entries(data.seasonRecs ?? {})) for (const x of [...(r.rush ?? []), ...(r.rec ?? [])]) add(x.name, k);
  for (const [n, k] of OWNER_NOTABLE) add(n, k);
  CACHE.set(data, s);
  return s;
}
export const isNotable = (data: Dataset, name: string, school: string) => notablePlayers(data).has(playerKey(name, school));
