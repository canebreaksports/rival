import { isNotable } from "@/lib/notable";
// Frozen weekly sets on disk (data/sets) must stay valid and match the schedule.
import { describe, expect, it } from "vitest";
import { DATA } from "@/lib/data";
import { readSets } from "@/lib/sets";
import { weekSlug, WEEKLY_N } from "@/lib/build";
import { validateQuestion } from "@/lib/validate";

describe("frozen sets", () => {
  const sets = readSets();
  it("exist for every scheduled game", () => {
    const have = new Set(sets.map(s => s.slug));
    expect(DATA.schedule.games.map(weekSlug).filter(s => !have.has(s))).toEqual([]);
  });
  it("count entries from this week on carry a profile hint, and profiles never give away initials", () => {
    for (const s of sets.filter(s => s.game.date >= "2026-11-21")) for (const q of s.questions) if (q.type === "count")
      for (const e of [...q.A, ...q.B]) { expect(e.profile).toBeTruthy(); expect(e.profile).not.toMatch(/initials|\b[A-Z]\.[A-Z]\./) }
  });
  it("are valid, verified-only, and within limits", () => {
    for (const s of sets) {
      expect(s.questions.length).toBeLessThanOrEqual(WEEKLY_N);
      expect(s.questions.filter(q => q.trap).length).toBeLessThanOrEqual(1);
      expect(s.questions.filter(q => q.upset).length).toBeLessThanOrEqual(1);
      for (const q of s.questions) { expect(q.verified).toBe(true); expect(validateQuestion(q)).toEqual([]) }
    }
  });
  it("from this week on, both schools get an edge: one count each school leads", () => {
    for (const s of sets.filter(s => s.game.date >= "2026-11-22")) {
      const leads = s.questions.filter(q => q.type === "count").map(q => (q.type === "count" ? Math.sign(q.A.length - q.B.length) : 0));
      expect(leads, s.slug).toContain(1); expect(leads, s.slug).toContain(-1);
      expect(s.questions.filter(q => /^d[cm]/.test(q.sig)).length, s.slug).toBeLessThanOrEqual(1); // the draft is a side dish
    }
  });
  it("the Saban question carries a Name the Years bonus", () => {
    const q = sets.find(s => s.slug === "2026-11-28-aub-at-ala")!.questions.find(q => q.type === "mc" && q.prompt.includes("Saban"));
    expect(q && q.type === "mc" && q.years?.A.map(x => x.season)).toEqual([2007, 2010, 2013, 2017, 2019]);
  });
  it("from this week on, higher/lower questions about a player use notable players only", () => {
    for (const s of sets.filter(s => s.game.date >= "2026-11-22")) for (const q of s.questions) {
      if (q.type !== "moment" || !/^(gm|pp)/.test(q.sig)) continue;
      const m = q.prompt.match(/did (.+?) \((.+?)\)/) ?? q.prompt.match(/Did (.+?) finish his (.+?) career/);
      const school = DATA.schools.find(x => x.name === m![2])!.key;
      expect(isNotable(DATA, m![1], school), `${s.slug}: ${m![1]}`).toBe(true);
      if (/touchdown/.test(q.line)) expect(q.check!.line).toBeGreaterThanOrEqual(1.5);
    }
  });
});
