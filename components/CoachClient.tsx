"use client";
// Coach (Preview Mode): simulate any date, reset local progress, and free play with all content (unverified flagged).
import Link from "next/link";
import { useState } from "react";
import type { Question, SchoolKey } from "@/lib/types";
import { DATA, SCHOOL } from "@/lib/data";
import { curatedQs, freeDive, freeMix, freeRound, hasPlayerData, programQs } from "@/lib/build";
import { dateOf } from "@/lib/gating";
import { store } from "@/lib/storage";
import { WeekView, type GameSummary } from "./WeekView";
import { Play } from "./Play";
import { Dot } from "./Dot";

type Free = { build: () => Question[]; away: SchoolKey | null; home: SchoolKey | null; mode: "dive" | "mix" | "round" };

export function CoachClient({ games }: { games: GameSummary[] }) {
  const [sim, setSim] = useState("");
  const [nonce, setNonce] = useState(0);
  const [free, setFree] = useState<Free | null>(null);
  const [qs, setQs] = useState<Question[]>([]);
  const [a, setA] = useState("ALA"), [b, setB] = useState("AUB");
  const simDate = sim ? new Date(dateOf(sim).getTime() + 12 * 3600e3) : null; // noon, so the picked day is inside its window

  const start = (f: Free) => { setFree(f); setQs(f.build()) };
  if (free) return <Play key={qs.map(q => q.sig).join()} questions={qs} away={free.away} home={free.home} mode={free.mode}
    onExit={() => setFree(null)} onAgain={() => setQs(free.build())} />;

  const keys = DATA.schools.map(s => s.key);
  const opts = { verifiedOnly: false };
  return <section>
    <h1>PIT<span>T</span>ED</h1>
    <div className="tag">Coach · Preview Mode</div>
    <p className="note" style={{ marginTop: 0 }}>Testing only. Weekly runs here use separate progress, so they don&apos;t use up your real run.</p>

    <Link className="btn" href="/coach/review" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 8 }}>Review This Week&apos;s Questions</Link>
    <Link className="btn ghost" href="/coach/stats" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 8 }}>Player Stats</Link>

    <div className="sec">Simulate a Date</div>
    <input type="date" value={sim} onChange={e => setSim(e.target.value)} aria-label="Simulated date" />
    <WeekView key={sim + nonce} games={games} now={simDate} linkBase="/coach/play" storagePrefix="preview:" />
    <div style={{ marginTop: 10 }}><button className="btn ghost" style={{ fontSize: 12, padding: 10 }} onClick={() => { store.clear(); setNonce(x => x + 1) }}>
      Reset My Played Matchups (this device)</button></div>

    <div className="sec">Classic Rivalries</div>
    <div className="grid">{DATA.curated.matchups.map(m => {
      const n = programQs(DATA, m.a, m.b, opts).length + curatedQs(m.items, m.name, Math.random, opts, [m.a, m.b]).length;
      const v = m.items.filter(i => i.verified).length;
      return <button key={m.name} className="rv" onClick={() => start({ build: () => freeRound(DATA, m.a, m.b), away: m.a, home: m.b, mode: "round" })}>
        <div className="n">{m.name}</div>
        <div className="t"><Dot k={m.a} />{SCHOOL[m.a].name} <span className="vs">VS</span> <Dot k={m.b} />{SCHOOL[m.b].name}</div>
        <div className="q">{n} questions · {v}/{m.items.length} curated verified</div></button>;
    })}</div>

    <div className="sec">Pit Any Two</div>
    <div className="custom">
      <select value={a} onChange={e => setA(e.target.value)} aria-label="School A">{keys.map(k => <option key={k} value={k}>{SCHOOL[k].name}</option>)}</select>
      <span className="vs">VS</span>
      <select value={b} onChange={e => setB(e.target.value)} aria-label="School B">{keys.map(k => <option key={k} value={k}>{SCHOOL[k].name}</option>)}</select>
    </div>
    <div style={{ marginTop: 10 }}><button className="btn" disabled={a === b} onClick={() => start({ build: () => freeRound(DATA, a, b), away: a, home: b, mode: "round" })}>Kick Off</button></div>

    <div className="sec">Team Deep Dive</div>
    <div className="grid">{keys.filter(k => hasPlayerData(DATA, k, opts) || DATA.curated.teamPacks[k]).map(k =>
      <button key={k} className="rv" onClick={() => start({ build: () => freeDive(DATA, k), away: k, home: null, mode: "dive" })}>
        <div className="n">Player Props · Rank It</div><div className="t"><Dot k={k} />{SCHOOL[k].name}</div>
        <div className="q">{DATA.players.seasons.filter(s => s.school === k).length} player seasons</div></button>)}</div>

    <div className="sec">Quick Play</div>
    <button className="btn ghost" onClick={() => start({ build: () => freeMix(DATA), away: null, home: null, mode: "mix" })}>Mixed SEC Round · 10 Qs</button>
    <Link className="back" href="/">← Public home</Link>
  </section>;
}
