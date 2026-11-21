"use client";
// Coach → Stats: players by school, and how often fans play sets that don't involve their school.
import Link from "next/link";
import { useEffect, useState } from "react";
import { teamName } from "@/lib/teams";
import { SCHOOL } from "@/lib/schools";

type Stats = { configured: boolean; fans?: Record<string, string>; starts?: Record<string, number>; finishes?: Record<string, number>; points?: Record<string, number>; hints?: Record<string, number> };
const matchupName = (slug: string) => { const [a, h] = slug.slice(11).split("-at-").map(x => x.toUpperCase()); return `${SCHOOL[a]?.name ?? a} @ ${SCHOOL[h]?.name ?? h} · ${slug.slice(5, 10)}` };
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");

export function StatsClient() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  async function load(k: string) {
    setErr("");
    const r = await fetch("/api/stats", { headers: { "x-stats-key": k }, cache: "no-store" });
    if (r.status === 401) { setErr("Wrong key, or STATS_KEY isn't set in Vercel."); setData(null); return }
    if (!r.ok) { setErr(`Couldn't load stats (${r.status}).`); return }
    setData(await r.json());
    try { localStorage.setItem("rivalstatskey", k) } catch { /* ignore */ }
  }
  useEffect(() => { try { const k = localStorage.getItem("rivalstatskey"); if (k) { setKey(k); void load(k) } } catch { /* ignore */ } }, []);

  const fans = Object.values(data?.fans ?? {});
  const bySchool: Record<string, { players: number; own: number; other: number; done: number }> = {};
  const row = (s: string) => (bySchool[s] ??= { players: 0, own: 0, other: 0, done: 0 });
  fans.forEach(s => row(s).players++);
  const byGame: Record<string, { own: number; other: number; done: number; pts: number }> = {};
  for (const [f, n] of Object.entries(data?.starts ?? {})) { const [slug, school, side] = f.split("|"); row(school)[side as "own" | "other"] += n; const g = (byGame[slug] ??= { own: 0, other: 0, done: 0, pts: 0 }); g[side as "own" | "other"] += n }
  for (const [f, n] of Object.entries(data?.finishes ?? {})) { const [slug, school] = f.split("|"); row(school).done += n; (byGame[slug] ??= { own: 0, other: 0, done: 0, pts: 0 }).done += n }
  for (const [f, n] of Object.entries(data?.points ?? {})) { const [slug] = f.split("|"); if (byGame[slug]) byGame[slug].pts += n }
  const tot = Object.values(bySchool).reduce((t, r) => ({ own: t.own + r.own, other: t.other + r.other, done: t.done + r.done }), { own: 0, other: 0, done: 0 });

  return <section>
    <h1>RI<span>V</span>AL</h1>
    <div className="tag">Coach · Player Stats</div>
    {!data?.configured && <form className="row" onSubmit={e => { e.preventDefault(); void load(key) }}>
      <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Stats key" aria-label="Stats key" style={{ flex: 1, background: "#050a07", color: "var(--chalk)", border: "1px solid var(--line)", borderRadius: 10, padding: 12 }} />
      <button className="btn" style={{ width: "auto" }}>Load</button>
    </form>}
    {err && <p className="note">{err}</p>}
    {data && !data.configured && <p className="note">Tracking storage isn&apos;t connected yet: add Upstash Redis to the Vercel project (see CLAUDE.md).</p>}
    {data?.configured && <>
      <div className="sec">Totals</div>
      <div className="grid">
        <div className="rv"><div className="n">Players</div><div className="t">{fans.length.toLocaleString()}</div><div className="q">devices that picked a school</div></div>
        <div className="rv"><div className="n">Sets started</div><div className="t">{(tot.own + tot.other).toLocaleString()}</div><div className="q">{tot.done.toLocaleString()} finished</div></div>
        <div className="rv"><div className="n">Outside their school</div><div className="t">{pct(tot.other, tot.own + tot.other)}</div><div className="q">{tot.other.toLocaleString()} sets not involving the fan&apos;s team</div></div>
      </div>
      <div className="sec">By school</div>
      <table className="stats"><thead><tr><th>School</th><th>Players</th><th>Own sets</th><th>Other sets</th><th>% other</th></tr></thead>
        <tbody>{Object.entries(bySchool).sort((x, y) => y[1].players - x[1].players || y[1].own + y[1].other - (x[1].own + x[1].other)).map(([s, r]) =>
          <tr key={s}><td>{teamName(s)}</td><td>{r.players}</td><td>{r.own}</td><td>{r.other}</td><td>{pct(r.other, r.own + r.other)}</td></tr>)}</tbody></table>
      <div className="sec">By matchup</div>
      <table className="stats"><thead><tr><th>Matchup</th><th>Started</th><th>By own fans</th><th>By others</th><th>Avg pts</th></tr></thead>
        <tbody>{Object.entries(byGame).sort((x, y) => y[0].localeCompare(x[0])).map(([g, r]) =>
          <tr key={g}><td>{matchupName(g)}</td><td>{r.own + r.other}</td><td>{r.own}</td><td>{r.other}</td><td>{r.done ? Math.round(r.pts / r.done) : "–"}</td></tr>)}</tbody></table>
      <p className="note">Anonymous: one random ID per device, counted once per matchup. &quot;Own&quot; = the matchup includes the school the player picked.</p>
    </>}
    <Link className="back" href="/coach">← Coach</Link>
  </section>;
}
