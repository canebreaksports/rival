// "Since <year>" trend questions (pitted), asked every week:
//   1. Which school had more X-yard rushing/receiving SEASONS from <year> through 2025?   (+ list of occurrences)
//   2. Since <year>, which school had more 100-yard GAMES against the other?             (+ list of occurrences)
//   3. Since <year>, which player from either school has the most yards against the other? (multiple choice)
import type { Question, RivalryPair, SchoolKey } from "./types";
import { pick, shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";
import { fmt } from "./generators";

export interface LeaderSeason { name: string; season: number; rush: number; rec: number; margin: number }
export interface SeasonLeaders { source: string; from: number; to: number; schools: Record<SchoolKey, LeaderSeason[]> }

const name = (k: SchoolKey) => SCHOOL[k].name;
const gameGap = (a: number) => Math.max(15, 0.12 * a);
const totalGap = (a: number, b: number) => Math.max(25, 0.1 * Math.max(a, b));
const THRESH = { rush: [800, 900, 1000, 1100, 1200, 1300, 1500], rec: [600, 700, 800, 850, 900, 1000, 1100] };

/** 1. Season counts over a window, e.g. "From 2018 through 2025, which school had more 850-yard receiving seasons?" */
export function genSeasonCount(sl: SeasonLeaders, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const A = sl.schools[a] ?? [], B = sl.schools[b] ?? [];
  const cands: { k: "rush" | "rec"; t: number; from: number }[] = [];
  for (const k of ["rush", "rec"] as const) for (const t of THRESH[k]) for (const from of [2012, 2014, 2016, 2018, 2020]) {
    const rows = [...A, ...B].filter(s => s.season >= from && s.season <= sl.to);
    if (rows.some(s => Math.abs(s[k] - t) < s.margin)) continue;                // nobody close enough to the line to flip the count
    const n = (L: typeof A) => L.filter(s => s.season >= from && s.season <= sl.to && s[k] >= t).length;
    if (n(A) + n(B) < 2 || n(A) + n(B) > 14) continue;                           // something to count, a list short enough to read
    cands.push({ k, t, from });
  }
  if (!cands.length) return null;
  const { k, t, from } = pick(rng, cands);
  const list = (L: typeof A) => L.filter(s => s.season >= from && s.season <= sl.to && s[k] >= t).map(s => ({ name: s.name, yards: s[k], season: s.season }));
  const what = k === "rush" ? "rushing" : "receiving";
  return {
    type: "count", label: "Since " + from, a, b, threshold: t, verified: true, pitted: true,
    prompt: `From ${from} through ${sl.to}, which school had more ${fmt(t)}-yard ${what} seasons?`,
    A: list(A), B: list(B), sig: "ts" + k + t + from,
  };
}

/** 2. 100-yard games against the other school, over the pair's fully covered window. */
export function genGameCount(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const from = pr.vsFrom;
  if (from == null) return null;
  const games = pr.games.filter(g => g.season >= from && g.box);
  for (const [cat, t] of shuffle(rng, [["rush", 100], ["rec", 100], ["rush", 150], ["pass", 300]] as const)) {
    const perfs = games.flatMap(g => Object.entries(g.box!).flatMap(([school, ps]) => ps.filter(p => p.cat === cat).map(p => ({ school, p, g }))));
    if (perfs.some(x => Math.abs(x.p.yds - t) < gameGap(t))) continue;           // nobody close enough to the line to flip it
    const hit = (s: SchoolKey) => perfs.filter(x => x.school === s && x.p.yds >= t).map(x => ({ name: x.p.name, yards: x.p.yds, season: x.g.season }));
    const n = hit(a).length + hit(b).length;
    if (n < 2 || n > 14) continue;
    const what = cat === "rush" ? "rushing" : cat === "rec" ? "receiving" : "passing";
    return {
      type: "count", label: "Since " + from, a, b, threshold: t, verified: true, pitted: true,
      prompt: `Since ${from}, which school has had more ${t}-yard ${what} games against the other?`,
      A: hit(a), B: hit(b), sig: "tg" + cat + t,
    };
  }
  return null;
}

/** 3. Most yards against the other school, either side (multiple choice, both schools among the options). */
export function genVsLeaderMC(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const from = pr.vsFrom;
  if (from == null) return null;
  for (const [k, what] of shuffle(rng, [["scrim", "yards from scrimmage"], ["rush", "rushing yards"], ["rec", "receiving yards"]] as const)) {
    const val = (v: (typeof pr.vs)[0]) => (k === "scrim" ? v.rush + v.rec : v[k]);
    const ranked = [...pr.vs].sort((x, y) => val(y) - val(x));
    if (ranked.length < 4 || val(ranked[0]) - val(ranked[1]) < totalGap(val(ranked[0]), val(ranked[1]))) continue; // clear winner only
    const opts = ranked.slice(0, 4);
    if (new Set(opts.map(v => v.school)).size < 2) { const other = ranked.find(v => v.school !== opts[0].school); if (!other) continue; opts[3] = other }
    const label = (v: (typeof pr.vs)[0]) => `${v.name} (${name(v.school)})`;
    return {
      type: "mc", label: "Since " + from, verified: true, pitted: true,
      prompt: `Since ${from}, which player from either school has the most ${what} against the other?`,
      options: opts.map(label), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
      reveal: opts.map(v => `${label(v)} ${fmt(val(v))} in ${v.games} game${v.games > 1 ? "s" : ""}`).join(" · "),
      sig: "tv" + k,
    };
  }
  return null;
}
