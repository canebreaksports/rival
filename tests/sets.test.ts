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
  it("are valid, verified-only, and within limits", () => {
    for (const s of sets) {
      expect(s.questions.length).toBeLessThanOrEqual(WEEKLY_N);
      expect(s.questions.filter(q => q.trap).length).toBeLessThanOrEqual(1);
      expect(s.questions.filter(q => q.upset).length).toBeLessThanOrEqual(1);
      for (const q of s.questions) { expect(q.verified).toBe(true); expect(validateQuestion(q)).toEqual([]) }
    }
  });
});
