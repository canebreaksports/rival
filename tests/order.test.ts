import { describe, expect, it } from "vitest";
import { applyOrder, units } from "@/lib/order";
import type { Question } from "@/lib/types";
const q = (sig: string, pair?: string, pairPart?: 1 | 2) => ({ type: "prog", sig, pair, pairPart, label: "", verified: true }) as unknown as Question;
describe("owner question order", () => {
  const qs = [q("a"), q("p1", "P", 1), q("p2", "P", 2), q("b")];
  it("applies a full permutation and ignores anything else", () => {
    expect(applyOrder(qs, ["b", "a", "p1", "p2"]).map(x => x.sig)).toEqual(["b", "a", "p1", "p2"]);
    expect(applyOrder(qs, ["b", "a"]).map(x => x.sig)).toEqual(["a", "p1", "p2", "b"]);          // stale order (set rebuilt)
    expect(applyOrder(qs, ["b", "a", "x", "p2"]).map(x => x.sig)).toEqual(["a", "p1", "p2", "b"]);
    expect(applyOrder(qs, ["p1", "a", "p2", "b"]).map(x => x.sig)).toEqual(["a", "p1", "p2", "b"]); // a pair split apart
  });
  it("moves paired questions as one unit", () => {
    expect(units(qs).map(u => u.map(x => x.sig))).toEqual([["a"], ["p1", "p2"], ["b"]]);
  });
});
