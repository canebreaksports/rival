// Set building (spec §6): candidate pool, caps, weekly seeding, plus Coach free-play builders.
import type { CuratedItem, Dataset, FrozenSet, Game, Question, QType, SchoolKey } from "./types";
import { pick, seededRng, shuffle, type Rng } from "./rng";
import { genCareerRecRank } from "./notable-gen";
import overrides from "@/data/overrides.json";
import { genWalkoffCount, genWalkoffMC } from "./walkoff-gen";
import { genTopSeasons, genTopCareer, genSecTop10, type CareerLists } from "./fillin-gen";
import { genRankedMC, genRankedWinsMC } from "./ranks-gen";
import { genOutgainedMC, genQuietStarMC, genBigDayMC, type RankLookup } from "./twist-gen";
import { PROGRAM_STATS, SCHOOL, programValue } from "./data";
import { genGameCount, genSeasonCount, genVsLeaderMC } from "./trend-gen";
import { genAwardCount, genAwardMC, genDraftCount, genDraftMC, genHeismanCount, genHeismanMC, genPeerDraftMC, genPeerAwardMC, genHeismanVsRivalRank } from "./honors-gen";
import { genGameMoment, genGameRank, genLongestGameMoment, genLongestSeriesMC, genSeriesCount, genTeamDiffMC, genVsH2H, pairKey, genStreakMC, genMarginMC, genHighScoreMC, genGameStoryMC } from "./rivalry-gen";
import { genCount, genDuel, genMixedRank, genPropPair, genH2H, genPOU, genRank, genTrapPOU, genTrapRank, genUpset, makeCtx } from "./generators";

/** Bump when a change alters generated output. Frozen sets record the version that built them. */
export const ENGINE_VERSION = 57; // v57: review cards in play order; no award list in prompts; Beanie Wells; // v56: two-part reveals (after the bonus); round 2 swaps; // v55: pinned questions; // v54: owner review round: margin/high-score QB and year bonuses, no Heisman winners in hm, wider TD/award windows, curated swaps; // v53: 2006 Michigan-Ohio State; a random 5 of 9 weekly types per set; // v52: marquee curated questions for 13 rivalry-week matchups; Central-time dates in rank/walk-off data; // v51: no generated twist when a curated one exists; // v50: curated 2014 Iron Bowl twist; 6 curated max; // v49: out-gained twist first; historic day skips curated players; // v48: story/twist/historic day up front, rankings in setups; // v47: quiet-star twist needs a real workload; // v46: twist questions (out-gained winner, star's quiet day); // v45: game story prefers famous games and rushing; // v44: game story MC + name the players; // v43: curated Heisman-vs-rival (Iron Bowl), passing QBs out of rushing rankings; // v42: Heisman-vs-rival allows 3 contenders; // v41: Heisman-vs-rival guaranteed when available; // v40: Heisman finalists vs. the rival Rank It; // v39: running QB = 1,200+ career rushing yards; // v38: QB vs QB rushing upsets only between two running QBs; // v37: no QB-vs-QB rushing upsets; // v36: highest-scoring game MC; an upset every week; award winners count as famous; // v35: one combined top-10 fill-in per set; rankings first in the MC rotation; // v34: vs-the-field only via the MC rotation; // v33: TD-season counts, ranked-wins MC, guaranteed MC rotation; // v32: vs-the-field MC (draft, awards); // v31: AP-ranked games MC; // v30: MC with a Name Them bonus (2014 Iron Bowl 100-yard receivers); // v29: career ranking bonus: complete the combined top 10; // v28: SEC record-book top 10 fill-in for SEC vs SEC; // v27: series MC (longest streak / largest margin) every week, mc cap 3; // v26: no total-yards difference MC; // v25: no random single-game higher/lower; upsets need a real number; // v24: comparisons only on notable players or big seasons; // v23: no 'top N against each other' fill-ins; // v22: two fill-ins per set (+ combined career top 10), tighter game lines, rivalry week non-SEC schools; // v21: notable also = school top-10 single seasons + owner list (McCluster); // v20: Name Them by default, years only for walk-offs; bonus answers hidden until the bonus ends; // v19: fill-in questions (combined top 10 seasons, top 5 vs each other), ⓘ award explainers; // v18: higher/lower only on notable players (lib/notable.ts); // v17: 10 questions in every set (bigger generated pool, second fill pass); // v16: walk-offs (final play or OT), a record-book career ranking every week; v15: Notables Rank It; // v15: Notables Rank It (career receiving from record books, notable mixed seasons); v14: both schools get an edge. // v13: longest-play questions, one per kind, YPC only 100+ carries, Saban/Iron Bowl curated (v12: close calls)
export const WEEKLY_N = 10;

export interface BuildOpts { verifiedOnly: boolean; skip?: Set<string>; pin?: string[] } // skip: owner-rejected question signatures; pin: always include

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
        out.push({ ...base, type: "rank", prompt: it.prompt, items: it.items, unit: it.unit, ...(it.trap ? { trap: true } : {}), ...(it.note ? { note: it.note } : {}), ...(it.names ? { names: it.names } : {}) });
        break;
      case "h2h":
        out.push({ ...base, type: "h2h", prompt: it.prompt, A: it.A, B: it.B, unit: it.unit, flip: rng() < 0.5, ...(it.note ? { note: it.note } : {}), ...(it.upset ? { upset: true } : {}) });
        break;
      case "duel":
        if (!pair) return;
        out.push({ ...base, type: "duel", year: it.year, stat: it.stat, aSchool: it.aSchool, other: it.aSchool === pair[0] ? pair[1] : pair[0],
          aName: it.aName, bName: it.bName, A: it.A, B: it.B, flip: rng() < 0.5 });
        break;
      case "mc": {
        const game = it.game && pair ? { ...it.game, loser: it.game.winner === pair[0] ? pair[1] : pair[0] } : undefined;
        out.push({ ...base, type: "mc", pitted: true, prompt: it.prompt, options: it.options, answer: it.answer, reveal: it.reveal,
          order: shuffle(rng, it.options.map((_, j) => j)), ...(game ? { game } : {}), ...(it.years ? { years: it.years } : {}), ...(it.names ? { names: it.names } : {}), ...(it.after ? { after: it.after } : {}) });
        break;
      }
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
export const PLAYER_QS = 18; // up to a full set from generated questions; caps and the pitted rule still apply

/** About n generated player questions: ≤1 upset (attempted first 70% of the time), ≤1 trap (allowed 75% of the time). */
// Every "since <year>" count question a matchup can produce, enumerated once per matchup with a fixed seed
// (so it doesn't depend on, or consume, the set's own random stream) and cached.
const CANDS = new WeakMap<Dataset, Map<string, Question[]>>();
export function countCandidates(data: Dataset, a: SchoolKey, b: SchoolKey): Question[] {
  let m = CANDS.get(data); if (!m) CANDS.set(data, (m = new Map()));
  const key = a + "@" + b, hit = m.get(key); if (hit) return hit;
  const rng = seededRng("cands:" + key), rv = data.rivalry?.pairs[pairKey(a, b)];
  const fams: (() => Question | null)[] = [
    () => (data.leaders ? genSeasonCount(data.leaders, a, b, rng) : null),
    () => (rv ? genGameCount(rv, a, b, rng, data.leaders) : null),
    () => (data.draft ? genDraftCount(data.draft, a, b, rng) : null),
    () => (data.honors ? genAwardCount(data.honors, a, b, rng) : null),
    () => (data.honors ? genHeismanCount(data.honors, a, b, rng) : null),
    () => (data.walkoffs ? genWalkoffCount(data.walkoffs, a, b) : null),
  ];
  const out: Question[] = [], seen = new Set<string>();
  for (const f of fams) for (let t = 0; t < 60; t++) {
    const q = f();
    if (q && q.type === "count" && !seen.has(q.sig)) { seen.add(q.sig); out.push(q) }
  }
  out.sort((x, y) => (x.sig < y.sig ? -1 : 1)); // stable order, whatever order the sampling found them in
  m.set(key, out);
  return out;
}

export function generate(data: Dataset, teams: SchoolKey[], n: number, rng: Rng, o: BuildOpts): Question[] {
  const c = makeCtx(data, teams, rng, o.verifiedOnly);
  if (c.pool.length < 4) return [];
  // Pitted (two schools): only formats that involve both, incl. paired props (one player per school, back to back).
  // Single-player props and trap props stay in Team Deep Dive.
  type Gen = () => Question | Question[] | null;
  const out: Question[] = [], sigs = new Set<string>();
  const gens: Gen[] = teams.length > 1
    ? [() => genRank(c), () => genH2H(c, teams), () => genH2H(c, teams), () => genDuel(c, teams), () => genMixedRank(c, teams), () => genMixedRank(c, teams),
       () => genTrapRank(c), () => genPropPair(c, teams), () => genMixedRank(c, teams, true), () => genMixedRank(c, teams, true),
]
    : [() => genRank(c), () => genPOU(c), () => genPOU(c), () => genH2H(c, teams), () => genTrapRank(c), () => genTrapPOU(c)];
  // Rivalry questions: games the two schools played against each other (weighted up: the heart of pitted mode)
  const rv = teams.length > 1 ? data.rivalry?.pairs[pairKey(teams[0], teams[1])] : undefined;
  if (rv) {
    const [a, b] = teams, from = data.rivalry!.boxFrom;
    const gm = () => genGameMoment(rv, rng, c.notable), vs = () => genVsH2H(rv, a, b, rng, from), gr = () => genGameRank(rv, a, b, rng);
    const td = () => genTeamDiffMC(rv, rng); // (single-game Rank It removed at the owner's request, Nov 2026)
    void gm; // random single-game higher/lower dropped at the owner's request (Nov 2026)
    void td; // "difference in total yards" multiple choice dropped: too obscure (owner, Nov 2026)
    gens.push(vs, vs, vs, gr, gr, () => genSeriesCount(rv, a, b, rng),
      () => genLongestSeriesMC(rv, a, b, rng), () => genLongestGameMoment(rv, rng));
  }
  if (teams.length > 1) { // honors multiple choice: drafted highest, award winner, best Heisman finish
    const [a, b] = teams, pl = data.players.players.map(p => ({ name: p.name, school: p.school, pos: p.pos, star: p.star }));
    const draftMC = rng() < 0.3; // the NFL draft is a side dish: the "drafted highest" question shows up now and then (owner's call, Nov 2026)
    if (data.draft && draftMC) gens.push(() => (out.some(q => q.sig.startsWith("dc")) ? null : genDraftMC(data.draft!, a, b, rng)));
    if (data.honors) gens.push(() => genAwardMC(data.honors!, a, b, rng, pl), () => genHeismanMC(data.honors!, a, b, rng));
    // (Heisman seasons vs. the rival is a guaranteed weekly question below)
    if (data.walkoffs) gens.push(() => genWalkoffMC(data.walkoffs!, a, b, rng));
    if (data.gameRanks) { const g = () => genRankedMC(data.gameRanks!, rv, a, b, rng); gens.push(g, g, g) } // AP rankings at game time (owner, Nov 2026)
    // vs. other programs (draft, awards) come only from the weekly multiple-choice rotation below, so they don't crowd sets
  }
  // Pinned questions (owner reviewed them; data/overrides.json "pin"): rebuilt by their generator and always included
  if (teams.length > 1 && o.pin?.length) {
    const [x, y] = teams, pr = data.rivalry?.pairs[pairKey(x, y)];
    const by: Record<string, () => Question | null> = {
      mm: () => (pr ? genMarginMC(pr, x, y, rng) : null), mh: () => (pr ? genHighScoreMC(pr, x, y, rng) : null), ms: () => (pr ? genStreakMC(pr, x, y, rng) : null),
      ac: () => (data.honors ? genAwardCount(data.honors, x, y, rng) : null), hc: () => (data.honors ? genHeismanCount(data.honors, x, y, rng) : null),
    };
    for (const pin of o.pin) {
      const f = by[pin.slice(0, 2)]; if (!f || sigs.has(pin)) continue;
      for (let t = 0; t < 80; t++) { const q = f(); if (q?.sig === pin) { sigs.add(q.sig); out.push(q); break } }
    }
  }
  // Weekly "since <year>" count questions come first. Each fan base gets an advantage: one count where the away
  // school leads and one where the home school leads, from different question families (owner's call, Nov 2026).
  if (teams.length > 1) {
    const [a, b] = teams, rv0 = data.rivalry?.pairs[pairKey(a, b)];
    const cands = countCandidates(data, a, b).map(q => structuredClone(q)); // copies: bonus gets set on the chosen ones
    const lead = (q: Question) => (q.type !== "count" ? 0 : Math.sign(q.A.length - q.B.length));
    const aLead = shuffle(rng, cands.filter(q => lead(q) > 0)), bLead = shuffle(rng, cands.filter(q => lead(q) < 0));
    const chosen: Question[] = [];
    // College stats first: the NFL draft only supplies an edge when no college-only pairing exists (owner's call, Nov 2026)
    let qa: Question | undefined, qb: Question | undefined;
    const isDraft = (q: Question) => questionKind(q) === "dc";
    for (const draftOk of [false, true]) {
      if (qa) break;
      for (const x of aLead) {
        const y = bLead.find(q => questionKind(q) !== questionKind(x) && (draftOk || (!isDraft(x) && !isDraft(q))));
        if (y) { qa = x; qb = y; break }
      }
    }
    if (!qa) { qa = aLead[0]; qb = bLead[0] }
    if (qa && qb && questionKind(qa) !== questionKind(qb)) chosen.push(...shuffle(rng, [qa, qb]));
    else { // one school leads everything this week: best available, plus the leader-vs-the-other multiple choice
      const one = [qa, qb, ...shuffle(rng, cands)].find(q => q && !isDraft(q)) ?? qa ?? qb;
      if (one) chosen.push(one);
      const mc = rv0 ? genVsLeaderMC(rv0, a, b, rng) : null;
      if (mc) chosen.push(mc);
      else { const two = [...aLead, ...bLead, ...cands].find(q => one && questionKind(q) !== questionKind(one)); if (two) chosen.push(two) }
    }
    for (const q of chosen.slice(0, 2)) {
      if (sigs.has(q.sig)) continue;
      if (q.type === "count" && [...q.A, ...q.B].every(x => x.season)) {
        const r = rng(); // always drawn, so the rest of the set doesn't shift
        // Name the players by default (owner, Nov 2026: "name more players than years"). Years only where the year IS the
        // answer and there's no player to name: walk-offs (and curated items like Saban vs 9-win Auburn).
        void r; q.bonus = q.sig.startsWith("wo") ? "years" : "names";
      }
      sigs.add(q.sig); out.push(q);
    }
  }
  // Weekly question types (owner, Nov 2026: "all sets don't need the same type of questions"): every set gets the two edges
  // above; then a seeded random 5 of these 9 types, so matchups in the same week feel different. Each game-based type skips
  // games an earlier one used; AP ranks at game time appear in the setups.
  const SLOTS = 5;
  if (teams.length > 1) {
    const [x, y] = teams, pr = data.rivalry?.pairs[pairKey(x, y)], k = [x, y].sort().join("|");
    const gr = data.gameRanks?.pairs[k]?.games, rank: RankLookup = (date, s) => gr?.find(g => g.date === date)?.ranks[s];
    const used = new Set<string>();
    const add = (q: Question | null) => { if (!q || sigs.has(q.sig)) return false; sigs.add(q.sig); out.push(q); const d = q.sig.match(/\d{4}-\d{2}-\d{2}/)?.[0]; if (d) used.add(d); return true };
    const norm = (n: string) => n.toLowerCase().replace(/['’.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
    const season = (n: string, kk: SchoolKey, yr: number) => data.players.seasons.find(p => p.school === kk && p.year === yr && norm(p.name) === norm(n));
    const featured = JSON.stringify(findMatchup(data, x, y)?.items ?? []);
    // running QB: 1,200+ career rushing yards at the school (player packs), or on the school's career rushing top 10 (record book)
    const runner = (n: string, kk: SchoolKey) => (data.players.seasons.find(p => p.year === "career" && p.school === kk && norm(p.name) === norm(n))?.rush ?? 0) >= 1200
      || !!data.career[kk]?.list.some(e => norm(e.name) === norm(n));
    const first = (fs: (() => Question | null)[]) => { for (const f of fs) { const q = f(); if (q && !sigs.has(q.sig)) return q } return null };
    const slots: (() => Question | null)[] = [
      () => (pr ? genGameStoryMC(pr, x, y, rng, { walkoffs: data.walkoffs?.pairs[k]?.list, ranks: gr }) : null),          // game story
      () => (!pr || featured.includes("🔄 Twist") ? null : first([() => genOutgainedMC(pr, x, y, rng, rank, used),        // twist (skipped when a
        () => (data.honors ? genQuietStarMC(data.honors, pr, x, y, rng, season, rank, used) : null)])),                   //  curated twist exists)
      () => (pr ? genBigDayMC(pr, x, y, rng, (n, s) => c.notable(n, s) && !featured.includes(n), rank, used) : null),    // historic day
      () => (data.honors ? genHeismanVsRivalRank(data.honors, pr, x, y, rng, runner) : null),                            // Heisman vs. the rival
      () => { const rush = rng() < 0.4, cr = rush ? (data.career as unknown as import("./notable-gen").CareerReceiving) : data.careerRec; // career ranking
        return cr ? genCareerRecRank(cr, x, y, rng, rush) ?? (data.careerRec ? genCareerRecRank(data.careerRec, x, y, rng) : null) : null },
      () => (pr ? first(shuffle(rng, [() => genStreakMC(pr, x, y, rng), () => genMarginMC(pr, x, y, rng), () => genHighScoreMC(pr, x, y, rng)])) : null), // series
      () => first([...shuffle(rng, [() => (data.gameRanks ? genRankedMC(data.gameRanks, pr, x, y, rng) : null),            // rankings / vs. the field
        () => (data.rankedWins ? genRankedWinsMC(data.rankedWins, x, y, rng) : null)]),
        ...shuffle(rng, [() => (data.honors ? genPeerAwardMC(data.honors, x, y, rng) : null), () => (data.draft ? genPeerDraftMC(data.draft, x, y, rng) : null)])]),
      () => (data.seasonRecs ? genSecTop10(data.seasonRecs, x, y, rng) : null) ?? (data.seasonRecs ? genTopSeasons(data.seasonRecs, x, y, rng) : null)  // one top-10 fill-in
        ?? (data.careerRec ? genTopCareer(data.career as unknown as CareerLists, data.careerRec as unknown as CareerLists, x, y, rng) : null),
      () => genUpset(c),                                                                                                  // upset
    ];
    let got = 0;
    for (const f of shuffle(rng, slots)) { if (got >= SLOTS) break; if (add(f())) got++ }
  }
  let trapped = rng() < 0.25;
  for (let t = 0; t < n * 40 && out.length < n; t++) { // pitted formats fail often (both-schools rule), so try harder
    const r = pick(rng, gens)();
    const qs = !r ? [] : Array.isArray(r) ? r : [r];
    if (!qs.length || qs.some(q => sigs.has(q.sig)) || (qs[0].trap && trapped)) continue;
    if (qs[0].pair && out.some(q => q.pair)) continue; // at most one paired prop per set, so rivalry games get the higher/lower slots
    if (qs[0].trap) trapped = true;
    for (const q of qs) { sigs.add(q.sig); out.push(q) }
  }
  return out;
}

/** Per-set caps (spec §2). Trap and upset limits apply across generated and curated questions. */
export function caps(progCap: number, pitted = false): Record<QType, number> {
  // Pitted sets lean on cross-school formats, so they get more room (owner's call, Nov 2026).
  return pitted ? { moment: 4, prog: progCap, h2h: 4, rank: 3, count: 4, duel: 3, cross: 1, mc: 6 }
    : { moment: 4, prog: progCap, h2h: 3, rank: 2, count: 1, duel: 2, cross: 1, mc: 2 };
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
    case "mc": return !!q.pitted;
    case "moment": return !q.check || !!q.pair || !!q.pitted; // curated moments/series facts, paired props, rivalry games/series
    case "h2h": return both([itemSchool(q.A, a, b), itemSchool(q.B, a, b)]);
    case "rank": return both(q.items.map(x => itemSchool(x, a, b)));
  }
}

/** Generator family of a question, from its signature prefix (e.g. "vs" = totals against each other). */
export const questionKind = (q: Question) =>
  q.sig.match(/^(gm|vs|tv|ts|tg|dc|dm|ac|am|hc|hm|sc|td|gr|lp|lg|mx|nx|nr|wo|wm|fs|fv|fc|st|ms|mm|mh|rk|rw|hv|gs|xo|xq|xb|pd|pa|pp|tr|tp|d|u|h|r|c|g|k|p)/)?.[1] ?? q.sig.slice(0, 2);
// may appear twice in a set: program pit, curated items, game moments, plain head-to-heads
const REPEATABLE = new Set(["g", "gm", "h"]);
const CURATED_MAX = 6; // hand-written questions per set (owner adds them for big rivalries)

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
  const cap = caps(hasPlayerData(data, a, o) && hasPlayerData(data, b, o) ? 2 : 4, true);
  // Paired props travel as one unit: both halves or neither, always adjacent.
  // Hand-written questions for this rivalry come first (they're curated, verified and chosen on purpose), then generated ones.
  const curated = rest.filter(q => questionKind(q) === "k"), others = rest.filter(q => questionKind(q) !== "k");
  const all = [...curated, ...gen, ...others], units: Question[][] = [];
  for (const q of all) {
    if (!q.pair) units.push([q]);
    else if (q.pairPart === 1) { const mate = all.find(x => x.pair === q.pair && x.pairPart === 2); if (mate) units.push([q, mate]) }
  }
  const used: Partial<Record<QType, number>> = {}, picked: Question[][] = [], kinds: Record<string, number> = {};
  let n = 0, traps = 0, upsets = 0;
  // Pass 1: variety (no question kind twice, a few may appear twice). Pass 2, only if the set is still short of 10:
  // any kind may appear twice (owner: every set gets 10 questions). Caps, traps and upsets hold in both passes.
  for (const pass of [1, 2]) for (const u of units) {
    if (n >= WEEKLY_N) break;
    if (o.skip && u.some(q => o.skip!.has(q.sig))) continue; // owner revisions (data/overrides.json)
    if (n + u.length > WEEKLY_N || picked.includes(u)) continue;
    const kind = questionKind(u[0]);
    if ((kinds[kind] ?? 0) >= (kind === "k" ? CURATED_MAX : REPEATABLE.has(kind) || pass === 2 ? 2 : 1)) continue;
    if (!u.every(q => involvesBoth(q, a, b))) continue;
    if ((used[u[0].type] ?? 0) + u.length > cap[u[0].type]) continue;
    if (u[0].trap && traps >= 1) continue;
    if (u[0].upset && upsets >= 1) continue;
    used[u[0].type] = (used[u[0].type] ?? 0) + u.length;
    if (u[0].trap) traps++;
    if (u[0].upset) upsets++;
    picked.push(u); n += u.length; kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return shuffle(rng, picked).flat();
}

// ---- weekly sets ----
// Owner revisions: question signatures to leave out of a set (data/overrides.json), applied when the set is built.
const skipFor = (slug: string): string[] => ((overrides as { sets: Record<string, { skip?: string[] }> }).sets[slug]?.skip ?? []);
const pinFor = (slug: string): string[] => ((overrides as { sets: Record<string, { pin?: string[] }> }).sets[slug]?.pin ?? []);
export const weekKey = (g: Game) => `rival:${g.date}:${g.away}@${g.home}`;
export const weekSlug = (g: Game) => `${g.date}-${g.away}-at-${g.home}`.toLowerCase();

export function weeklySet(data: Dataset, g: Game): FrozenSet {
  const key = weekKey(g);
  const questions = buildRound(data, g.away, g.home, seededRng(key), { verifiedOnly: true, skip: new Set(skipFor(weekSlug(g))), pin: pinFor(weekSlug(g)) }).slice(0, WEEKLY_N);
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
