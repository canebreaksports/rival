"use client";
import { progressKey } from "@/lib/progress-key";
// A weekly matchup run. Enforces the game-week window unless `preview` (Coach) is set.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FrozenSet, Game } from "@/lib/types";
import { isLive, nextGames, unlockFmt, windowOf } from "@/lib/gating";
import { PREVIEW_PREFIX, store } from "@/lib/storage";
import { getFan, setFan, type Fan } from "@/lib/fan";
import { track } from "@/lib/track";
import { SchoolPicker } from "./SchoolPicker";
import { needsApproval, useApproved, useOrder } from "@/lib/approval-client";
import { applyOrder } from "@/lib/order";
import { Play } from "./Play";

export function WeeklyRun({ set, games, preview = false }: { set: FrozenSet; games: Game[]; preview?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [fan, setF] = useState<Fan | null | undefined>(undefined);
  const approved = useApproved(), order = useOrder(set.slug);
  const gated = !preview && needsApproval(set.slug); // waits for the owner's green light (Coach preview never does)
  useEffect(() => { setNow(new Date()); setF(getFan()) }, []);
  const key = (preview ? PREVIEW_PREFIX : "") + progressKey(set);
  // count a "start" once, when a fan opens a live matchup they haven't begun (never in Coach preview)
  const startable = !!now && !!fan && !preview && isLive(set.game, now) && set.questions.length >= 3 && (!gated || !!approved?.has(set.slug));
  useEffect(() => {
    if (startable && fan && !store.get(key)) track({ e: "start", pid: fan.pid, school: fan.school, slug: set.slug });
  }, [startable, fan, key, set.slug]);
  if (!now || fan === undefined || (gated && !approved) || order === null) return null;
  const questions = applyOrder(set.questions, order); // the owner's order from /coach/publish
  const home = preview ? "/coach" : "/";
  // outside the window: locked, unless you played it, in which case your results stay viewable
  if (!preview && !isLive(set.game, now) && !store.get(key)?.done) {
    const w = windowOf(set.game);
    return <section className="final"><div className="kind">Locked</div>
      <p>{now < w.start ? `This matchup unlocks ${unlockFmt(w.start)}.` : "This matchup's week is over."}</p>
      <Link className="btn ghost" href="/" style={{ display: "block", textDecoration: "none" }}>Back to This Week</Link></section>;
  }
  // not green-lit yet: players who already finished it can still see their results
  if (gated && !approved!.has(set.slug) && !store.get(key)?.done) return <section className="final"><div className="kind">Almost ready</div>
    <p>This matchup&apos;s questions are getting a final review. Check back soon.</p>
    <Link className="btn ghost" href="/" style={{ display: "block", textDecoration: "none" }}>Back to This Week</Link></section>;
  if (set.questions.length < 3) return <section className="final"><p>Stats pack coming soon for this matchup.</p>
    <Link className="back" href={home}>Back</Link></section>;
  // choose your school before entering a weekly game (Coach preview skips this)
  if (!preview && !fan) return <SchoolPicker onPick={k => { const f = setFan(k); setF(f); track({ e: "pick", pid: f.pid, school: k }) }} />;
  const N = nextGames(games, now);
  return <Play questions={questions} away={set.game.away} home={set.game.home} mode="weekly"
    storageKey={key} sharePath={preview ? null : `/play/${set.slug}`} nextUnlock={N.length ? unlockFmt(windowOf(N[0]).start) : null}
    onExit={() => router.push(home)}
    onFinish={p => { if (!preview && fan) track({ e: "finish", pid: fan.pid, school: fan.school, slug: set.slug, pts: p.pts, right: p.right, hints: p.hints ?? 0 }) }} />;
}
