// Twist questions (owner, Nov 2026: "twist stereotypes and expected answers to lesser-known results"), from box scores:
//   1. the winner was out-gained (by 50+ yards): "Auburn won the Kick Six game, but which team gained more yards?"
//   2. a Heisman contender's quiet day in a rivalry WIN: under half his season per-game average.
import type { HonorsData } from "./honors-gen";
import type { PlayerSeason, Question, RivalryGame, RivalryPair, SchoolKey } from "./types";
import { shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";

const nm = (k: SchoolKey) => SCHOOL[k].name;
const longDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const winner = (g: RivalryGame) => (g.hp > g.ap ? g.home : g.away), loser = (g: RivalryGame) => (g.hp > g.ap ? g.away : g.home);
const box = (g: RivalryGame) => ({ date: longDate(g.date), winner: winner(g), loser: loser(g), ws: Math.max(g.hp, g.ap), ls: Math.min(g.hp, g.ap), venue: g.venue });
const HOOK: Record<string, string> = { "ALA|AUB|2013": "the Kick Six game" };
const norm = (n: string) => n.toLowerCase().replace(/['’.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();

export type RankLookup = (date: string, k: SchoolKey) => number | null | undefined;
/** "No. 1 Alabama" when the team was ranked going into the game (AP poll in force that week). */
export const tagged = (k: SchoolKey, date: string, rank?: RankLookup) => { const r = rank?.(date, k); return `${r ? `No. ${r} ` : ""}${nm(k)}` };

export function genOutgainedMC(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng, rank?: RankLookup, skip: Set<string> = new Set()): Question | null {
  const key = [a, b].sort().join("|");
  const games = pr.games.filter(g => g.season >= 2000 && g.season <= 2025 && g.hp !== g.ap && g.team?.[a] && g.team?.[b] && !skip.has(g.date));
  const ranked = (g: RivalryGame) => [a, b].filter(k => rank?.(g.date, k)).length; // notable first: both ranked, then one
  const cands = games.filter(g => g.team![loser(g)].total - g.team![winner(g)].total >= 50)
    .sort((x, y) => ranked(y) - ranked(x) || (y.team![loser(y)].total - y.team![winner(y)].total) - (x.team![loser(x)].total - x.team![winner(x)].total));
  if (!cands.length) return null;
  const g = shuffle(rng, cands.filter(c => ranked(c) === ranked(cands[0])).slice(0, 3))[0];
  const w = winner(g), l = loser(g), lt = g.team![l].total, wt = g.team![w].total, d = lt - wt;
  const other = d >= 100 ? Math.round(d / 2 / 10) * 10 : d + 40;
  const opts = [`${nm(l)} by ${d}`, `${nm(w)} by ${d}`, `${nm(l)} by ${other}`, `${nm(w)} by ${other}`];
  const hook = `${HOOK[`${key}|${g.season}`] ? `(${HOOK[`${key}|${g.season}`]}) ` : ""}went to ${tagged(w, g.date, rank)}, ${Math.max(g.hp, g.ap)}–${Math.min(g.hp, g.ap)}, over ${tagged(l, g.date, rank)}`;
  return { type: "mc", label: "Twist", verified: true, pitted: true, game: box(g),
    prompt: `The ${g.season} ${nm(a)}–${nm(b)} game ${hook}. Which team gained more total yards, and by how much?`,
    options: opts, answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
    reveal: `Twist: ${nm(l)} out-gained ${nm(w)} ${lt} to ${wt} and still lost. (${nm(l)} ${g.team![l].rush} rushing, ${g.team![l].pass} passing; ${nm(w)} ${g.team![w].rush} rushing, ${g.team![w].pass} passing.)`,
    sig: "xo" + g.date } as Question;
}

export function genQuietStarMC(h: HonorsData, pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng, season: (name: string, school: SchoolKey, year: number) => PlayerSeason | undefined,
  rank?: RankLookup, skip: Set<string> = new Set()): Question | null {
  const cands = h.heisman.filter(v => (v.school === a || v.school === b) && v.place <= 10).flatMap(v => {
    const g = pr.games.find(x => x.season === v.year && !!x.box && x.date >= `${v.year}-08-01` && x.date < `${v.year + 1}-01-01`);
    if (!g || winner(g) !== v.school || skip.has(g.date)) return [];              // his team won: the "quiet day" is the twist
    for (const [cat, k, what] of [["rush", "rush", "rushing yards"], ["rec", "rec", "receiving yards"]] as const) {
      const p = g.box![v.school]?.find(x => x.cat === cat && norm(x.name) === norm(v.name)), s = season(v.name, v.school, v.year);
      const tot = s?.[k]; if (!p || !tot || tot < 900 || (p.n ?? 0) < (cat === "rush" ? 10 : 4)) continue; // a real workload: an injury exit isn't a "quiet day"
      const avg = Math.round(tot / 13);                                               // per-game average over a 13-game season
      if (p.yds <= avg * 0.5 && avg - p.yds >= 40) return [{ v, g, p, avg, tot, what }];
    }
    return [];
  });
  if (!cands.length) return null;
  const { v, g, p, avg, tot, what } = shuffle(rng, cands)[0];
  const step = Math.max(25, Math.round((avg - p.yds) / 2 / 5) * 5), opts = [p.yds, p.yds + step, p.yds + 2 * step, p.yds + 3 * step];
  const opp = v.school === a ? b : a, place = v.place === 1 ? "won the Heisman" : `finished ${v.place}${v.place === 2 ? "nd" : v.place === 3 ? "rd" : "th"} in Heisman voting`;
  return { type: "mc", label: "Twist", verified: true, pitted: true, game: box(g),
    prompt: `${v.name} ${place} in ${v.year}. How many ${what} did he have when ${tagged(v.school, g.date, rank)} beat ${tagged(opp, g.date, rank)} that year?`,
    options: opts.map(String), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
    reveal: `Twist: just ${p.yds}${p.n ? ` on ${p.n} ${what === "rushing yards" ? "carries" : "catches"}` : ""}, against a season of ${tot.toLocaleString("en-US")} (about ${avg} a game). ${nm(v.school)} won ${Math.max(g.hp, g.ap)}–${Math.min(g.hp, g.ap)} anyway.`,
    sig: "xq" + v.name + v.year } as Question;
}

/** Historic day (owner, Nov 2026): set the stage (rankings, the player, his workload), then deliver a huge number.
 *  A notable player's biggest rivalry game: 200+ rushing, 175+ receiving or 400+ passing yards (box scores). */
export function genBigDayMC(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng, notable: (name: string, school: SchoolKey) => boolean,
  rank?: RankLookup, skip: Set<string> = new Set()): Question | null {
  const MIN = { rush: 200, rec: 175, pass: 400 } as const, WHAT = { rush: ["rushing yards", "carried", "times"], rec: ["receiving yards", "caught", "passes"], pass: ["passing yards", "completed", "passes"] } as const;
  const games = pr.games.filter(g => g.season >= 2000 && g.season <= 2025 && g.box && !skip.has(g.date));
  const all = games.flatMap(g => Object.entries(g.box!).flatMap(([k, ps]) => ps.map(p => ({ g, k, p }))));
  const big = all.filter(x => x.p.yds >= MIN[x.p.cat] && (x.p.n ?? 0) > 0 && notable(x.p.name, x.k)).sort((x, y) => y.p.yds / MIN[y.p.cat] - x.p.yds / MIN[x.p.cat]);
  if (!big.length) return null;
  const { g, k, p } = shuffle(rng, big.slice(0, 3))[0];
  const [what, verb, noun] = WHAT[p.cat], opp = k === a ? b : a, won = winner(g) === k;
  const step = p.cat === "pass" ? 60 : 40, opts = [p.yds, p.yds - step, p.yds - 2 * step, p.yds - 3 * step].filter(v => v > 0);
  if (opts.length < 4) return null;
  const series = all.filter(x => x.p.cat === p.cat).sort((x, y) => y.p.yds - x.p.yds), place = series.findIndex(x => x.p === p) + 1;
  const since = Math.min(...games.map(x => x.season));
  return { type: "mc", label: "Historic Day", verified: true, pitted: true, game: box(g),
    prompt: `${g.season}: ${tagged(k, g.date, rank)} vs. ${tagged(opp, g.date, rank)}. ${p.name} ${verb} ${p.n} ${noun}. How many ${what} did he finish with?`,
    options: opts.map(String), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
    reveal: `${p.yds} ${what}${p.td ? ` and ${p.td} TD` : ""}${place <= 3 ? `, ${place === 1 ? "the most" : `No. ${place}`} by anyone in this rivalry since ${since} (box scores)` : ""}. ${won ? `${nm(k)} won` : `${nm(k)} still lost`}, ${Math.max(g.hp, g.ap)}–${Math.min(g.hp, g.ap)}.`,
    sig: "xb" + g.date + p.name } as Question;
}
