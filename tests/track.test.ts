import { describe, expect, it } from "vitest";
import { involvesOwn, validateEvent } from "@/lib/track-server";
import { TEAMS } from "@/lib/teams";

const SLUGS = new Set(["2026-11-21-lsu-at-tenn"]);
const pid = "3f2b9c1e-7a4d-4e2b-9b1a-0c5d6e7f8a9b";
describe("tracking", () => {
  it("has every Power-conference school once", () => {
    expect(TEAMS.length).toBe(68);
    expect(new Set(TEAMS.map(t => t.key)).size).toBe(68);
  });
  it("accepts well-formed events and rejects anything else", () => {
    expect(validateEvent({ e: "pick", pid, school: "LSU" }, SLUGS)).toEqual({ e: "pick", pid, school: "LSU" });
    expect(validateEvent({ e: "pick", pid, school: "OTHER" }, SLUGS)?.school).toBe("OTHER");
    expect(validateEvent({ e: "start", pid, school: "OSU", slug: "2026-11-21-lsu-at-tenn" }, SLUGS)?.e).toBe("start");
    expect(validateEvent({ e: "pick", pid, school: "Hogwarts" }, SLUGS)).toBeNull();
    expect(validateEvent({ e: "start", pid, school: "LSU", slug: "nope" }, SLUGS)).toBeNull();
    expect(validateEvent({ e: "pick", pid: "x", school: "LSU" }, SLUGS)).toBeNull();
    expect(validateEvent({ e: "drop table", pid, school: "LSU" }, SLUGS)).toBeNull();
    expect(validateEvent({ e: "finish", pid, school: "LSU", slug: "2026-11-21-lsu-at-tenn", pts: 1e9 }, SLUGS)).toMatchObject({ pts: 5000 });
  });
  it("knows when a set involves the player's own school", () => {
    expect(involvesOwn("2026-11-21-lsu-at-tenn", "LSU")).toBe(true);
    expect(involvesOwn("2026-11-21-lsu-at-tenn", "TENN")).toBe(true);
    expect(involvesOwn("2026-11-21-lsu-at-tenn", "ALA")).toBe(false);
    expect(involvesOwn("2026-11-21-lsu-at-tenn", "OSU")).toBe(false);
  });
});
