"use client";
// A weekly matchup run. Enforces the game-week window unless `preview` (Coach) is set.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FrozenSet, Game } from "@/lib/types";
import { isLive, nextGames, unlockFmt, windowOf } from "@/lib/gating";
import { PREVIEW_PREFIX, store } from "@/lib/storage";
import { Play } from "./Play";

export function WeeklyRun({ set, games, preview = false }: { set: FrozenSet; games: Game[]; preview?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!now) return null;
  const home = preview ? "/coach" : "/";
  const key = (preview ? PREVIEW_PREFIX : "") + set.key;
  // outside the window: locked, unless you played it, in which case your results stay viewable
  if (!preview && !isLive(set.game, now) && !store.get(key)?.done) {
    const w = windowOf(set.game);
    return <section className="final"><div className="kind">Locked</div>
      <p>{now < w.start ? `This matchup unlocks ${unlockFmt(w.start)}.` : "This matchup's week is over."}</p>
      <Link className="btn ghost" href="/" style={{ display: "block", textDecoration: "none" }}>Back to This Week</Link></section>;
  }
  if (set.questions.length < 3) return <section className="final"><p>Stats pack coming soon for this matchup.</p>
    <Link className="back" href={home}>Back</Link></section>;
  const N = nextGames(games, now);
  return <Play questions={set.questions} away={set.game.away} home={set.game.home} mode="weekly"
    storageKey={key} nextUnlock={N.length ? unlockFmt(windowOf(N[0]).start) : null}
    onExit={() => router.push(home)} />;
}
