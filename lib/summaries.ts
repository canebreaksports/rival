import { progressKey } from "./progress-key";
// Server-side: one summary per scheduled game for the home and Coach screens.
import { DATA } from "./data";
import { findMatchup, weekKey, weekSlug } from "./build";
import { readSets } from "./sets";
import type { GameSummary } from "@/components/WeekView";
import { nickname } from "./nicknames";
import { sundayOf } from "./gating";
import ap from "@/data/ap-current.json";

// earlier weeks keep their curated matchup names (e.g. "Third Saturday in October"); never a plain "A–B" label
const earlierName = (a: string, b: string) => { const n = findMatchup(DATA, a, b)?.name ?? null; return n && !n.includes("–") ? n : null };

export function gameSummaries(): GameSummary[] {
  const sets = new Map(readSets().map(s => [s.slug, s]));
  return DATA.schedule.games.map(game => {
    const slug = weekSlug(game);
    // AP ranks only for the week the current poll covers (data/ap-current.json); nicknames from lib/nicknames.ts
    const R = (ap as { weekOf: string; ranks: Record<string, number> }), cur = sundayOf(game.date) === R.weekOf;
    const ranks = cur ? { away: R.ranks[game.away] ?? null, home: R.ranks[game.home] ?? null } : undefined;
    return { game, slug, key: progressKey({ key: weekKey(game), rev: sets.get(slug)?.rev }), n: sets.get(slug)?.questions.length ?? 0, name: nickname(game.away, game.home) ?? earlierName(game.away, game.home), ...(ranks ? { ranks } : {}) };
  });
}
