import { describe, expect, it } from "vitest";
import { coachAuthorized } from "@/lib/coach-auth";
const basic = (u: string, p: string) => "Basic " + btoa(`${u}:${p}`);
describe("coach password", () => {
  it("lets the right password in, with any username", () => {
    expect(coachAuthorized(basic("coach", "s3cret:pass"), "s3cret:pass")).toBe(true);
    expect(coachAuthorized(basic("", "s3cret:pass"), "s3cret:pass")).toBe(true);
  });
  it("keeps everyone else out, and fails closed without a configured password", () => {
    expect(coachAuthorized(basic("coach", "wrong"), "s3cret")).toBe(false);
    expect(coachAuthorized(null, "s3cret")).toBe(false);
    expect(coachAuthorized("Bearer x", "s3cret")).toBe(false);
    expect(coachAuthorized("Basic %%%", "s3cret")).toBe(false);
    expect(coachAuthorized(basic("coach", ""), undefined)).toBe(false);
    expect(coachAuthorized(basic("coach", ""), "")).toBe(false);
  });
});

import { progressKey } from "@/lib/progress-key";
describe("set resets", () => {
  it("a reset set saves progress under a new key, so players get a fresh run", () => {
    expect(progressKey({ key: "rival:2026-11-28:AUB@ALA" })).toBe("rival:2026-11-28:AUB@ALA");
    expect(progressKey({ key: "rival:2026-11-28:AUB@ALA", rev: 1 })).toBe("rival:2026-11-28:AUB@ALA#r1");
  });
});
