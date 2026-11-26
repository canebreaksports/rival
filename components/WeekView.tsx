"use client";
// "This Week" and "Up Next" cards (spec §3 Home). Time-dependent, so it renders on the client after mount.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/types";
import { dfmt, liveGames, nextGames, unlockFmt, windowOf } from "@/lib/gating";
import { SCHOOL } from "@/lib/schools";
import { store } from "@/lib/storage";
import { Dot } from "./Dot";
import { needsApproval, useApproved } from "@/lib/approval-client";

export interface GameSummary { game: Game; slug: string; key: string; n: number; name: string | null; ranks?: { away: number | null; home: number | null } } // ranks: current AP poll

export function WeekView({ games, now: fixedNow, linkBase = "/play", storagePrefix = "" }: {
  games: GameSummary[]; now?: Date | null; linkBase?: string; storagePrefix?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [, bump] = useState(0);
  useEffect(() => { setNow(fixedNow ?? new Date()) }, [fixedNow]);
  useEffect(() => { // refresh status lines when progress changes in another tab
    const f = () => bump(x => x + 1);
    window.addEventListener("storage", f); window.addEventListener("focus", f);
    return () => { window.removeEventListener("storage", f); window.removeEventListener("focus", f) };
  }, []);
  if (!now) return <div className="sec">This Week</div>;

  const all = games.map(g => g.game);
  const live = new Set(liveGames(all, now)), next = new Set(nextGames(all, now));
  const L = games.filter(g => live.has(g.game)), N = games.filter(g => next.has(g.game));

  return <>
    <div className="sec">{L.length ? `This Week · ${dfmt(windowOf(L[0].game).day)}` : "This Week"}</div>
    <div className="grid">
      {L.length ? L.map(g => <Card key={g.slug} g={g} live linkBase={linkBase} storagePrefix={storagePrefix} />)
        : <p className="note empty">No SEC matchups this week.</p>}
    </div>
    {N.length > 0 && <>
      <div className="sec">Up Next</div>
      <div className="grid">{N.map(g => <Card key={g.slug} g={g} live={false} linkBase={linkBase} storagePrefix={storagePrefix} />)}</div>
    </>}
  </>;
}

/** "No. 6" before a ranked team (current AP poll). */
const rk = (r?: number | null) => (r ? <span style={{ color: "var(--gold)", fontWeight: 800, marginRight: 4 }}>No. {r}</span> : null);

function Card({ g, live, linkBase, storagePrefix }: { g: GameSummary; live: boolean; linkBase: string; storagePrefix: string }) {
  const w = windowOf(g.game), ready = g.n >= 3, sv = store.get(storagePrefix + g.key), played = !!sv?.done;
  const approvedSet = useApproved(), coach = storagePrefix !== ""; // Coach sees every set; players wait for the green light
  const inReview = !coach && needsApproval(g.slug) && !approvedSet?.has(g.slug);
  const open = live && ready && !played && !inReview;
  const status = !live ? (ready ? `Unlocks ${unlockFmt(w.start)} · ${g.n} questions` : `Unlocks ${unlockFmt(w.start)} · Stats pack coming soon`)
    : played ? `${sv!.right} of ${sv!.n} correct${sv!.hints ? ` · ${sv!.hints} hint${sv!.hints > 1 ? "s" : ""}` : ""} · tap to see your results`
    : !ready ? `${dfmt(w.day)} · Stats pack coming soon`
    : inReview ? (approvedSet ? `${dfmt(w.day)} · Final review · check back soon` : `${dfmt(w.day)} · …`)
    : sv ? `Resume · Q${sv.i + 1} of ${g.n}` : `${dfmt(w.day)} · ${g.n} questions`;
  const { away, home, site } = g.game;
  const body = <>
    {(g.name || site) && <div className="n">{g.name ?? `at ${site}`}</div>}
    <div className="t"><Dot k={away} />{rk(g.ranks?.away)}{SCHOOL[away].name} <span className="vs">{site ? "VS" : "@"}</span> <Dot k={home} />{rk(g.ranks?.home)}{SCHOOL[home].name}</div>
    {played && <div className="score"><span className="lbl">Your score</span><span className="pts">{sv!.pts.toLocaleString("en-US")}</span><span className="lbl">pts</span></div>}
    <div className="q">{status}</div>
  </>;
  if (played) return <Link className="rv played" href={`${linkBase}/${g.slug}`} aria-label={`Your results: ${SCHOOL[away].name} at ${SCHOOL[home].name}`}>{body}</Link>;
  return open ? <Link className="rv live" href={`${linkBase}/${g.slug}`}>{body}</Link>
    : <button className="rv locked" disabled aria-disabled="true">{body}</button>;
}
