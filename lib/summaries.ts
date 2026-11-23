import { progressKey } from "./progress-key";
// Server-side: one summary per scheduled game for the home and Coach screens.
import { DATA } from "./data";
import { findMatchup, weekKey, weekSlug } from "./build";
import { readSets } from "./sets";
import type { GameSummary } from "@/components/WeekView";

export function gameSummaries(): GameSummary[] {
  const sets = new Map(readSets().map(s => [s.slug, s]));
  return DATA.schedule.games.map(game => {
    const slug = weekSlug(game);
    return { game, slug, key: progressKey({ key: weekKey(game), rev: sets.get(slug)?.rev }), n: sets.get(slug)?.questions.length ?? 0, name: findMatchup(DATA, game.away, game.home)?.name ?? null };
  });
}
