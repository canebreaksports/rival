import { describe, expect, it } from "vitest";
import { coachAuthorized, siteAuthorized } from "@/lib/coach-auth";
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
  it("players' pages take either password; coach pages only the coach password", () => {
    const env = { PLAYER_PASSWORD: "play", COACH_PASSWORD: "coach" };
    expect(siteAuthorized("/", basic("x", "play"), env)).toBe(true);
    expect(siteAuthorized("/play/2026-11-28-aub-at-ala", basic("x", "coach"), env)).toBe(true);
    expect(siteAuthorized("/", null, env)).toBe(false);
    expect(siteAuthorized("/coach/review", basic("x", "play"), env)).toBe(false);
    expect(siteAuthorized("/coach/review", basic("x", "coach"), env)).toBe(true);
    expect(siteAuthorized("/api/stats", basic("x", "play"), env)).toBe(false);
    expect(siteAuthorized("/", basic("x", "play"), {})).toBe(false); // nothing configured: locked
  });
});
