import { describe, expect, it } from "vitest";
import { DATA } from "@/lib/data";
import { buildRound, generate, weeklySet, WEEKLY_N, weekKey, findMatchup } from "@/lib/build";
import { seededRng, mulberry32 } from "@/lib/rng";
import { validateData, validateQuestion } from "@/lib/validate";
import { liveGames, nextGames, dateOf, windowOf } from "@/lib/gating";
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
    for (let i = 0; i < 1500; i++) for (const t of PAIRS) for (const q of generate(DATA, t, 5, mulberry32(i * 31 + t[0].length), ALL)) {
      n++; expect(validateQuestion(q)).toEqual([]);
    }
    expect(n).toBeGreaterThan(5000);
  });

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

describe("sets", () => {
  const count = (qs: Question[], f: (q: Question) => boolean | undefined) => qs.filter(f).length;
  it("respect caps, ≤1 trap, ≤1 upset, ≤10 questions", () => {
    for (let i = 0; i < 800; i++) for (const [a, b] of PAIRS) {
      const qs = buildRound(DATA, a, b, mulberry32(i), ALL);
      expect(qs.length).toBeLessThanOrEqual(WEEKLY_N);
      expect(count(qs, q => q.trap)).toBeLessThanOrEqual(1);
      expect(count(qs, q => q.upset)).toBeLessThanOrEqual(1);
      expect(count(qs, q => q.type === "moment")).toBeLessThanOrEqual(4);
      expect(count(qs, q => q.type === "h2h")).toBeLessThanOrEqual(3);
      expect(count(qs, q => q.type === "rank")).toBeLessThanOrEqual(2);
      expect(count(qs, q => q.type === "count")).toBeLessThanOrEqual(1);
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
  it("Friday games share the Sunday start; windows lock at 23:59 on game day", () => {
    const fri = games.find(g => g.date === "2026-11-27")!, sat = games.find(g => g.date === "2026-11-28")!;
    expect(windowOf(fri).start.getTime()).toBe(windowOf(sat).start.getTime());
    expect(windowOf(sat).start.getDay()).toBe(0);
    const end = windowOf(sat).end;
    expect([end.getHours(), end.getMinutes()]).toEqual([23, 59]);
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
