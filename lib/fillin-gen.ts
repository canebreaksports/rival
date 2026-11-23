// Fill-in questions (pitted): pick the school, then name everyone on the list (Name Them, +25 each).
//   1. Combined top 10 single-season rushing / receiving yards for both schools (school record books, data/season-records.json).
//      Each school's top 10 always contains its part of the combined top 10, so the combined list is complete.
//   2. Top 5 players in rushing / receiving / scrimmage yards against the other school since the box-score window opened.
import type { CountEntry, Question, RivalryPair, SchoolKey } from "./types";
import { pick, type Rng } from "./rng";
import { SCHOOL } from "./schools";

export interface SeasonRec { name: string; yards: number; season: number }
export type SeasonRecords = Record<string, { source: string; verified: boolean; rush?: SeasonRec[]; rec?: SeasonRec[] }>;
const nm = (k: SchoolKey) => SCHOOL[k].name;
const f = (v: number) => v.toLocaleString("en-US");

export function genTopSeasons(sr: SeasonRecords, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const stats = (["rush", "rec"] as const).filter(k => sr[a]?.[k]?.length && sr[b]?.[k]?.length);
  if (!stats.length) return null;
  const k = pick(rng, stats), N = 10;
  const all = [a, b].flatMap(s => sr[s][k]!.map(x => ({ ...x, school: s }))).sort((x, y) => y.yards - x.yards);
  const top = all.slice(0, N);
  if (all.length > N && all[N - 1].yards === all[N].yards) return null;         // a tie straddles the cutoff
  if ([a, b].some(s => top.filter(x => x.school === s).length >= sr[s][k]!.length)) return null; // a school's whole list made it: its 11th is unknown
  const what = k === "rush" ? "rushing" : "receiving";
  const entry = (x: (typeof top)[0]): CountEntry => ({ name: x.name, yards: x.yards, season: x.season, label: `${x.season}: ${f(x.yards)}`,
    profile: `${x.season} season, ${f(x.yards)} ${what} yards · No. ${top.indexOf(x) + 1} on the combined list` });
  return { type: "count", label: "Fill In", a, b, threshold: 0, verified: sr[a].verified && sr[b].verified, pitted: true, bonus: "names",
    prompt: `${nm(a)} and ${nm(b)}'s combined top ${N} single-season ${what} yards: which school has more seasons on the list?`,
    A: top.filter(x => x.school === a).map(entry), B: top.filter(x => x.school === b).map(entry), sig: "fs" + k };
}

export function genTopVs(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  if (pr.vsFrom == null) return null;
  const [k, what] = pick(rng, [["rush", "rushing yards"], ["rec", "receiving yards"], ["scrim", "yards from scrimmage"]] as const);
  const val = (v: (typeof pr.vs)[0]) => (k === "scrim" ? v.rush + v.rec : v[k]);
  const ranked = [...pr.vs].filter(v => val(v) > 0).sort((x, y) => val(y) - val(x));
  // the cutoff must be clear of what box-score sums can blur
  const N = [5, 6, 4].find(n => ranked.length > n && val(ranked[n - 1]) - val(ranked[n]) >= Math.max(15, 0.05 * val(ranked[n - 1])));
  if (!N) return null;
  const top = ranked.slice(0, N);
  const entry = (v: (typeof top)[0]): CountEntry => ({ name: v.name, yards: val(v), label: `${f(val(v))} in ${v.games} game${v.games > 1 ? "s" : ""}`,
    profile: `${f(val(v))} ${what} against ${nm(v.school === a ? b : a)} in ${v.games} game${v.games > 1 ? "s" : ""} · No. ${top.indexOf(v) + 1}` });
  return { type: "count", label: "Fill In", a, b, threshold: 0, verified: true, pitted: true, bonus: "names",
    prompt: `Since ${pr.vsFrom}, which school has more players in the top ${N} for ${what} against the other?`,
    A: top.filter(v => v.school === a).map(entry), B: top.filter(v => v.school === b).map(entry), sig: "fv" + k };
}
