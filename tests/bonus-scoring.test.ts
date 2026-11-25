import { describe, expect, it } from "vitest";
import { answerValue, bonusTotal, earnedFor } from "@/lib/scoring";
describe("bonus scoring (100 split across the answers; each hint takes 25% off that answer)", () => {
  it("splits 100 evenly", () => {
    expect(answerValue(10)).toBe(10);
    expect(answerValue(4)).toBe(25);
    expect(bonusTotal(10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], () => 0)).toBe(100);
    expect(bonusTotal(3, [0, 1, 2], () => 0)).toBe(100);
  });
  it("each hint on an answer takes 25%; three hints leave 25%", () => {
    expect(earnedFor(10, 1)).toBe(7.5);
    expect(earnedFor(10, 2)).toBe(5);
    expect(earnedFor(10, 3)).toBe(2.5);
    expect(earnedFor(1, 3)).toBe(25);   // a single answer with all three hints
    expect(earnedFor(10, 5)).toBe(2.5); // never below 25%
  });
  it("totals named answers only, rounded", () => {
    // 10 answers: 6 named, one of them with 2 hints (5 pts) and one with 1 hint (7.5)
    expect(bonusTotal(10, [0, 1, 2, 3, 4, 5], i => (i === 0 ? 2 : i === 1 ? 1 : 0))).toBe(53);
    expect(bonusTotal(10, [], () => 0)).toBe(0);
  });
});
