// Rivalry generators (pitted): questions about games the two schools actually played against each other.
// Data: data/rivalry.json (CollegeFootballData results 2000–2025, box scores 2012–2025).
import type { Perf, Question, RivalryGame, RivalryPair, SchoolKey, VsTotal } from "./types";
import { pick, shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";
import { fmt } from "./generators";

// Box-score numbers are play-by-play derived: never hinge a question on a gap smaller than these.
const gameGap = (a: number, b = a) => Math.max(15, 0.12 * Math.max(a, b));
const totalGap = (a: number, b = a) => Math.max(25, 0.1 * Math.max(a, b));
const SRC_VERIFIED = true; // CollegeFootballData, same policy as the CFBD player packs (with margins)

export const pairKey = (a: SchoolKey, b: SchoolKey) => [a, b].sort().join("|");
const name = (k: SchoolKey) => SCHOOL[k].name;
const longDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const winner = (g: RivalryGame) => (g.hp > g.ap ? g.home : g.away);
const loser = (g: RivalryGame) => (g.hp > g.ap ? g.away : g.home);
const venue = (g: RivalryGame) => [g.venue, g.bowl ? "Postseason" : g.neutral ? "Neutral site" : ""].filter(Boolean).join(" · ");
const CAT = { rush: ["run for", "rushing yards"], rec: ["have", "receiving yards"], pass: ["throw for", "passing yards"] } as const;

/** 1. Game moment: a real game between them (scoreboard shown), higher/lower on a player's line in it. */
export function genGameMoment(pr: RivalryPair, rng: Rng): Question | null {
  const games = pr.games.filter(g => g.box && g.hp !== g.ap);
  const cands: { g: RivalryGame; school: SchoolKey; p: Perf }[] = [];
  for (const g of games) for (const [school, perfs] of Object.entries(g.box!))
    for (const p of perfs) if (p.cat === "pass" ? p.yds >= 150 : p.yds >= 60) cands.push({ g, school, p });
  if (!cands.length) return null;
  const { g, school, p } = pick(rng, cands);
  const useTD = p.td >= 2 && rng() < 0.3;
  const v = useTD ? p.td : p.yds, dir = rng() < 0.5 ? -1 : 1;
  let line: number;
  if (useTD) line = Math.max(0.5, v + dir * (rng() < 0.5 ? 0.5 : 1.5));
  else {
    const step = v >= 150 ? 25 : 10;
    line = Math.round((v * (1 + dir * (0.15 + rng() * 0.2))) / step) * step;
    if (Math.abs(line - v) < gameGap(v)) line = dir > 0 ? Math.ceil((v + gameGap(v)) / step) * step : Math.floor((v - gameGap(v)) / step) * step;
    if (line <= 0) return null;
  }
  const answer = v > line ? "over" : "under", [verb, stat] = CAT[p.cat];
  const what = useTD ? `${p.cat === "pass" ? "touchdown passes" : p.cat === "rec" ? "receiving touchdowns" : "rushing touchdowns"}` : stat;
  return {
    type: "moment", label: "Rivalry Game", verified: SRC_VERIFIED, pitted: true,
    game: { date: longDate(g.date), winner: winner(g), loser: loser(g), ws: Math.max(g.hp, g.ap), ls: Math.min(g.hp, g.ap), venue: venue(g) },
    prompt: useTD ? `In this game, did ${p.name} (${name(school)}) have more or fewer than` : `In this game, did ${p.name} (${name(school)}) ${verb} more or less than`,
    line: `${useTD ? line : fmt(line)} ${what}`, answer,
    reveal: `${answer === "over" ? "More" : "Less"}. ${p.name} had ${fmt(p.yds)} ${stat}${p.n ? ` on ${p.n} ${p.cat === "rush" ? "carries" : "catches"}` : ""} and ${p.td} TD in this game.`,
    check: { value: v, line }, sig: "gm" + g.date + p.name + p.cat + (useTD ? "td" : ""),
  };
}

/** 2. Against each other: one player per school, totals in games vs the other school (box-score era). */
export function genVsH2H(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng, boxFrom: number): Question | null {
  for (const k of shuffle(rng, ["rush", "rec"] as const)) {
    const side = (t: SchoolKey) => shuffle(rng, pr.vs.filter(v => v.school === t && v[k] >= 100));
    const A = side(a), B = side(b);
    for (const x of A) {
      const y = B.find(y => Math.abs(x[k] - y[k]) >= totalGap(x[k], y[k]));
      if (!y) continue;
      const opp = (v: VsTotal) => name(v.school === a ? b : a);
      const item = (v: VsTotal) => ({ label: `${v.name} (${v.school}) vs. ${opp(v)}`, value: v[k], school: v.school });
      const games = (v: VsTotal) => `${v.games} game${v.games > 1 ? "s" : ""}`;
      return {
        type: "h2h", label: "Against Each Other", verified: SRC_VERIFIED, flip: rng() < 0.5,
        prompt: `In ${name(a)}–${name(b)} games since ${boxFrom}, who had more ${k === "rush" ? "rushing" : "receiving"} yards against the other school?`,
        A: item(x), B: item(y), unit: k === "rush" ? "rushing yds" : "receiving yds",
        note: `${x.name}: ${fmt(x[k])} in ${games(x)}. ${y.name}: ${fmt(y[k])} in ${games(y)}.`,
        sig: "vs" + k + [x.name, y.name].sort(),
      };
    }
  }
  return null;
}

/** 3. Rank single-game performances from games between them (both schools represented). */
export function genGameRank(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const cat = rng() < 0.65 ? "rush" : "rec";
  const perfs = pr.games.filter(g => g.box).flatMap(g => Object.entries(g.box!).flatMap(([school, ps]) =>
    ps.filter(p => p.cat === cat && p.yds >= 50).map(p => ({ g, school, p }))));
  for (let t = 0; t < 8; t++) {
    const picks: typeof perfs = [];
    const ok = (x: (typeof perfs)[0]) => !picks.some(y => (y.p.name === x.p.name && y.g.season === x.g.season) || Math.abs(y.p.yds - x.p.yds) < gameGap(y.p.yds, x.p.yds));
    for (const s of shuffle(rng, [a, b])) { const f = shuffle(rng, perfs).find(x => x.school === s && ok(x)); if (f) picks.push(f) }
    for (const f of shuffle(rng, perfs)) { if (picks.length === 4) break; if (ok(f)) picks.push(f) }
    if (picks.length < 4) continue;
    return {
      type: "rank", label: "Rivalry Games", verified: SRC_VERIFIED, unit: "yds",
      prompt: `Rank these single-game ${cat === "rush" ? "rushing" : "receiving"} performances in ${name(a)}–${name(b)} games, highest first.`,
      items: picks.map(x => ({ label: `${x.p.name} (${x.school}) · ${x.g.season}${x.g.bowl ? " postseason" : ""}`, value: x.p.yds, school: x.school })),
      sig: "gr" + cat + picks.map(x => x.p.name + x.g.season).sort(),
    };
  }
  return null;
}

/** 4. Series results since 2000 (on-field): higher/lower on one school's wins over the other. */
export function genSeriesCount(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const games = pr.games.filter(g => g.season >= 2000 && g.season <= 2025 && g.hp !== g.ap);
  if (games.length < 4) return null;
  const x = rng() < 0.5 ? a : b, y = x === a ? b : a;
  const w = games.filter(g => winner(g) === x).length, l = games.length - w;
  const line = Math.max(0.5, w + (rng() < 0.5 ? -1 : 1) * (rng() < 0.6 ? 0.5 : 1.5));
  const answer = w > line ? "over" : "under";
  return {
    type: "moment", label: "Series History", verified: SRC_VERIFIED, pitted: true,
    prompt: `From 2000 through 2025, did ${name(x)} beat ${name(y)} more or fewer than`, line: `${line} times`, answer,
    reveal: `${answer === "over" ? "More" : "Fewer"}. ${name(x)} went ${w}–${l} against ${name(y)} from 2000 to 2025 (${games.length} meetings, on-field results).`,
    check: { value: w, line }, sig: "sc" + x + y,
  };
}

const gameBox = (g: RivalryGame) => ({ date: longDate(g.date), winner: winner(g), loser: loser(g), ws: Math.max(g.hp, g.ap), ls: Math.min(g.hp, g.ap), venue: venue(g) });

/** 5. One game, rank its players: "In this game, rank these players by receiving yards" (both schools represented). */
export function genGameRankSingle(pr: RivalryPair, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  for (const g of shuffle(rng, pr.games.filter(g => g.box && g.hp !== g.ap)).slice(0, 12)) {
    for (const cat of shuffle(rng, ["rec", "rush"] as const)) {
      const perfs = Object.entries(g.box!).flatMap(([school, ps]) => ps.filter(p => p.cat === cat && p.yds >= 25).map(p => ({ school, p })));
      if (!perfs.some(x => x.p.yds >= 60)) continue; // needs a real lead performance
      const picks: typeof perfs = [];
      const ok = (x: (typeof perfs)[0]) => !picks.some(y => y.p.name === x.p.name || Math.abs(y.p.yds - x.p.yds) < gameGap(y.p.yds, x.p.yds));
      for (const s of shuffle(rng, [a, b])) { const f = shuffle(rng, perfs).find(x => x.school === s && ok(x)); if (f) picks.push(f) }
      for (const f of shuffle(rng, perfs)) { if (picks.length === 4) break; if (ok(f)) picks.push(f) }
      if (picks.length < 4) continue;
      const stat = cat === "rush" ? "rushing" : "receiving";
      return {
        type: "rank", label: "Rivalry Game", verified: SRC_VERIFIED, pitted: true, unit: "yds", game: gameBox(g),
        prompt: `In this game, rank these players by ${stat} yards, highest first.`,
        items: picks.map(x => ({ label: `${x.p.name} (${x.school})`, value: x.p.yds, school: x.school })),
        sig: "gs" + g.date + cat,
      };
    }
  }
  return null;
}

/** 6. Team stat multiple choice: "What was the difference in total yards in Auburn's 48–45 win over Alabama?" */
export function genTeamDiffMC(pr: RivalryPair, rng: Rng): Question | null {
  const MIN = 20; // every option at least this far from every other (and from the true answer)
  for (const g of shuffle(rng, pr.games.filter(g => g.team && g.hp !== g.ap)).slice(0, 12)) {
    const [x, y] = Object.keys(g.team!);
    for (const [k, what] of shuffle(rng, [["total", "total yards"], ["rush", "rushing yards"]] as const)) {
      const d = g.team![x][k] - g.team![y][k];
      if (Math.abs(d) < MIN) continue; // near-even games make the flipped answer too close to call
      const truth = d; // + means x out-gained y
      const cands = shuffle(rng, [-truth, ...[30, 50, 70, 90, 110, 130].flatMap(j => [truth + j, truth - j, -truth + j, -truth - j])]);
      const opts = [truth];
      for (const c of cands) { if (opts.length === 4) break; if (Math.abs(c) >= 5 && opts.every(o => Math.abs(o - c) >= MIN)) opts.push(c) }
      if (opts.length < 4) continue;
      const label = (v: number) => `${name(v > 0 ? x : y)} +${fmt(Math.abs(v))} yards`;
      const options = opts.map(label);
      if (new Set(options).size !== 4) continue;
      const w = winner(g), l = loser(g), ws = Math.max(g.hp, g.ap), ls = Math.min(g.hp, g.ap);
      const more = d > 0 ? x : y;
      return {
        type: "mc", label: "Rivalry Game", verified: SRC_VERIFIED, pitted: true, game: gameBox(g),
        prompt: `What was the difference in ${what} in ${name(w)}'s ${ws}–${ls} win over ${name(l)}?`,
        options, answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
        reveal: `${name(more)} +${fmt(Math.abs(d))}. ${name(x)} had ${fmt(g.team![x][k])} ${what}, ${name(y)} ${fmt(g.team![y][k])}.`,
        sig: "td" + g.date + k,
      };
    }
  }
  return null;
}
