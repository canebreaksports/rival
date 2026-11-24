"use client";
// Home / final-screen panel that brings players back: weekly streak, countdown to the next unlock, season stats,
// a weekly calendar reminder and "Add to Home Screen" (owner, Nov 2026: "make it sticky").
import { useEffect, useState } from "react";
import type { Game } from "@/lib/types";
import { nextGames, windowOf } from "@/lib/gating";
import { countdown, playedRuns, seasonStats, weeklyStreak } from "@/lib/retention";

type BIP = Event & { prompt: () => Promise<void> };
export function ComeBack({ games, compact = false }: { games: Game[]; compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [runs, setRuns] = useState<ReturnType<typeof playedRuns>>([]);
  const [install, setInstall] = useState<BIP | null>(null), [ios, setIos] = useState(false), [standalone, setStandalone] = useState(false), [tip, setTip] = useState(false);
  useEffect(() => {
    setNow(new Date()); setRuns(playedRuns());
    const t = setInterval(() => setNow(new Date()), 30000);
    const onBip = (e: Event) => { e.preventDefault(); setInstall(e as BIP) };
    window.addEventListener("beforeinstallprompt", onBip);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setStandalone(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    return () => { clearInterval(t); window.removeEventListener("beforeinstallprompt", onBip) };
  }, []);
  if (!now) return null;
  const streak = weeklyStreak(runs, games, now), stats = seasonStats(runs), next = nextGames(games, now)[0];
  const until = next ? windowOf(next).start.getTime() - now.getTime() : 0;
  const box: React.CSSProperties = { border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: "12px 14px", margin: "14px 0", textAlign: "left" };
  return <div style={box} aria-label="Your PITTED season">
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
      <div><b style={{ fontSize: 18 }}>{streak.weeks ? `${streak.weeks}-week streak` : "Start a streak"}</b>
        <div className="note" style={{ margin: 0, textAlign: "left" }}>{streak.playedThisWeek ? "You played this week. See you next week." : streak.weeks ? "Play a matchup this week to keep it going." : "Play one matchup each game week."}</div></div>
      {next ? <div style={{ textAlign: "right" }}><div className="note" style={{ margin: 0 }}>New matchups in</div><b style={{ fontSize: 18 }}>{countdown(until)}</b></div>
        : <div className="note" style={{ margin: 0 }}>Season schedule complete. Back next season.</div>}
    </div>
    {!compact && stats.games > 0 && <div className="note" style={{ textAlign: "left", margin: "8px 0 0" }}>
      Your season: {stats.games} game{stats.games > 1 ? "s" : ""} · {stats.pts.toLocaleString("en-US")} pts · best {stats.best.toLocaleString("en-US")} · {stats.accuracy}% correct</div>}
    <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      <a className="btn ghost" href="/pitted-weekly.ics" download style={{ width: "auto", padding: "6px 12px", fontSize: 13, textDecoration: "none" }}>Add weekly reminder</a>
      {!standalone && (install
        ? <button className="btn ghost" style={{ width: "auto", padding: "6px 12px", fontSize: 13 }} onClick={() => install.prompt().catch(() => {})}>Add to home screen</button>
        : ios && <button className="btn ghost" style={{ width: "auto", padding: "6px 12px", fontSize: 13 }} onClick={() => setTip(!tip)}>Add to home screen</button>)}
    </div>
    {tip && <div className="note" style={{ textAlign: "left", margin: "8px 0 0" }}>On iPhone: tap the Share button in Safari, then &quot;Add to Home Screen.&quot;</div>}
  </div>;
}
