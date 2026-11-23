// "Since <year>" trend questions (pitted), asked every week:
//   1. Which school had more X-yard rushing/receiving SEASONS from <year> through 2025?   (+ list of occurrences)
//   2. Since <year>, which school had more 100-yard GAMES against the other?             (+ list of occurrences)
//   3. Since <year>, which player from either school has the most yards against the other? (multiple choice)
import type { Question, RivalryPair, SchoolKey } from "./types";
import { pick, shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";
import { fmt } from "./generators";
import { posName, profileLine, yds } from "./profile";

export interface LeaderSeason { name: string; season: number; rush: number; rec: number; margin: number; pos?: string }
export interface SeasonLeaders { source: string; from: number; to: number; schools: Record<SchoolKey, LeaderSeason[]> }

const name = (k: SchoolKey) => SCHOOL[k].name;
const gameGap = (a: number) => Math.max(15, 0.12 * a);
const totalGap = (a: number, b: number) => Math.max(25, 0.1 * Math.max(a, b));
const THRESH = { rush: [800, 900, 1000, 1100, 1200, 1300, 1500], rec: [600, 700, 800, 850, 900, 1000, 1100] };

/** 1. Season counts over a window, e.g. "From 2018 through 2025, which school had more 850-yard receiving seasons?" */
export function genSeasonCount(sl: SeasonLeaders, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const A = sl.schools[a] ?? [], B = sl.schools[b] ?? [];
  const cands: { k: "rush" | "rec"; t: number; from: number }[] = [];
  for (const k of ["rush", "rec"] as const) for (const t of THRESH[k]) for (const from of [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022]) {
    const rows = [...A, ...B].filter(s => s.season >= from && s.season <= sl.to);
    if (rows.some(s => Math.abs(s[k] - t) < s.margin)) continue;                // nobody close enough to the line to flip the count
    const n = (L: typeof A) => L.filter(s => s.season >= from && s.season <= sl.to && s[k] >= t).length;
    if (n(A) + n(B) < 2 || n(A) + n(B) > 14) continue;                           // something to count, a list short enough to read
    cands.push({ k, t, from });
  }
  if (!cands.length) return null;
  const { k, t, from } = pick(rng, cands);
  const on = (L: typeof A) => L.filter(s => s.season >= from && s.season <= sl.to && s[k] >= t);
  const list = (L: typeof A) => on(L).map(s => {
    const again = on(L).filter(x => x.name === s.name && x.season !== s.season).map(x => x.season);
    return { name: s.name, yards: s[k], season: s.season, profile: profileLine(posName(s.pos),
      `${s.season}: ${yds(s.rush, "rushing")}, ${yds(s.rec, "receiving")} yds`, again.length && `also on this list in ${again.join(" and ")}`) };
  });
  const what = k === "rush" ? "rushing" : "receiving";
  return {
    type: "count", label: "Since " + from, a, b, threshold: t, verified: true, pitted: true,
    prompt: `From ${from} through ${sl.to}, which school had more ${fmt(t)}-yard ${what} seasons?`,
    A: list(A), B: list(B), sig: "ts" + k + t + from,
  };
}

/** 2. 100-yard games against the other school, over the pair's fully covered window. */
export function genGameCount(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng, sl?: SeasonLeaders): Question | null {
  const from = pr.vsFrom;
  if (from == null) return null;
  const games = pr.games.filter(g => g.season >= from && g.box);
  for (const [cat, t] of shuffle(rng, [["rush", 100], ["rec", 100], ["rush", 150], ["pass", 300]] as const)) {
    const perfs = games.flatMap(g => Object.entries(g.box!).flatMap(([school, ps]) => ps.filter(p => p.cat === cat).map(p => ({ school, p, g }))));
    if (perfs.some(x => Math.abs(x.p.yds - t) < gameGap(t))) continue;           // nobody close enough to the line to flip it
    const posOf = (school: SchoolKey, n: string) => sl?.schools[school]?.find(x => x.name === n && x.pos)?.pos;
    const unit = cat === "rush" ? ["rushing yards", "carries"] : cat === "rec" ? ["receiving yards", "catches"] : ["passing yards", ""];
    const hit = (s: SchoolKey) => perfs.filter(x => x.school === s && x.p.yds >= t).map(x => {
      const again = perfs.filter(y => y.school === s && y.p.yds >= t && y.p.name === x.p.name && y.g !== x.g).map(y => y.g.season);
      return { name: x.p.name, yards: x.p.yds, season: x.g.season, profile: profileLine(posName(posOf(s, x.p.name)),
        `${x.g.season} vs. ${name(s === a ? b : a)}: ${yds(x.p.yds, unit[0])}${x.p.n && unit[1] ? ` on ${x.p.n} ${unit[1]}` : ""}, ${x.p.td} TD`,
        again.length && `also on this list in ${again.join(" and ")}`) };
    });
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
      more: { title: `Top ${what} against the other school since ${from}`,
        rows: ranked.slice(0, 8).map((v, i) => `${i + 1}. ${label(v)} ${fmt(val(v))} in ${v.games} game${v.games > 1 ? "s" : ""}`) },
    };
  }
  return null;
}
