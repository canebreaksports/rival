import { describe, expect, it } from "vitest";
import { countdown, seasonStats, weeklyStreak } from "@/lib/retention";
const games = ["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"].map(date => ({ date, away: "AUB", home: "ALA" }));
const run = (date: string, pts = 1000) => ({ date, pts, right: 7, n: 10, hints: 0 });
describe("coming-back features", () => {
  it("weekly streak counts consecutive game weeks, alive until this week ends", () => {
    const now = new Date("2026-11-24T18:00:00Z");
    expect(weeklyStreak([run("2026-11-14"), run("2026-11-21")], games as never, now)).toEqual({ weeks: 2, playedThisWeek: false });
    expect(weeklyStreak([run("2026-11-14"), run("2026-11-21"), run("2026-11-28")], games as never, now)).toEqual({ weeks: 3, playedThisWeek: true });
    expect(weeklyStreak([run("2026-11-07"), run("2026-11-21")], games as never, now).weeks).toBe(1); // missed a week
    expect(weeklyStreak([], games as never, now).weeks).toBe(0);
  });
  it("season stats and countdown", () => {
    expect(seasonStats([run("2026-11-14", 900), run("2026-11-21", 1300)])).toEqual({ games: 2, pts: 2200, best: 1300, accuracy: 70 });
    expect(countdown((2 * 24 + 14) * 3600e3)).toBe("2d 14h");
    expect(countdown(3 * 3600e3 + 5 * 60e3)).toBe("3h 05m");
  });
});
