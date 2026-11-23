// Question generators (spec §4). All randomness comes from the Rng argument.
import { isNotable } from "./notable";
import type { CareerList, Dataset, Item, Player, PlayerSeason, Pos, Question, SchoolKey, StatKey } from "./types";
import { posName, profileLine } from "./profile";
import { pick, shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";

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
  seasonsOf: Map<string, PlayerSeason[]>; // name|school → that player's season rows (no career row)
  teams: SchoolKey[];
  memo: Map<string, unknown>;
  honored: Set<string>;          // name|school of award winners and Heisman top-5 finishers
  notable: (name: string, school: string) => boolean; // lib/notable.ts: higher/lower questions only on these
}

export function makeCtx(data: Dataset, teams: SchoolKey[], rng: Rng, verifiedOnly: boolean, label = "Fresh Mix"): Ctx {
  const pool = data.players.seasons.filter(s => teams.includes(s.school) && (!verifiedOnly || s.verified));
  const info = new Map(data.players.players.map(p => [p.name + "|" + p.school, p]));
  const seasonsOf = new Map<string, PlayerSeason[]>();
  for (const s of pool) if (s.year !== "career") { const k = s.name + "|" + s.school; (seasonsOf.get(k) ?? seasonsOf.set(k, []).get(k)!).push(s) }
  const honored = new Set([...(data.honors?.everWon ?? []).map(w => w.name + "|" + w.school), ...(data.honors?.heisman ?? []).filter(v => v.place <= 5).map(v => v.name + "|" + v.school)]);
  return { rng, pool, info, label, seasonsOf, memo: new Map(), teams, honored, notable: (n, k) => isNotable(data, n, k) };
}

// ---- safety margin for approximate sources ----
// CollegeFootballData totals can differ from official ones by a few yards (once by 55), so no question may hinge
// on a gap smaller than this when either value comes from it. TD counts matched exactly in cross-checks.
export const isApprox = (p: PlayerSeason) => p.source.startsWith("CollegeFootballData");
type Kind = "yds" | "count" | "ypc";
const kindOf = (k: string): Kind => (k === "ypc" ? "ypc" : /TD$/.test(k) ? "count" : k === "recN" || k === "att" ? "count" : "yds");
export function minGap(kind: Kind, a: number, b: number, approx: boolean) {
  const big = Math.max(Math.abs(a), Math.abs(b));
  // Exact sources: still no close calls (owner's rule) — yardage at least 25 yds or 5% apart, YPC 0.3, counts 1.
  if (!approx) return kind === "yds" ? Math.max(25, 0.05 * big) : kind === "ypc" ? 0.3 : kind === "count" ? 1 : 0;
  return kind === "yds" ? Math.max(50, 0.08 * big) : kind === "ypc" ? 0.5 : kind === "count" ? 1 : 0;
}
/** True when a and b differ by more than the source can blur. */
export const clear = (k: string, a: number, b: number, approx: boolean, bothNotable = false) =>
  a !== b && ((bothNotable && !approx && kindOf(k) === "yds") || Math.abs(a - b) >= minGap(kindOf(k), a, b, approx));
/** Pairwise version: the margin applies to adjacent values when either comes from an approximate source. */
const ranksClear = (k: string, ps: PlayerSeason[], val: (p: PlayerSeason) => number, c?: Ctx) => {
  const v = [...ps].sort((x, y) => val(y) - val(x));
  return v.every((x, i) => i === 0 || clear(k, val(v[i - 1]), val(x), isApprox(v[i - 1]) || isApprox(x), !!c && notablePair(c, v[i - 1], x, k)));
};

/** In a matchup (two schools), a multi-player question must include players from both. */
const bothSchools = (c: Ctx, ps: PlayerSeason[]) => c.teams.length < 2 || c.teams.every(t => ps.some(p => p.school === t));

/** Top-N leaderboard for a stat among the pool (both schools), for the "More:" list after answering. */
function leaders(c: Ctx, rows: PlayerSeason[], k: GenStat, sc: "car" | "sea", n: number) {
  const seen = new Set<string>();
  const top = [...rows].filter(p => p[k] != null).sort((x, y) => y[k]! - x[k]!).filter(p => { const id = p.name + p.year; if (seen.has(id)) return false; seen.add(id); return true }).slice(0, n);
  return { title: `Top ${top.length}: ${sc === "car" ? "career" : "single-season"} ${ST[k][0]} (${[...new Set(top.map(p => p.school))].join(", ")} players in our data)`,
    rows: top.map((p, i) => `${i + 1}. ${p.name} (${p.school}${p.year === "career" ? "" : " " + p.year}) ${fmt(p[k]!)}`) };
}

const pos = (c: Ctx, p: PlayerSeason): Pos => c.info.get(p.name + "|" + p.school)?.pos ?? "RB";
const isStar = (c: Ctx, p: PlayerSeason) => !!c.info.get(p.name + "|" + p.school)?.star;
/** Close calls are allowed only between notable players in notable seasons (owner's rule):
 *  a star, award winner or Heisman top-5 finisher, with 1,000+ yards for a season or 2,500+ for a career. */
const notableRow = (c: Ctx, p: PlayerSeason, k: string) =>
  (isStar(c, p) || c.honored.has(p.name + "|" + p.school)) && ((p[k as StatKey] ?? 0) >= (p.year === "career" ? 2500 : 1000));
const notablePair = (c: Ctx, x: PlayerSeason, y: PlayerSeason, k: string) => notableRow(c, x, k) && notableRow(c, y, k);
const allVerified = (...ps: PlayerSeason[]) => ps.every(p => p.verified);
const tag = (c: Ctx, p: PlayerSeason) => `${p.name} (${pos(c, p)}) · ${p.year === "career" ? "career, " + p.school : p.year + " " + p.school}`;

/** Comparison rows (owner, Nov 2026: "compare only notable players or seasons"): a notable player (lib/notable.ts),
 *  or a big row on its own: a season with 1,000+ yards or 10+ TDs, a career with 2,500+ yards or 25+ TDs. */
const bigRow = (p: PlayerSeason) => p.year === "career"
  ? Math.max(p.rush ?? 0, p.rec ?? 0, p.scrim ?? 0) >= 2500 || Math.max(p.rushTD ?? 0, p.recTD ?? 0) >= 25
  : Math.max(p.rush ?? 0, p.rec ?? 0, p.scrim ?? 0) >= 1000 || Math.max(p.rushTD ?? 0, p.recTD ?? 0) >= 10;
const cmpPool = (c: Ctx) => c.pool.filter(p => c.notable(p.name, p.school) || bigRow(p));

/** Values big enough to be worth asking about (no rankings of 0- and 1-TD seasons). */
export function notable(k: string, v: number, career: boolean) {
  if (/TD$/.test(k)) return v >= (career ? 5 : 3);
  return v >= (career ? 500 : 250);
}
function groups(pool: PlayerSeason[]) {
  const g: Record<string, PlayerSeason[]> = {};
  for (const p of pool) for (const k of GEN_STATS)
    if (p[k] != null && notable(k, p[k]!, p.year === "career")) (g[(p.year === "career" ? "car" : "sea") + "|" + k] ??= []).push(p);
  return g;
}

export function genRank(c: Ctx): Question | null {
  const g = groups(cmpPool(c));
  const keys = Object.keys(g).filter(k => new Set(g[k].map(p => p[k.split("|")[1] as GenStat])).size >= 4);
  if (!keys.length) return null;
  const key = pick(c.rng, keys), [sc, k] = key.split("|") as ["car" | "sea", GenStat];
  const picks: PlayerSeason[] = [], seen = new Set<number>();
  const add = (p: PlayerSeason) => { if (picks.length < 4 && !seen.has(p[k]!)) { seen.add(p[k]!); picks.push(p) } };
  const arr = shuffle(c.rng, g[key]), schools = [...new Set(arr.map(p => p.school))];
  if (schools.length > 1) for (const t of schools) { const p = arr.find(x => x.school === t && !seen.has(x[k]!)); if (p) add(p) } // at least one from each school
  arr.forEach(add);
  if (picks.length < 4 || !ranksClear(k, picks, p => p[k]!, c) || !bothSchools(c, picks)) return null;
  return {
    type: "rank", label: c.label, verified: allVerified(...picks),
    prompt: sc === "car" ? `Rank these players by career ${ST[k][0]} (at that school), highest first.` : `Rank these seasons by ${ST[k][0]}, highest first.`,
    items: picks.map(p => ({ label: tag(c, p), value: p[k]!, school: p.school })), unit: ST[k][1],
    sig: "r" + key + picks.map(p => p.name + p.year).sort(), more: leaders(c, g[key], k, sc, 8),
  };
}

export function genPOU(c: Ctx): Question | null {
  const p = pick(c.rng, c.pool.filter(x => c.notable(x.name, x.school))); if (!p) return null;
  const ks = GEN_STATS.filter(k => p[k] != null && notable(k, p[k]!, p.year === "career")); if (!ks.length) return null;
  return propFor(c, p, pick(c.rng, ks));
}

/** Higher/lower on one player's stat: line 5–20% off the true value, rounded, outside the source margin. */
function propFor(c: Ctx, p: PlayerSeason, k: GenStat): Question | null {
  const v = p[k]!, dir = c.rng() < 0.5 ? -1 : 1;
  let line: number;
  if (ST[k][1] === "TD") line = Math.max(1.5, v + dir * Math.floor(c.rng() * 3) + dir * 0.5); // never a "0.5 touchdowns" line
  else {
    const step = v >= 1000 ? 50 : v >= 300 ? 25 : 10;
    line = Math.round((v * (1 + dir * (0.05 + c.rng() * 0.15))) / step) * step;
    if (line === v) line += dir * step;
    line = Math.max(step, line);
    if (line === v) line = v + step;
    const gap = minGap("yds", v, v, isApprox(p));
    if (Math.abs(line - v) < gap) { const d = line >= v ? 1 : -1; line = d > 0 ? Math.ceil((v + gap) / step) * step : Math.floor((v - gap) / step) * step }
    if (line <= 0) return null;
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

/** Paired props (pitted): the same stat and time frame for one player from each school, asked back to back. */
export function genPropPair(c: Ctx, teams: SchoolKey[]): Question[] | null {
  if (teams.length < 2) return null;
  const g = groups(c.pool);
  const keys = shuffle(c.rng, Object.keys(g).filter(key => teams.every(t => g[key].some(p => p.school === t))));
  for (const key of keys) {
    const k = key.split("|")[1] as GenStat;
    const opts = teams.map(t => g[key].filter(p => p.school === t && c.notable(p.name, p.school))); // both players notable
    if (opts.some(o => !o.length)) continue;
    const sides = opts.map(o => pick(c.rng, o));
    const qs = sides.map(p => propFor(c, p, k));
    if (qs.some(q => !q)) continue;
    const id = "pp" + sides.map(p => p.name + p.year).join("|") + k;
    return qs.map((q, i) => ({ ...q!, sig: id + i, pair: id, pairPart: (i + 1) as 1 | 2 } as Question));
  }
  return null;
}

export function genH2H(c: Ctx, teams: SchoolKey[]): Question | null {
  const g = groups(cmpPool(c)), keys = Object.keys(g).filter(k => g[k].length >= 2);
  if (!keys.length) return null;
  for (let t = 0; t < 12; t++) {
    const key = pick(c.rng, keys), [sc, k] = key.split("|") as ["car" | "sea", GenStat], arr = shuffle(c.rng, g[key]);
    const a = arr[0], b = arr.find(x => x.name !== a.name && clear(k, x[k]!, a[k]!, isApprox(a) || isApprox(x), notablePair(c, a, x, k)) && (teams.length < 2 || x.school !== a.school));
    if (!b) continue;
    return {
      type: "h2h", label: c.label, verified: allVerified(a, b), flip: c.rng() < 0.5,
      prompt: sc === "car" ? `Who had more career ${ST[k][0]}?` : `Who had more ${ST[k][0]} in a single season?`,
      A: { label: tag(c, a), value: a[k]!, school: a.school }, B: { label: tag(c, b), value: b[k]!, school: b.school }, unit: ST[k][0],
      sig: "h" + [a.name + a.year, b.name + b.year].sort() + k, more: leaders(c, g[key], k, sc, 6),
    };
  }
  return null;
}

// ---- Mixed Rank It: four players, each with a different stat or time frame, same unit, highest first ----
// e.g. Arian Foster career total TDs · Cam Newton 2010 rushing TDs · Josh Dobbs career rushing TDs
interface Fact { p: PlayerSeason; what: string; value: number; kind: string }
function facts(c: Ctx, unit: "TD" | "yds"): Fact[] {
  const out: Fact[] = [];
  const add = (p: PlayerSeason, what: string, value: number | undefined, kind: string) => {
    if (value != null && notable(unit === "TD" ? "xTD" : "x", value, p.year === "career")) out.push({ p, what, value, kind });
  };
  for (const p of cmpPool(c)) {
    const when = p.year === "career" ? "career" : String(p.year);
    if (unit === "TD") {
      if (p.year === "career" && p.rushTD != null && p.recTD != null) add(p, "career total TDs (rushing + receiving)", p.rushTD + p.recTD, "car-tot");
      add(p, `${when} rushing TDs`, p.rushTD, when === "career" ? "car-rush" : "sea-rush");
      add(p, `${when} receiving TDs`, p.recTD, when === "career" ? "car-rec" : "sea-rec");
    } else {
      add(p, `${when} rushing yards`, p.rush, when === "career" ? "car-rush" : "sea-rush");
      add(p, `${when} receiving yards`, p.rec, when === "career" ? "car-rec" : "sea-rec");
      add(p, `${when} yards from scrimmage`, p.scrim, when === "career" ? "car-scrim" : "sea-scrim");
    }
  }
  return out;
}
/** Big enough to be famous on its own: a star or award winner with a strong number, or a huge number by anyone. */
function notableFact(c: Ctx, f: Fact) {
  const car = f.kind.startsWith("car"), td = /TDs/.test(f.what), fam = isStar(c, f.p) || c.honored.has(f.p.name + "|" + f.p.school);
  const [mid, high] = td ? (car ? [25, 35] : [10, 12]) : car ? [2500, 3000] : [1000, 1300];
  return f.value >= (fam ? mid : high);
}

/** Mixed Rank It. notableOnly ("Notables"): only famous players and big seasons, e.g. Mike Evans 2013 receiving TDs,
 *  Vince Young 2004 rushing TDs, Johnny Manziel 2012 rushing TDs, Josh Reynolds 2014 receiving TDs (owner's request, Nov 2026). */
export function genMixedRank(c: Ctx, teams: SchoolKey[], notableOnly = false): Question | null {
  const unit = c.rng() < 0.6 ? "TD" : "yds", all = shuffle(c.rng, facts(c, unit).filter(f => !notableOnly || notableFact(c, f)));
  for (let t = 0; t < 10; t++) {
    const picks: Fact[] = [];
    const big = (f: Fact) => notableOnly || ((isStar(c, f.p) || c.honored.has(f.p.name + "|" + f.p.school)) && f.value >= (f.kind.startsWith("car") ? 2500 : 1000));
    const ok = (f: Fact) => !picks.some(x => x.p.name === f.p.name || !clear(unit === "TD" ? "rushTD" : "rush", x.value, f.value, isApprox(x.p) || isApprox(f.p), big(x) && big(f)));
    for (const team of shuffle(c.rng, teams)) { const f = all.find(x => x.p.school === team && ok(x)); if (f) picks.push(f) } // both schools
    for (const f of shuffle(c.rng, all)) { if (picks.length === 4) break; if (ok(f) && !picks.some(x => x.kind === f.kind && picks.length < 3)) picks.push(f) }
    if (picks.length < 4 || new Set(picks.map(x => x.kind)).size < 3 || !bothSchools(c, picks.map(f => f.p))) continue; // ≥3 stat framings
    return {
      type: "rank", label: notableOnly ? "Notables" : c.label, verified: picks.every(f => f.p.verified), unit,
      prompt: `Rank these from highest to lowest (${unit === "TD" ? "touchdowns" : "yards"}).`,
      items: picks.map(f => ({ label: `${f.p.name} (${f.p.school} ${pos(c, f.p)}) · ${f.what}`, value: f.value, school: f.p.school })),
      sig: (notableOnly ? "nx" : "mx") + unit + picks.map(f => f.p.name + f.what).sort(),
    };
  }
  return null;
}

// ---- traps (spec §4.6) ----
type PeakStat = "rush" | "scrim" | "rec";
const PEAK_STATS: PeakStat[] = ["rush", "scrim", "rec"];
const mine = (c: Ctx, p: PlayerSeason, k: StatKey) => (c.seasonsOf.get(p.name + "|" + p.school) ?? []).filter(x => x[k] != null);
const peak = (c: Ctx, p: PlayerSeason, k: PeakStat) => mine(c, p, k).reduce((best, x) => (x[k]! > best[k]! ? x : best));
const clearPeak = (c: Ctx, p: PlayerSeason, k: PeakStat) => {
  const b = peak(c, p, k);
  return mine(c, p, k).every(x => x === b || clear(k, b[k]!, x[k]!, isApprox(b) || isApprox(x)));
};
const isOff = (c: Ctx, p: PlayerSeason, k: PeakStat) => {
  if (p.year === "career" || p[k] == null) return false;
  const key = "off|" + p.name + p.school + p.year + k;
  if (!c.memo.has(key)) c.memo.set(key, peak(c, p, k) !== p && clearPeak(c, p, k));
  return c.memo.get(key) as boolean;
};

function trapNote(c: Ctx, recs: PlayerSeason[], k: PeakStat) {
  const offs = recs.filter(p => isOff(c, p, k));
  return offs.length ? "🪤 Trap: " + offs.map(p => { const b = peak(c, p, k); return `${p.name}'s best year was ${b.year} (${fmt(b[k]!)}), not ${p.year}` }).join("; ") + "." : "";
}

export function genTrapRank(c: Ctx): Question | null {
  for (const k of shuffle(c.rng, PEAK_STATS)) {
    const sea = c.pool.filter(p => p.year !== "career" && p[k] != null && notable(k, p[k]!, false) && c.notable(p.name, p.school)), offs = shuffle(c.rng, sea.filter(p => isOff(c, p, k)));
    if (offs.length < 2) continue;
    const picks: PlayerSeason[] = [], names = new Set<string>(), vals = new Set<number>();
    const add = (p: PlayerSeason) => { if (picks.length < 4 && !names.has(p.name) && !vals.has(p[k]!)) { picks.push(p); names.add(p.name); vals.add(p[k]!) } };
    offs.slice(0, 2 + Math.floor(c.rng() * 2)).forEach(add); // 2–3 off-years
    shuffle(c.rng, sea).forEach(add);                         // fill with anything else
    if (picks.length < 4 || !ranksClear(k, picks, p => p[k]!, c) || !bothSchools(c, picks)) continue;
    return {
      type: "rank", label: c.label, trap: true, verified: allVerified(...picks),
      prompt: `Rank these seasons by ${ST[k][0]}, highest first.`, items: picks.map(p => ({ label: tag(c, p), value: p[k]!, school: p.school })),
      unit: ST[k][1], note: trapNote(c, picks, k), sig: "tr" + k + picks.map(p => p.name + p.year).sort(), more: leaders(c, sea, k, "sea", 8),
    };
  }
  return null;
}

export function genTrapPOU(c: Ctx): Question | null {
  const cands: [PlayerSeason, PeakStat][] = [];
  for (const p of c.pool) for (const k of PEAK_STATS) if (notable(k, p[k] ?? 0, false) && isOff(c, p, k) && peak(c, p, k)[k]! > p[k]! * 1.3) cands.push([p, k]);
  if (!cands.length) return null;
  const [p, k] = pick(c.rng, cands), b = peak(c, p, k), v = p[k]!, step = v >= 1000 ? 50 : 25;
  // the line sits 35–65% of the way from the off-year to the peak: anyone thinking of the peak says "more"
  let line = Math.round((v + (b[k]! - v) * (0.35 + c.rng() * 0.3)) / step) * step;
  if (line <= v) line = v + step;
  if (!clear(k, line, v, isApprox(p))) line = v + Math.ceil(minGap("yds", v, v, true) / step) * step;
  if (line >= b[k]!) return null;
  return {
    type: "moment", label: c.label, trap: true, verified: allVerified(p, b),
    prompt: `In ${p.year}, did ${p.name} (${SCHOOL[p.school].name}) have more or less than`, line: `${fmt(line)} ${ST[k][0]}`, answer: "under",
    reveal: `Less. ${p.name} had ${fmt(v)} ${ST[k][0]} in ${p.year}. 🪤 Trap: his big year was ${b.year} (${fmt(b[k]!)}).`,
    check: { value: v, line }, sig: "tp" + p.name + p.year + k,
  };
}

// ---- upsets (spec §4.7) ----
const bestSeason = (c: Ctx, p: PlayerSeason, k: StatKey) => {
  const s = mine(c, p, k);
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
  // famous: a star, award winner or Heisman finalist; the winner must be lesser-known (not famous) or play another position
  const famous = (p: PlayerSeason) => isStar(c, p) || c.honored.has(p.name + "|" + p.school);
  for (const [k, u] of Object.entries(UP)) for (const s of car) if (famous(s)) for (const o of car) {
    if (o.name === s.name || (c.teams.length > 1 && o.school === s.school) || (famous(o) && pos(c, o) === pos(c, s))) continue;
    const vs = u.g(c, s), vo = u.g(c, o);
    if (vs == null || vo == null || vo <= vs || !clear(k === "peakRush" || k === "peakScrim" ? "rush" : k, vo, vs, isApprox(s) || isApprox(o))) continue;
    const ps = pos(c, s), po = pos(c, o), recv = RECV.has(k);
    if (recv && po === "WR" && ps !== "WR") continue;       // a WR out-catching an RB isn't an upset
    if (!recv && (ps === "WR" || ps === "TE")) continue;     // a WR/TE "star" losing on rushing isn't one either
    if (!recv && po === "RB" && ps !== "RB") continue;       // an RB out-rushing a QB isn't an upset
    if (recv && ps === "QB") continue;                       // a QB star on receiving stats
    // averages only between real samples: both players 100+ carries (owner's rule: no small sample vs large)
    if (k === "ypc" && ((o.att ?? 0) < 100 || (s.att ?? 0) < 100)) continue;
    if (k === "recN" ? vo < 50 : k !== "ypc" && !notable(k, vo, !k.startsWith("peak"))) continue; // no "1 TD vs 0" upsets: the winner's number has to mean something
    cands.push({ k, s, o, vs, vo, w: ps !== po ? (famous(o) ? 2 : 5) : 2 }); // out-of-position, lesser-known winners first (the Lutzenkirchen kind)
  }
  if (!cands.length) return null;
  let r = c.rng() * cands.reduce((a, x) => a + x.w, 0);
  const x = cands.find(x => (r -= x.w) < 0) ?? cands[0];
  const u = UP[x.k], f = (v: number) => (u.ypc ? v.toFixed(1) + " per carry" : fmt(v));
  const lab = (p: PlayerSeason) => `${p.name} (${p.school} ${pos(c, p)})`;
  const carries = (p: PlayerSeason) => (u.ypc ? ` (${p.att} carries)` : "");
  return {
    type: "h2h", label: c.label, upset: true, verified: allVerified(x.s, x.o), flip: c.rng() < 0.5,
    prompt: u.q, A: { label: lab(x.o), value: x.vo, school: x.o.school }, B: { label: lab(x.s), value: x.vs, school: x.s.school }, unit: "", ...(u.ypc ? { ypc: true } : {}),
    note: `🚨 Upset: ${x.o.name} ${f(x.vo)}${carries(x.o)} vs. ${x.s.name} ${f(x.vs)}${carries(x.s)}.`,
    sig: "u" + x.k + x.s.name + x.o.name,
  };
}

// ---- school count (spec §4.8) ----
export const COUNT_THRESHOLDS = [2000, 2250, 2500, 2750, 2800, 3000, 3250, 3500, 4000]; // each only used at or above both schools' floors
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
  const prof = (k: SchoolKey) => (x: CareerList["list"][0]) => {
    const pl = data.players.players.find(p => p.school === k && p.name === x.name);
    const car = data.players.seasons.find(s => s.school === k && s.name === x.name && s.year === "career" && s.verified);
    const yrs = data.players.seasons.filter(s => s.school === k && s.name === x.name && typeof s.year === "number" && s.verified).map(s => s.year as number);
    const rank = data.career[k].list.findIndex(y => y.name === x.name) + 1;
    return { ...x, profile: profileLine(posName(pl?.pos), yrs.length && `${SCHOOL[k].name} ${Math.min(...yrs)}–${Math.max(...yrs)}`,
      rank > 0 && `No. ${rank} on ${SCHOOL[k].name}'s career rushing list`,
      car?.rushTD != null && `${car.rushTD} career rushing TDs`, x.active && "still active") };
  };
  return { type: "count", label: "School Count", a, b, threshold: t, A: cnt(A, t).map(prof(a)), B: cnt(B, t).map(prof(b)), verified: A.verified && B.verified, sig: "c" + a + b + t };
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
    const sea = cmpPool(c).filter(p => p.year !== "career" && (p[k] ?? 0) >= 300 && p[DUEL[k].td] != null);
    for (const a of sea) if (a.school === ta) for (const b of sea)
      if (b.school === tb && b.year === a.year && clear(k, a[k]!, b[k]!, isApprox(a) || isApprox(b), notablePair(c, a, b, k))) cands.push([a, b, k]);
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
