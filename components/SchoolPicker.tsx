"use client";
// Choose your school: search box + schools grouped by conference + "Other school".
import { useMemo, useState } from "react";
import { CONFERENCES, OTHER, TEAMS } from "@/lib/teams";

export function SchoolPicker({ onPick, current }: { onPick: (k: string) => void; current?: string | null }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? TEAMS.filter(t => (t.name + " " + t.mascot).toLowerCase().includes(s)) : TEAMS }, [q]);
  return <div className="picker">
    <div className="sec" style={{ marginTop: 0 }}>Pick your school</div>
    <p className="note" style={{ margin: "0 0 10px", textAlign: "left" }}>So we can see which fan bases are playing. You can change it anytime.</p>
    <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search schools" aria-label="Search schools" autoFocus />
    {CONFERENCES.map(c => { const l = list.filter(t => t.conference === c); return l.length ? <div key={c}>
      <div className="pconf">{c}</div>
      <div className="pgrid">{l.map(t => <button key={t.key} className={"pteam" + (t.key === current ? " on" : "")} onClick={() => onPick(t.key)}>
        <span className="dot" style={{ background: t.color }} aria-hidden="true" />{t.name}</button>)}</div>
    </div> : null })}
    <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => onPick(OTHER)}>Other school</button>
  </div>;
}
