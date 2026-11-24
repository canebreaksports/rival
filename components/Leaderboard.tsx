"use client";
// Public school leaderboard: which fan bases have played the most this season.
import Link from "next/link";
import { useEffect, useState } from "react";
import { teamName, TEAM } from "@/lib/teams";
import { getFan } from "@/lib/fan";

type Row = { school: string; entries: number; players: number; avg: number };
export function Leaderboard() {
  const [d, setD] = useState<{ configured: boolean; rows: Row[]; entries: number } | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  useEffect(() => { setMine(getFan()?.school ?? null); fetch("/api/leaderboard").then(r => r.json()).then(setD).catch(() => setD({ configured: true, rows: [], entries: 0 })) }, []);
  return <section>
    <h1>PIT<span>T</span>ED</h1>
    <div className="tag">School Leaderboard</div>
    <p className="note" style={{ textAlign: "left" }}>Every completed game counts as an entry for the school its player picked. Which fan base plays the most?</p>
    {!d ? <p className="note">Loading…</p> : !d.rows.length ? <p className="note">No entries yet. Be the first: play this week&apos;s matchup.</p> :
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead><tr style={{ textAlign: "left", opacity: 0.7 }}><th style={{ padding: "6px 4px" }}>#</th><th>School</th><th style={{ textAlign: "right" }}>Entries</th><th style={{ textAlign: "right" }}>Players</th><th style={{ textAlign: "right" }}>Avg pts</th></tr></thead>
        <tbody>{d.rows.map((r, i) => <tr key={r.school} style={{ borderTop: "1px solid rgba(255,255,255,.08)", fontWeight: r.school === mine ? 800 : 400, background: r.school === mine ? "rgba(255,200,60,.08)" : undefined }}>
          <td style={{ padding: "8px 4px" }}>{i + 1}</td>
          <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: TEAM[r.school]?.color ?? "#888", marginRight: 6 }} />{teamName(r.school)}{r.school === mine ? " (you)" : ""}</td>
          <td style={{ textAlign: "right" }}>{r.entries.toLocaleString("en-US")}</td><td style={{ textAlign: "right" }}>{r.players.toLocaleString("en-US")}</td><td style={{ textAlign: "right" }}>{r.avg ? r.avg.toLocaleString("en-US") : "—"}</td></tr>)}</tbody>
      </table>}
    {d?.rows.length ? <p className="note">{d.entries.toLocaleString("en-US")} entries so far. Updates about once a minute.</p> : null}
    <Link className="back" href="/">← This Week</Link>
  </section>;
}
