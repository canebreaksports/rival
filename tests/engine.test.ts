import { describe, expect, it } from "vitest";
import { DATA } from "@/lib/data";
import { buildRound, generate, weeklySet, WEEKLY_N, weekKey, findMatchup, involvesBoth } from "@/lib/build";
import { seededRng, mulberry32 } from "@/lib/rng";
import { validateData, validateQuestion } from "@/lib/validate";
import { liveGames, nextGames, dateOf, windowOf, isLive } from "@/lib/gating";
import { matchNames } from "@/lib/names";
import { applyResult, scoreRank, correctAnswer } from "@/lib/scoring";
import { genCount, genUpset, makeCtx } from "@/lib/generators";
import type { Question } from "@/lib/types";

const PAIRS: [string, string][] = [["LSU", "TENN"], ["AUB", "ALA"], ["AUB", "TENN"], ["LSU", "ALA"], ["VAN", "FLA"], ["UK", "MIZ"]];
const VERIFIED = { verifiedOnly: true }, ALL = { verifiedOnly: false };

describe("data", () => {
  it("passes validation (sources, 26 seasons, schedule, career lists, curated answers)", () => {
    expect(validateData(DATA)).toEqual([]);
  });
  it("every school with season records has 26 of them", () => {
    for (const r of Object.values(DATA.seasons)) expect(r.records).toHaveLength(26);
  });
});

describe("generators", () => {
  it("generated questions are internally consistent (over/under, no ties)", () => {
    let n = 0;
    for (let i = 0; i < 600; i++) for (const t of PAIRS) for (const q of generate(DATA, t, 5, mulberry32(i * 31 + t[0].length), ALL)) {
      n++; expect(validateQuestion(q)).toEqual([]);
    }
    expect(n).toBeGreaterThan(5000);
  }, 30000);

  it("upsets never break the skip rules", () => {
    for (let i = 0; i < 500; i++) {
      const c = makeCtx(DATA, ["AUB", "TENN", "LSU", "ALA"], mulberry32(i), false);
      const q = genUpset(c);
      if (!q || q.type !== "h2h") continue;
      expect(q.A.value).toBeGreaterThan(q.B.value); // A is the lesser-known winner
      if (q.ypc) expect(q.note).toMatch(/carries/);
    }
  });

  it("school count skips thresholds an active player could cross", () => {
    for (let i = 0; i < 200; i++) {
      const q = genCount(DATA, "LSU", "TENN", mulberry32(i), true);
      if (q?.type === "count") expect(q.threshold).toBeLessThanOrEqual(2694); // DeSean Bishop (active) is at 2,694
    }
  });
});

describe("player-first sets", () => {
  it("generated duels pair one same-season line from each school", () => {
    let seen = 0;
    for (let i = 0; i < 400; i++) for (const q of generate(DATA, ["LSU", "ALA"], 7, mulberry32(i), ALL)) {
      if (q.type !== "duel" || !q.sig.startsWith("d")) continue;
      seen++; expect(new Set([q.aSchool, q.other])).toEqual(new Set(["LSU", "ALA"])); expect(q.A.big).not.toBe(q.B.big);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it("Mixed Rank It uses 4 players, at least 3 stat framings, one unit, no ties", () => {
    let seen = 0;
    for (let i = 0; i < 300; i++) for (const q of generate(DATA, ["AUB", "TENN"], 7, mulberry32(i), VERIFIED)) {
      if (q.type !== "rank" || !q.sig.startsWith("mx")) continue;
      seen++;
      expect(new Set(q.items.map(x => x.label.split(" (")[0])).size).toBe(4);
      expect(new Set(q.items.map(x => x.label.split(" · ")[1])).size).toBeGreaterThanOrEqual(3);
      expect(validateQuestion(q)).toEqual([]);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it("no generated rank or head-to-head uses trivial values", () => {
    for (let i = 0; i < 300; i++) for (const q of generate(DATA, ["UGA", "SC"], 7, mulberry32(i), VERIFIED)) {
      if (q.type === "rank" && q.unit === "TD") q.items.forEach(x => expect(x.value).toBeGreaterThanOrEqual(3));
      if (q.type === "h2h" && !q.upset && /TDs/.test(q.unit)) [q.A, q.B].forEach(x => expect(x.value).toBeGreaterThanOrEqual(3));
    }
  });
  it("generated rank questions mix both schools", () => {
    for (let i = 0; i < 300; i++) for (const q of generate(DATA, ["AUB", "TENN"], 7, mulberry32(i), ALL))
      if (q.type === "rank" && !q.trap && !q.sig.startsWith("mx")) expect(new Set(q.items.map(x => x.label.split(" ").pop())).size).toBeGreaterThan(1);
  });
  it("sets with player data on both sides are mostly player questions and ≤2 program", () => {
    for (let i = 0; i < 300; i++) for (const [a, b] of [["LSU", "TENN"], ["AUB", "ALA"]]) {
      const qs = buildRound(DATA, a, b, mulberry32(i), VERIFIED);
      expect(qs.filter(q => q.type === "prog").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("approximate-source margins (CollegeFootballData packs)", () => {
  const NEW: [string, string][] = [["VAN", "FLA"], ["UK", "MIZ"], ["TAMU", "OU"], ["UGA", "SC"], ["ARK", "TEX"], ["MSST", "MISS"]];
  const gap = (a: number, b: number) => Math.max(50, 0.08 * Math.max(Math.abs(a), Math.abs(b)));
  // the margin applies only when a CollegeFootballData value is involved
  const approx = (label: string) => DATA.players.seasons.some(s => s.name === label.split(" (")[0] && s.source.startsWith("CollegeFootballData"));
  it("no yardage question hinges on a gap the source could blur", () => {
    let n = 0;
    for (let i = 0; i < 400; i++) for (const t of NEW) for (const q of generate(DATA, t, 7, mulberry32(i), VERIFIED)) {
      n++;
      if (q.sig.startsWith("gm") && q.type === "moment" && q.check && /yards/.test(q.line)) // single-game margin
        expect(Math.abs(q.check.value - q.check.line)).toBeGreaterThanOrEqual(Math.max(15, 0.12 * q.check.value) - 0.001);
      if (q.sig.startsWith("vs") && q.type === "h2h") expect(Math.abs(q.A.value - q.B.value)).toBeGreaterThanOrEqual(Math.max(25, 0.1 * Math.max(q.A.value, q.B.value)));
      if (/^g[rs]/.test(q.sig) && q.type === "rank") {
        const v = q.items.map(x => x.value).sort((x, y) => y - x);
        v.slice(1).forEach((x, j) => expect(v[j] - x).toBeGreaterThanOrEqual(Math.max(15, 0.12 * v[j]) - 0.001));
      }
      if (/^(gm|vs|gr|gs|sc|td)/.test(q.sig)) continue; // rivalry questions have their own margins (checked above)
      if (q.type === "h2h" && !q.ypc && /yards/.test(q.prompt + q.unit) && !/touchdowns|TDs|receptions/.test(q.prompt + q.unit) && (approx(q.A.label) || approx(q.B.label)))
        expect(Math.abs(q.A.value - q.B.value)).toBeGreaterThanOrEqual(gap(q.A.value, q.B.value));
      if (q.type === "rank" && q.unit === "yds") { // adjacent pairs involving an approximate value
        const v = [...q.items].sort((a, b) => b.value - a.value);
        v.slice(1).forEach((x, j) => { if (approx(x.label) || approx(v[j].label)) expect(v[j].value - x.value).toBeGreaterThanOrEqual(gap(v[j].value, x.value)) });
      }
      if (q.type === "moment" && q.check && /yards/.test(q.line) && approx(q.prompt.replace(/^(In \d{4}, did|Did) /, ""))) expect(Math.abs(q.check.value - q.check.line)).toBeGreaterThanOrEqual(gap(q.check.value, q.check.value) - 0.001);
    }
    expect(n).toBeGreaterThan(1000);
  });
  it("every new school has a verified, sourced player pack", () => {
    for (const k of ["FLA", "VAN", "MIZ", "UK", "OU", "TAMU", "UGA", "SC", "TEX", "ARK", "MISS", "MSST"]) {
      const ps = DATA.players.players.filter(p => p.school === k);
      expect(ps.length).toBeGreaterThanOrEqual(8);
      const rows = DATA.players.seasons.filter(s => s.school === k);
      expect(rows.every(s => /CollegeFootballData|Wikipedia/.test(s.source))).toBe(true);
      expect(new Set(rows.filter(s => s.verified).map(s => s.name)).size).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("pitted mode", () => {
  it("every question in a matchup involves both schools", () => {
    for (let i = 0; i < 300; i++) for (const [a, b] of [["LSU", "TENN"], ["AUB", "TENN"], ["UGA", "SC"], ["ARK", "TEX"], ["MSST", "MISS"]]) {
      for (const q of buildRound(DATA, a, b, mulberry32(i), VERIFIED)) {
        expect(involvesBoth(q, a, b)).toBe(true);
        if (q.type === "h2h") expect(new Set([q.A.school, q.B.school]).size).toBe(q.A.school ? 2 : 1);
        if (q.type === "moment" && q.check) expect(q.pair || q.pitted).toBeTruthy(); // paired props or rivalry games/series, never a lone prop
      }
    }
  });
  it("paired props appear whole, back to back, one player per school", () => {
    let pairs = 0;
    for (let i = 0; i < 300; i++) for (const [a, b] of [["LSU", "TENN"], ["UGA", "SC"], ["TEX", "TAMU"]]) {
      const qs = buildRound(DATA, a, b, mulberry32(i), VERIFIED);
      qs.forEach((q, j) => {
        if (q.pairPart !== 1) return;
        pairs++;
        const mate = qs[j + 1];
        expect(mate?.pair).toBe(q.pair);
        expect(mate?.pairPart).toBe(2);
        const schoolOf = (x: typeof q) => DATA.schools.find(s => x.type === "moment" && x.prompt.includes(`(${s.name})`) || x.type === "moment" && x.prompt.includes(`his ${s.name} career`))?.key;
        expect(new Set([schoolOf(q), schoolOf(mate!)]).size).toBe(2);
      });
      expect(qs.filter(q => q.pair).length % 2).toBe(0);
    }
    expect(pairs).toBeGreaterThan(0);
  });
  it("rivalry questions come from games between exactly these two schools", () => {
    let seen = 0;
    for (let i = 0; i < 200; i++) for (const [a, b] of [["LSU", "TENN"], ["UGA", "SC"], ["AUB", "ALA"]]) for (const q of buildRound(DATA, a, b, mulberry32(i), VERIFIED)) {
      if (q.type === "moment" && q.game && q.sig.startsWith("gm")) { seen++; expect(new Set([q.game.winner, q.game.loser])).toEqual(new Set([a, b])); expect(q.game.ws).toBeGreaterThan(q.game.ls) }
      if (q.type === "moment" && q.sig.startsWith("sc")) expect(validateQuestion(q)).toEqual([]);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it("team-stat multiple choice: 4 distinct options at least 20 yards apart, one true", () => {
    let seen = 0;
    for (let i = 0; i < 200; i++) for (const [a, b] of [["AUB", "ALA"], ["UGA", "SC"], ["LSU", "ARK"]]) for (const q of buildRound(DATA, a, b, mulberry32(i), VERIFIED)) {
      if (q.type !== "mc" || !q.sig.startsWith("td")) continue;
      seen++;
      expect(validateQuestion(q)).toEqual([]);
      const v = q.options.map(o => (o.startsWith(DATA.schools.find(s => s.key === a)!.name + " ") ? 1 : -1) * Number(o.replace(/[^\d]/g, "")));
      v.forEach((x, i) => v.forEach((y, j) => { if (i < j) expect(Math.abs(x - y)).toBeGreaterThanOrEqual(20) }));
      expect(q.game).toBeDefined();
    }
    expect(seen).toBeGreaterThan(0);
  });
  it("team packs never appear in matchups", () => {
    const key = (x: object) => JSON.stringify(["prompt", "line", "reveal", "items", "A"].map(k => (x as Record<string, unknown>)[k]));
    const pack = new Set(Object.values(DATA.curated.teamPacks).flat().map(key));
    for (let i = 0; i < 200; i++) for (const q of buildRound(DATA, "LSU", "TENN", mulberry32(i), ALL))
      expect(pack.has(key(q))).toBe(false);
  });
});

describe("no close calls", () => {
  it("yardage comparisons are at least 25 yards or 5% apart, unless both are notable (checked separately)", () => {
    const gap = (a: number, b: number) => Math.max(25, 0.05 * Math.max(a, b));
    for (let i = 0; i < 300; i++) for (const [a, b] of [["LSU", "TENN"], ["AUB", "ALA"], ["TEX", "TAMU"]]) for (const q of buildRound(DATA, a, b, mulberry32(i), VERIFIED)) {
      const bigEnough = (v: number) => v >= 1000; // notable seasons/careers are at least 1,000 yards
      if (q.type === "duel") { const x = Number(q.A.big.replace(/,/g, "")), y = Number(q.B.big.replace(/,/g, "")); if (!(bigEnough(x) && bigEnough(y))) expect(Math.abs(x - y)).toBeGreaterThanOrEqual(gap(x, y)) }
      if (q.type === "h2h" && !q.ypc && /yards|yds/.test(q.prompt + q.unit) && !(bigEnough(q.A.value) && bigEnough(q.B.value))) expect(Math.abs(q.A.value - q.B.value)).toBeGreaterThanOrEqual(gap(q.A.value, q.B.value) - 0.001);
      if (q.type === "rank" && q.unit === "yds") { const v = q.items.map(x => x.value).sort((m, n) => n - m); v.slice(1).forEach((x, j) => { if (!(bigEnough(v[j]) && bigEnough(x))) expect(v[j] - x).toBeGreaterThanOrEqual(Math.min(gap(v[j], x), Math.max(15, 0.12 * v[j])) - 0.001) }) }
    }
  });
});

describe("weekly trend questions (since <year>)", () => {
  const TREND = /^t[sgv]/;
  it("every scheduled matchup gets at least one", () => {
    const missing = DATA.schedule.games.filter(g => !buildRound(DATA, g.away, g.home, seededRng(g.date), VERIFIED).some(q => TREND.test(q.sig)));
    expect(missing.map(g => g.away + "@" + g.home)).toEqual([]);
  });
  it("season counts list exactly the seasons over the line, none within the margin", () => {
    for (let i = 0; i < 150; i++) for (const [a, b] of [["LSU", "TENN"], ["UGA", "SC"], ["TEX", "TAMU"]]) for (const q of buildRound(DATA, a, b, mulberry32(i), VERIFIED)) {
      if (q.type !== "count" || !q.sig.startsWith("ts")) continue;
      const k = q.sig.startsWith("tsrush") ? "rush" : "rec", from = Number(q.prompt!.match(/From (\d{4})/)![1]);
      for (const [s, list] of [[a, q.A], [b, q.B]] as const) {
        const want = DATA.leaders!.schools[s].filter(x => x.season >= from && x[k] >= q.threshold).map(x => x.name + x.season).sort();
        expect(list.map(x => x.name + x.season).sort()).toEqual(want);
        DATA.leaders!.schools[s].filter(x => x.season >= from).forEach(x => expect(Math.abs(x[k] - q.threshold)).toBeGreaterThanOrEqual(x.margin));
      }
    }
  });
  it("most-yards-against multiple choice has a clear winner and both schools among the options", () => {
    let seen = 0;
    for (let i = 0; i < 150; i++) for (const [a, b] of [["LSU", "TENN"], ["UGA", "SC"], ["AUB", "ALA"]]) for (const q of buildRound(DATA, a, b, mulberry32(i), VERIFIED)) {
      if (q.type !== "mc" || !q.sig.startsWith("tv")) continue;
      seen++;
      expect(validateQuestion(q)).toEqual([]);
      const names = [a, b].map(k => DATA.schools.find(s => s.key === k)!.name);
      expect(names.every(n => q.options.some(o => o.endsWith(`(${n})`)))).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("sets", () => {
  const count = (qs: Question[], f: (q: Question) => boolean | undefined) => qs.filter(f).length;
  it("respect caps, ≤1 trap, ≤1 upset, ≤10 questions", () => {
    for (let i = 0; i < 800; i++) for (const [a, b] of PAIRS) {
      const qs = buildRound(DATA, a, b, mulberry32(i), ALL);
      expect(qs.length).toBeLessThanOrEqual(WEEKLY_N);
      expect(count(qs, q => q.trap)).toBeLessThanOrEqual(1);
      expect(count(qs, q => q.upset)).toBeLessThanOrEqual(1);
      expect(count(qs, q => q.type === "moment")).toBeLessThanOrEqual(4);
      expect(count(qs, q => q.type === "h2h")).toBeLessThanOrEqual(4);   // pitted caps
      expect(count(qs, q => q.type === "rank")).toBeLessThanOrEqual(3);
      expect(count(qs, q => q.type === "duel")).toBeLessThanOrEqual(3);
      expect(count(qs, q => q.type === "count")).toBeLessThanOrEqual(2); // pitted: career count + a weekly trend count
      for (const q of qs) expect(validateQuestion(q)).toEqual([]);
    }
  });

  it("weekly sets are deterministic and verified-only", () => {
    for (const g of DATA.schedule.games) {
      const x = weeklySet(DATA, g), y = weeklySet(DATA, g);
      expect(JSON.stringify(x.questions)).toBe(JSON.stringify(y.questions));
      expect(x.questions.every(q => q.verified)).toBe(true);
      expect(x.key).toBe(weekKey(g));
    }
  });

  it("free play may include unverified content; weekly never does", () => {
    const m = findMatchup(DATA, "ALA", "AUB")!;
    expect(m.items.some(i => !i.verified)).toBe(true);
    const wk = buildRound(DATA, "AUB", "ALA", seededRng("x"), VERIFIED);
    expect(wk.every(q => q.verified)).toBe(true);
  });
});

describe("gating", () => {
  const games = DATA.schedule.games;
  it("LSU@TENN is live the week of Nov 21, 2026 and the Iron Bowl is up next", () => {
    const now = dateOf("2026-11-17");
    expect(liveGames(games, now).map(g => g.away + "@" + g.home)).toContain("LSU@TENN");
    expect(nextGames(games, now).some(g => g.away === "AUB" && g.home === "ALA")).toBe(true);
  });
  it("Friday games share the Sunday unlock; unlock is Sunday 7 AM Central, lock is 11:59 PM Central on game day", () => {
    const fri = games.find(g => g.date === "2026-11-27")!, sat = games.find(g => g.date === "2026-11-28")!;
    expect(windowOf(fri).start.getTime()).toBe(windowOf(sat).start.getTime());
    expect(windowOf(sat).start.toISOString()).toBe("2026-11-22T13:00:00.000Z");      // 7:00 CST (UTC−6)
    const sep = games.find(g => g.date === "2026-09-19")!;
    expect(windowOf(sep).start.toISOString()).toBe("2026-09-13T12:00:00.000Z");      // 7:00 CDT (UTC−5): daylight saving
    expect(windowOf(sat).end.toISOString()).toBe("2026-11-29T05:59:59.999Z");        // Sat 11:59:59 PM CST
  });
  it("is closed just before 7 AM Central Sunday and open just after", () => {
    const sat = games.find(g => g.date === "2026-11-28")!;
    expect(isLive(sat, new Date("2026-11-22T12:59:00Z"))).toBe(false);
    expect(isLive(sat, new Date("2026-11-22T13:00:00Z"))).toBe(true);
    expect(isLive(sat, new Date("2026-11-29T06:00:00Z"))).toBe(false);
  });
});

describe("names and scoring", () => {
  it("matches last names, needs first names when ambiguous, and handles nicknames", () => {
    const ppl = [...DATA.career.AUB.list, ...DATA.career.ALA.list];
    const hit = matchNames("bo jackson, cadillac, harris, najee harris, yeldon", ppl);
    expect(hit.has("Bo Jackson")).toBe(true);
    expect(hit.has("Carnell 'Cadillac' Williams")).toBe(true);
    expect(hit.has("Najee Harris")).toBe(true);
    expect(hit.has("Damien Harris")).toBe(false);
    expect(hit.has("T. J. Yeldon")).toBe(true);
  });
  it("scores streaks, perfect ranks and partial ranks", () => {
    let p = { i: 0, pts: 0, streak: 0, best: 0, right: 0, n: 10, done: false };
    p = applyResult(p, true, 100); p = applyResult(p, true, 150);
    expect(p.pts).toBe(100 + 150 + 25);
    p = applyResult(p, false, 50);
    expect([p.streak, p.pts, p.best]).toEqual([0, 325, 2]);
    const q = { type: "rank", label: "", verified: true, sig: "", prompt: "", unit: "yds", items: [{ label: "a", value: 1 }, { label: "b", value: 3 }, { label: "c", value: 2 }, { label: "d", value: 4 }] } as Question & { type: "rank" };
    expect(scoreRank(q, [3, 1, 2, 0]).base).toBe(150);
    expect(scoreRank(q, [3, 2, 1, 0]).base).toBe(50);
  });
  it("Georgia and Oklahoma tie on total wins 2000–2025 (spec §4.1 example)", () => {
    const qs = buildRound(DATA, "UGA", "OU", seededRng("t"), VERIFIED);
    const all = Array.from({ length: 60 }, (_, i) => buildRound(DATA, "UGA", "OU", mulberry32(i), VERIFIED)).flat();
    const tw = [...qs, ...all].find(q => q.type === "prog" && q.prompt.includes("total games"));
    expect(tw && tw.type === "prog" && tw.values).toEqual([271, 271]);
    expect(correctAnswer(tw!)).toBe("t");
  });
});
