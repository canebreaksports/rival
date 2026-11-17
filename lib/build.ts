// Set building (spec §6): candidate pool, caps, weekly seeding, plus Coach free-play builders.
import type { CuratedItem, Dataset, FrozenSet, Game, Question, QType, SchoolKey } from "./types";
import { pick, seededRng, shuffle, type Rng } from "./rng";
import { PROGRAM_STATS, SCHOOL, programValue } from "./data";
import { genCount, genDuel, genMixedRank, genH2H, genPOU, genRank, genTrapPOU, genTrapRank, genUpset, makeCtx } from "./generators";

/** Bump when a change alters generated output. Frozen sets record the version that built them. */
export const ENGINE_VERSION = 5; // v5: pitted sets only use questions involving both schools (v4: deeper career lists)
export const WEEKLY_N = 10;

export interface BuildOpts { verifiedOnly: boolean }

export const findMatchup = (data: Dataset, a: SchoolKey, b: SchoolKey) =>
  data.curated.matchups.find(m => (m.a === a && m.b === b) || (m.a === b && m.b === a));

export function programQs(data: Dataset, a: SchoolKey, b: SchoolKey, o: BuildOpts): Question[] {
  const out: Question[] = [];
  for (const s of PROGRAM_STATS) {
    const A = programValue(data, a, s.key, o.verifiedOnly), B = programValue(data, b, s.key, o.verifiedOnly);
    if (!A || !B || (A.value === 0 && B.value === 0)) continue;
    out.push({ type: "prog", label: `Program Pit · ${SCHOOL[a].name} vs ${SCHOOL[b].name}`, a, b, prompt: s.prompt,
      values: [A.value, B.value], verified: A.verified && B.verified, sig: "g" + s.key });
  }
  return out;
}

/** Converts curated items into questions. `pair` gives school context for duels/crossovers. */
export function curatedQs(items: CuratedItem[], label: string, rng: Rng, o: BuildOpts, pair?: [SchoolKey, SchoolKey]): Question[] {
  const out: Question[] = [];
  items.forEach((it, i) => {
    if (o.verifiedOnly && !it.verified) return;
    const sig = "k" + label + i, base = { label, verified: it.verified, sig };
    switch (it.type) {
      case "moment": {
        const game = it.game ? { ...it.game, loser: pair ? (it.game.winner === pair[0] ? pair[1] : pair[0]) : it.game.winner } : undefined;
        out.push({ ...base, type: "moment", prompt: it.prompt, line: it.line, answer: it.answer, reveal: it.reveal, ...(game ? { game } : {}) });
        break;
      }
      case "rank":
        out.push({ ...base, type: "rank", prompt: it.prompt, items: it.items, unit: it.unit, ...(it.trap ? { trap: true, note: it.note } : {}) });
        break;
      case "h2h":
        out.push({ ...base, type: "h2h", prompt: it.prompt, A: it.A, B: it.B, unit: it.unit, flip: rng() < 0.5 });
        break;
      case "duel":
        if (!pair) return;
        out.push({ ...base, type: "duel", year: it.year, stat: it.stat, aSchool: it.aSchool, other: it.aSchool === pair[0] ? pair[1] : pair[0],
          aName: it.aName, bName: it.bName, A: it.A, B: it.B, flip: rng() < 0.5 });
        break;
      case "cross":
        if (!pair) return;
        out.push({ ...base, type: "cross", a: pair[0], b: pair[1], prompt: it.prompt, options: it.options, answer: it.answer, reveal: it.reveal,
          order: shuffle(rng, it.options.map((_, j) => j)) });
        break;
    }
  });
  return out;
}

const teamQs = (data: Dataset, k: SchoolKey, rng: Rng, o: BuildOpts) =>
  data.curated.teamPacks[k] ? curatedQs(data.curated.teamPacks[k], SCHOOL[k].name, rng, o) : [];

/** Generated player questions per set. Program comparisons only fill gaps. */
export const PLAYER_QS = 7;

/** About n generated player questions: ≤1 upset (attempted first 70% of the time), ≤1 trap (allowed 75% of the time). */
export function generate(data: Dataset, teams: SchoolKey[], n: number, rng: Rng, o: BuildOpts): Question[] {
  const c = makeCtx(data, teams, rng, o.verifiedOnly);
  if (c.pool.length < 4) return [];
  // weighted toward the player formats: props, head-to-heads, rank, duels; traps limited below
  // Pitted (two schools): only formats that involve both. Single-player props stay in Team Deep Dive.
  const gens = teams.length > 1
    ? [() => genRank(c), () => genH2H(c, teams), () => genH2H(c, teams), () => genDuel(c, teams), () => genMixedRank(c, teams), () => genMixedRank(c, teams), () => genTrapRank(c)]
    : [() => genRank(c), () => genPOU(c), () => genPOU(c), () => genH2H(c, teams), () => genTrapRank(c), () => genTrapPOU(c)];
  const out: Question[] = [], sigs = new Set<string>();
  if (rng() < 0.7) { const u = genUpset(c); if (u) { sigs.add(u.sig); out.push(u) } }
  let trapped = rng() < 0.25;
  for (let t = 0; t < n * 20 && out.length < n; t++) { // pitted formats fail often (both-schools rule), so try harder
    const q = pick(rng, gens)();
    if (!q || sigs.has(q.sig) || (q.trap && trapped)) continue;
    if (q.trap) trapped = true;
    sigs.add(q.sig); out.push(q);
  }
  return out;
}

/** Per-set caps (spec §2). Trap and upset limits apply across generated and curated questions. */
export function caps(progCap: number): Record<QType, number> {
  return { moment: 4, prog: progCap, h2h: 3, rank: 2, count: 1, duel: 2, cross: 1 };
}

export function hasPlayerData(data: Dataset, k: SchoolKey, o: BuildOpts) {
  return data.players.seasons.some(s => s.school === k && (!o.verifiedOnly || s.verified));
}

/** School an answer item belongs to: its tag, or a school code in its label ("(AUB)", "· 2015 LSU"). */
function itemSchool(it: { label: string; school?: SchoolKey }, a: SchoolKey, b: SchoolKey): SchoolKey | null {
  if (it.school) return it.school;
  const hit = [a, b].filter(k => new RegExp(`\\b${k.replace("&", "\\&")}\\b`).test(it.label));
  return hit.length === 1 ? hit[0] : null;
}

/** Pitted mode: true when a question involves both schools (spec: "only questions involving both schools or programs"). */
export function involvesBoth(q: Question, a: SchoolKey, b: SchoolKey): boolean {
  const both = (schools: (SchoolKey | null)[]) => schools.includes(a) && schools.includes(b);
  switch (q.type) {
    case "prog": case "count": case "duel": case "cross": return true;
    case "moment": return !q.check; // curated matchup moments/series facts; generated single-player props are not
    case "h2h": return both([itemSchool(q.A, a, b), itemSchool(q.B, a, b)]);
    case "rank": return both(q.items.map(x => itemSchool(x, a, b)));
  }
}

export function buildRound(data: Dataset, a: SchoolKey, b: SchoolKey, rng: Rng, o: BuildOpts): Question[] {
  const m = findMatchup(data, a, b);
  const gen = generate(data, [a, b], PLAYER_QS, rng, o);
  const cq = genCount(data, a, b, rng, o.verifiedOnly);
  if (cq && rng() < 0.6) gen.splice(gen.length ? gen.length - 1 : 0, 1, cq);
  const rest = shuffle(rng, [
    ...programQs(data, a, b, o),
    ...(m ? curatedQs(m.items, m.name, rng, o, [m.a, m.b]) : []),
  ]); // team packs are single-school: Team Deep Dive only
  // Player stats lead. Program comparisons are capped at 2, or 4 while a school still has no player pack.
  const cap = caps(hasPlayerData(data, a, o) && hasPlayerData(data, b, o) ? 2 : 4);
  const used: Partial<Record<QType, number>> = {}, out: Question[] = [];
  let traps = 0, upsets = 0;
  for (const q of [...gen, ...rest]) {
    if (out.length >= WEEKLY_N) break;
    if (!involvesBoth(q, a, b)) continue;
    if ((used[q.type] ?? 0) >= cap[q.type]) continue;
    if (q.trap && traps >= 1) continue;
    if (q.upset && upsets >= 1) continue;
    used[q.type] = (used[q.type] ?? 0) + 1;
    if (q.trap) traps++;
    if (q.upset) upsets++;
    out.push(q);
  }
  return shuffle(rng, out);
}

// ---- weekly sets ----
export const weekKey = (g: Game) => `rival:${g.date}:${g.away}@${g.home}`;
export const weekSlug = (g: Game) => `${g.date}-${g.away}-at-${g.home}`.toLowerCase();

export function weeklySet(data: Dataset, g: Game): FrozenSet {
  const key = weekKey(g);
  const questions = buildRound(data, g.away, g.home, seededRng(key), { verifiedOnly: true }).slice(0, WEEKLY_N);
  return { key, slug: weekSlug(g), game: g, generatedAt: new Date().toISOString(), engine: ENGINE_VERSION, questions };
}

// ---- Coach free play (unverified content allowed, flagged in the UI) ----
const FREE: BuildOpts = { verifiedOnly: false };
export const freeRound = (data: Dataset, a: SchoolKey, b: SchoolKey) => buildRound(data, a, b, Math.random, FREE);
export function freeDive(data: Dataset, k: SchoolKey): Question[] {
  const fromMatchups = data.curated.matchups.filter(m => m.a === k || m.b === k)
    .flatMap(m => curatedQs(m.items.filter(i => i.type === "rank" || i.type === "h2h"), m.name, Math.random, FREE));
  return shuffle(Math.random, [...teamQs(data, k, Math.random, FREE), ...fromMatchups, ...generate(data, [k], 5, Math.random, FREE)]).slice(0, WEEKLY_N);
}
export function freeMix(data: Dataset): Question[] {
  const pool = shuffle(Math.random, data.curated.matchups.flatMap(m => curatedQs(m.items, m.name, Math.random, FREE, [m.a, m.b]))).slice(0, 7);
  for (const m of shuffle(Math.random, data.curated.matchups).slice(0, 3)) { const p = shuffle(Math.random, programQs(data, m.a, m.b, FREE))[0]; if (p) pool.push(p) }
  return shuffle(Math.random, pool).slice(0, WEEKLY_N);
}
