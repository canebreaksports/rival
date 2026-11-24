// Final-play and overtime wins between the two schools (data/walkoffs.json from scripts/import-walkoffs.ts).
// The owner's definition (Nov 2026), spelled out in every prompt: a game-winning score as time expired in the
// 4th quarter (Kick Six, field goal at the gun), or any overtime win.
import type { CountEntry, Question, SchoolKey, YearsBonus } from "./types";
import { shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";

export interface Walkoff { season: number; date: string; winner: SchoolKey; loser: SchoolKey; ws: number; ls: number; how: "ot" | "fg" | "td" | "ret" }
export interface WalkoffData { source: string; pairs: Record<string, { from: number; games: number; list: Walkoff[] }> }

const nm = (k: SchoolKey) => SCHOOL[k].name;
const HOW = { ot: "Overtime win", fg: "Field goal as time expired", td: "Touchdown as time expired", ret: "Return touchdown as time expired" };
const QUAL = "Counts: a game-winning score as time expired in the 4th quarter, or any overtime win.";
const pk = (a: SchoolKey, b: SchoolKey) => [a, b].sort().join("|");
const entry = (w: Walkoff): CountEntry => ({ name: `${HOW[w.how]}: ${nm(w.winner)} ${w.ws}, ${nm(w.loser)} ${w.ls}`, yards: w.ws - w.ls, season: w.season,
  label: `${w.ws}–${w.ls}${w.how === "ot" ? " (OT)" : ""}`, profile: `${HOW[w.how]}, ${w.ws}–${w.ls}` });

/** Count: which school has more final-play / overtime wins over the other? (+ Name the Years) */
export function genWalkoffCount(d: WalkoffData, a: SchoolKey, b: SchoolKey): Question | null {
  const p = d.pairs[pk(a, b)];
  if (!p || p.list.length < 2) return null;
  const of = (k: SchoolKey) => p.list.filter(w => w.winner === k).map(entry);
  return { type: "count", label: "Walk-offs", a, b, threshold: 0, verified: true, pitted: true, bonus: "years",
    prompt: `Since ${p.from}, which school has more wins over the other on the final play or in overtime? (${QUAL})`,
    A: of(a), B: of(b), sig: "wo" + p.from };
}

/** Multiple choice: how many games in the series were decided that way? (+ Name the Years) */
export function genWalkoffMC(d: WalkoffData, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const p = d.pairs[pk(a, b)];
  if (!p || !p.list.length || p.games < 6) return null;
  const n = p.list.length, opts = [n, ...shuffle(rng, [n - 2, n - 1, n + 1, n + 2, n + 3].filter(x => x >= 0)).slice(0, 3)];
  const years: YearsBonus = { prompt: `Name the ${n === 1 ? "season" : `${n} seasons`} it happened.`, a, b,
    A: p.list.filter(w => w.winner === a).map(entry), B: p.list.filter(w => w.winner === b).map(entry) };
  return { type: "mc", label: "Walk-offs", verified: true, pitted: true,
    prompt: `Of the ${p.games} ${nm(a)}–${nm(b)} games since ${p.from}, how many were won on the final play or in overtime? (${QUAL})`,
    options: opts.map(String), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
    reveal: `${n}.`, after: p.list.map(w => `${w.season} ${HOW[w.how].toLowerCase()}, ${nm(w.winner)} ${w.ws}–${w.ls}`).join(" · ") + ".",
    years, sig: "wm" + p.from } as Question;
}
