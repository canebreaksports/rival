// Question generators (spec §4). All randomness comes from the Rng argument.
import type { Dataset, Item, Player, PlayerSeason, Pos, Question, SchoolKey, StatKey } from "./types";
import { pick, shuffle, type Rng } from "./rng";
import { SCHOOL } from "./data";

type GenStat = "rush" | "scrim" | "rec" | "rushTD" | "recTD";
export const ST: Record<GenStat, [string, "yds" | "TD"]> = {
  rush: ["rushing yards", "yds"], scrim: ["yards from scrimmage", "yds"], rec: ["receiving yards", "yds"],
  rushTD: ["rushing TDs", "TD"], recTD: ["receiving TDs", "TD"],
};
const GEN_STATS = Object.keys(ST) as GenStat[];

export const fmt = (v: number) => v.toLocaleString("en-US");

/** Context shared by the generators for one matchup. */
export interface Ctx {
  rng: Rng;
  pool: PlayerSeason[];          // seasons for the pitted schools (verified-only for weekly sets)
  info: Map<string, Player>;     // name|school → player
  label: string;
}

export function makeCtx(data: Dataset, teams: SchoolKey[], rng: Rng, verifiedOnly: boolean, label = "Fresh Mix"): Ctx {
  const pool = data.players.seasons.filter(s => teams.includes(s.school) && (!verifiedOnly || s.verified));
  const info = new Map(data.players.players.map(p => [p.name + "|" + p.school, p]));
  return { rng, pool, info, label };
}

const pos = (c: Ctx, p: PlayerSeason): Pos => c.info.get(p.name + "|" + p.school)?.pos ?? "RB";
const isStar = (c: Ctx, p: PlayerSeason) => !!c.info.get(p.name + "|" + p.school)?.star;
const allVerified = (...ps: PlayerSeason[]) => ps.every(p => p.verified);
const tag = (c: Ctx, p: PlayerSeason) => `${p.name} (${pos(c, p)}) · ${p.year === "career" ? "career, " + p.school : p.year + " " + p.school}`;

function groups(pool: PlayerSeason[]) {
  const g: Record<string, PlayerSeason[]> = {};
  for (const p of pool) for (const k of GEN_STATS) if (p[k] != null) (g[(p.year === "career" ? "car" : "sea") + "|" + k] ??= []).push(p);
  return g;
}

export function genRank(c: Ctx): Question | null {
  const g = groups(c.pool);
  const keys = Object.keys(g).filter(k => new Set(g[k].map(p => p[k.split("|")[1] as GenStat])).size >= 4);
  if (!keys.length) return null;
  const key = pick(c.rng, keys), [sc, k] = key.split("|") as ["car" | "sea", GenStat];
  const picks: PlayerSeason[] = [], seen = new Set<number>();
  const add = (p: PlayerSeason) => { if (picks.length < 4 && !seen.has(p[k]!)) { seen.add(p[k]!); picks.push(p) } };
  const arr = shuffle(c.rng, g[key]), schools = [...new Set(arr.map(p => p.school))];
  if (schools.length > 1) for (const t of schools) { const p = arr.find(x => x.school === t && !seen.has(x[k]!)); if (p) add(p) } // at least one from each school
  arr.forEach(add);
  if (picks.length < 4) return null;
  return {
    type: "rank", label: c.label, verified: allVerified(...picks),
    prompt: sc === "car" ? `Rank these players by career ${ST[k][0]} (at that school), highest first.` : `Rank these seasons by ${ST[k][0]}, highest first.`,
    items: picks.map(p => ({ label: tag(c, p), value: p[k]! })), unit: ST[k][1],
    sig: "r" + key + picks.map(p => p.name + p.year).sort(),
  };
}

export function genPOU(c: Ctx): Question | null {
  const p = pick(c.rng, c.pool); if (!p) return null;
  const ks = GEN_STATS.filter(k => p[k] != null); if (!ks.length) return null;
  const k = pick(c.rng, ks), v = p[k]!, dir = c.rng() < 0.5 ? -1 : 1;
  let line: number;
  if (ST[k][1] === "TD") line = Math.max(0.5, v + dir * Math.floor(c.rng() * 3) + dir * 0.5);
  else {
    const step = v >= 1000 ? 50 : v >= 300 ? 25 : 10;
    line = Math.round((v * (1 + dir * (0.05 + c.rng() * 0.15))) / step) * step;
    if (line === v) line += dir * step;
    line = Math.max(step, line);
    if (line === v) line = v + step;
  }
  const answer = v > line ? "over" : "under";
  const school = SCHOOL[p.school].name;
  return {
    type: "moment", label: c.label, verified: p.verified,
    prompt: p.year === "career" ? `Did ${p.name} finish his ${school} career with more or less than` : `In ${p.year}, did ${p.name} (${school}) have more or less than`,
    line: `${fmt(line)} ${ST[k][0]}`, answer,
    reveal: `${answer === "over" ? "More" : "Less"}. ${p.name} had ${fmt(v)} ${ST[k][0]}${p.year === "career" ? " in his career" : " in " + p.year}.`,
    check: { value: v, line }, sig: "p" + p.name + p.year + k,
  };
}

export function genH2H(c: Ctx, teams: SchoolKey[]): Question | null {
  const g = groups(c.pool), keys = Object.keys(g).filter(k => g[k].length >= 2);
  if (!keys.length) return null;
  for (let t = 0; t < 12; t++) {
    const key = pick(c.rng, keys), [sc, k] = key.split("|") as ["car" | "sea", GenStat], arr = shuffle(c.rng, g[key]);
    const a = arr[0], b = arr.find(x => x.name !== a.name && x[k] !== a[k] && (teams.length < 2 || x.school !== a.school));
    if (!b) continue;
    return {
      type: "h2h", label: c.label, verified: allVerified(a, b), flip: c.rng() < 0.5,
      prompt: sc === "car" ? `Who had more career ${ST[k][0]}?` : `Who had more ${ST[k][0]} in a single season?`,
      A: { label: tag(c, a), value: a[k]! }, B: { label: tag(c, b), value: b[k]! }, unit: ST[k][0],
      sig: "h" + [a.name + a.year, b.name + b.year].sort() + k,
    };
  }
  return null;
}

// ---- traps (spec §4.6) ----
type PeakStat = "rush" | "scrim" | "rec";
const PEAK_STATS: PeakStat[] = ["rush", "scrim", "rec"];
const peak = (c: Ctx, p: PlayerSeason, k: PeakStat) =>
  c.pool.filter(x => x.name === p.name && x.school === p.school && x.year !== "career" && x[k] != null)
    .reduce((best, x) => (x[k]! > best[k]! ? x : best));
const isOff = (c: Ctx, p: PlayerSeason, k: PeakStat) => p.year !== "career" && p[k] != null && peak(c, p, k) !== p;

function trapNote(c: Ctx, recs: PlayerSeason[], k: PeakStat) {
  const offs = recs.filter(p => isOff(c, p, k));
  return offs.length ? "🪤 Trap: " + offs.map(p => { const b = peak(c, p, k); return `${p.name}'s best year was ${b.year} (${fmt(b[k]!)}), not ${p.year}` }).join("; ") + "." : "";
}

export function genTrapRank(c: Ctx): Question | null {
  for (const k of shuffle(c.rng, PEAK_STATS)) {
    const sea = c.pool.filter(p => p.year !== "career" && p[k] != null), offs = shuffle(c.rng, sea.filter(p => isOff(c, p, k)));
    if (offs.length < 2) continue;
    const picks: PlayerSeason[] = [], names = new Set<string>(), vals = new Set<number>();
    const add = (p: PlayerSeason) => { if (picks.length < 4 && !names.has(p.name) && !vals.has(p[k]!)) { picks.push(p); names.add(p.name); vals.add(p[k]!) } };
    offs.slice(0, 2 + Math.floor(c.rng() * 2)).forEach(add); // 2–3 off-years
    shuffle(c.rng, sea).forEach(add);                         // fill with anything else
    if (picks.length < 4) continue;
    return {
      type: "rank", label: c.label, trap: true, verified: allVerified(...picks),
      prompt: `Rank these seasons by ${ST[k][0]}, highest first.`, items: picks.map(p => ({ label: tag(c, p), value: p[k]! })),
      unit: ST[k][1], note: trapNote(c, picks, k), sig: "tr" + k + picks.map(p => p.name + p.year).sort(),
    };
  }
  return null;
}

export function genTrapPOU(c: Ctx): Question | null {
  const cands: [PlayerSeason, PeakStat][] = [];
  for (const p of c.pool) for (const k of PEAK_STATS) if (isOff(c, p, k) && peak(c, p, k)[k]! > p[k]! * 1.3) cands.push([p, k]);
  if (!cands.length) return null;
  const [p, k] = pick(c.rng, cands), b = peak(c, p, k), v = p[k]!, step = v >= 1000 ? 50 : 25;
  // the line sits 35–65% of the way from the off-year to the peak: anyone thinking of the peak says "more"
  let line = Math.round((v + (b[k]! - v) * (0.35 + c.rng() * 0.3)) / step) * step;
  if (line <= v) line = v + step;
  return {
    type: "moment", label: c.label, trap: true, verified: allVerified(p, b),
    prompt: `In ${p.year}, did ${p.name} (${SCHOOL[p.school].name}) have more or less than`, line: `${fmt(line)} ${ST[k][0]}`, answer: "under",
    reveal: `Less. ${p.name} had ${fmt(v)} ${ST[k][0]} in ${p.year}. 🪤 Trap: his big year was ${b.year} (${fmt(b[k]!)}).`,
    check: { value: v, line }, sig: "tp" + p.name + p.year + k,
  };
}

// ---- upsets (spec §4.7) ----
const bestSeason = (c: Ctx, p: PlayerSeason, k: StatKey) => {
  const s = c.pool.filter(x => x.name === p.name && x.school === p.school && x.year !== "career" && x[k] != null);
  return s.length ? Math.max(...s.map(x => x[k]!)) : null;
};
const UP: Record<string, { q: string; g: (c: Ctx, p: PlayerSeason) => number | null | undefined; ypc?: boolean }> = {
  recTD: { q: "Who had more college receiving touchdowns (at the school shown)?", g: (_, p) => p.recTD },
  rec: { q: "Who had more college receiving yards (at the school shown)?", g: (_, p) => p.rec },
  recN: { q: "Who had more college receptions (at the school shown)?", g: (_, p) => p.recN },
  rushTD: { q: "Who had more college rushing touchdowns (at the school shown)?", g: (_, p) => p.rushTD },
  ypc: { q: "Who averaged more yards per carry in college (at the school shown)?", g: (_, p) => (p.att && p.rush != null ? Math.round((p.rush / p.att) * 10) / 10 : null), ypc: true },
  peakRush: { q: "Whose best college season had more rushing yards?", g: (c, p) => bestSeason(c, p, "rush") },
  peakScrim: { q: "Whose best college season had more yards from scrimmage?", g: (c, p) => bestSeason(c, p, "scrim") },
};
const RECV = new Set(["rec", "recN", "recTD"]);

export function genUpset(c: Ctx): Question | null {
  const car = c.pool.filter(p => p.year === "career");
  const cands: { k: string; s: PlayerSeason; o: PlayerSeason; vs: number; vo: number; w: number }[] = [];
  for (const [k, u] of Object.entries(UP)) for (const s of car) if (isStar(c, s)) for (const o of car) {
    if (isStar(c, o) || o.name === s.name) continue;
    const vs = u.g(c, s), vo = u.g(c, o);
    if (vs == null || vo == null || vo <= vs) continue;
    const ps = pos(c, s), po = pos(c, o), recv = RECV.has(k);
    if (recv && po === "WR" && ps !== "WR") continue;       // a WR out-catching an RB isn't an upset
    if (!recv && (ps === "WR" || ps === "TE")) continue;     // a WR/TE "star" losing on rushing isn't one either
    if (!recv && po === "RB" && ps !== "RB") continue;       // an RB out-rushing a QB isn't an upset
    if (recv && ps === "QB") continue;                       // a QB star on receiving stats
    if (k === "ypc" && ((o.att ?? 0) < 5 || (s.att ?? 0) < 5)) continue;
    cands.push({ k, s, o, vs, vo, w: ps !== po ? 3 : 2 }); // cross-position pairs weighted highest
  }
  if (!cands.length) return null;
  let r = c.rng() * cands.reduce((a, x) => a + x.w, 0);
  const x = cands.find(x => (r -= x.w) < 0) ?? cands[0];
  const u = UP[x.k], f = (v: number) => (u.ypc ? v.toFixed(1) + " per carry" : fmt(v));
  const lab = (p: PlayerSeason) => `${p.name} (${p.school} ${pos(c, p)})`;
  const carries = (p: PlayerSeason) => (u.ypc ? ` (${p.att} carries)` : "");
  return {
    type: "h2h", label: c.label, upset: true, verified: allVerified(x.s, x.o), flip: c.rng() < 0.5,
    prompt: u.q, A: { label: lab(x.o), value: x.vo }, B: { label: lab(x.s), value: x.vs }, unit: "", ...(u.ypc ? { ypc: true } : {}),
    note: `🚨 Upset: ${x.o.name} ${f(x.vo)}${carries(x.o)} vs. ${x.s.name} ${f(x.vs)}${carries(x.s)}.`,
    sig: "u" + x.k + x.s.name + x.o.name,
  };
}

// ---- school count (spec §4.8) ----
export const COUNT_THRESHOLDS = [2500, 2750, 2800, 3000, 3250, 3500, 4000];
export function genCount(data: Dataset, a: SchoolKey, b: SchoolKey, rng: Rng, verifiedOnly: boolean): Question | null {
  const A = data.career[a], B = data.career[b];
  if (!A || !B || (verifiedOnly && !(A.verified && B.verified))) return null;
  const floor = Math.max(A.floor, B.floor);
  const cnt = (l: typeof A, t: number) => l.list.filter(x => x.yards >= t);
  // An active player below a threshold could cross it mid-week, so skip those thresholds.
  const activeYds = [...A.list, ...B.list].filter(x => x.active).map(x => x.yards);
  const ths = COUNT_THRESHOLDS.filter(t => t >= floor && activeYds.every(y => y >= t) && cnt(A, t).length + cnt(B, t).length >= 2);
  if (!ths.length) return null;
  const t = pick(rng, ths);
  return { type: "count", label: "School Count", a, b, threshold: t, A: cnt(A, t), B: cnt(B, t), verified: A.verified && B.verified, sig: "c" + a + b + t };
}

// ---- blind stat duel from player data (spec §4.9): two unnamed same-season lines, one per school ----
const DUEL: Record<"rush" | "rec", { stat: string; td: "rushTD" | "recTD"; unit: string }> = {
  rush: { stat: "Rushing season", td: "rushTD", unit: "rush yds" },
  rec: { stat: "Receiving season", td: "recTD", unit: "rec yds" },
};
export function genDuel(c: Ctx, teams: SchoolKey[]): Question | null {
  if (teams.length < 2) return null;
  const [ta, tb] = teams, cands: [PlayerSeason, PlayerSeason, "rush" | "rec"][] = [];
  for (const k of ["rush", "rec"] as const) {
    const sea = c.pool.filter(p => p.year !== "career" && (p[k] ?? 0) >= 300 && p[DUEL[k].td] != null);
    for (const a of sea) if (a.school === ta) for (const b of sea)
      if (b.school === tb && b.year === a.year && b[k] !== a[k]) cands.push([a, b, k]);
  }
  if (!cands.length) return null;
  const [a, b, k] = pick(c.rng, cands), d = DUEL[k];
  const line = (p: PlayerSeason) => ({ big: fmt(p[k]!), sm: `${d.unit} · ${p[d.td]} TD` });
  const aFirst = c.rng() < 0.5, [x, y] = aFirst ? [a, b] : [b, a]; // which school the prompt asks about
  return {
    type: "duel", label: c.label, verified: allVerified(a, b), year: a.year as number, stat: d.stat,
    aSchool: x.school, other: y.school, aName: `${x.name} (${pos(c, x)})`, bName: `${y.name} (${pos(c, y)})`,
    A: line(x), B: line(y), flip: c.rng() < 0.5, sig: "d" + k + a.year + [a.name, b.name].sort(),
  };
}

export type { Item };
