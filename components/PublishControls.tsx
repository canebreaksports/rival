"use client";
// Green-light controls on /coach/publish: status per set, approve one set or a whole week.
import { createContext, useContext, useEffect, useState } from "react";
import type { Question } from "@/lib/types";
import { formatOf, reviewQuestion } from "@/lib/review";
import { applyOrder, units } from "@/lib/order";

type State = { configured: boolean; approved: string[]; pending: string[]; stale: string[]; order: Record<string, string[]> };
type Ctx = { st: State | null; busy: boolean; act: (slugs: string[], approve: boolean) => void; reorder: (slug: string, order: string[]) => void; err: string | null };
const Ctx = createContext<Ctx>({ st: null, busy: false, act: () => {}, reorder: () => {}, err: null });

export function PublishProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<State | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/approvals", { cache: "no-store" }).then(r => r.json()).then(setSt).catch(() => setErr("Couldn't load approvals.")) }, []);
  const act = async (slugs: string[], approve: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slugs, approve }) });
      const d = await r.json();
      if (!r.ok) setErr(d.error === "storage not connected" ? "Storage isn't connected yet: tell Claude which sets to approve, or connect Upstash in Vercel." : "Couldn't save.");
      else setSt(d);
    } finally { setBusy(false) }
  };
  const reorder = async (slug: string, order: string[]) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/approvals/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, order }) });
      const d = await r.json();
      if (!r.ok) setErr("Couldn't save the new order."); else setSt(d);
    } finally { setBusy(false) }
  };
  return <Ctx.Provider value={{ st, busy, act, reorder, err }}>{children}</Ctx.Provider>;
}

export function StorageNote() {
  const { st, err } = useContext(Ctx);
  if (err) return <p className="note" style={{ color: "var(--bad, #e66)", textAlign: "left" }}>{err}</p>;
  if (st && !st.configured) return <p className="note" style={{ textAlign: "left" }}>⚠️ Storage isn&apos;t connected, so the buttons can&apos;t save yet. Until it is, tell Claude &quot;approve week of …&quot; (or name the matchups) and the approval is recorded in the code.</p>;
  return null;
}

const label = (st: State | null, slug: string) => !st ? "…" : st.approved.includes(slug) ? "🟢 Green-lit · live for players" : st.stale.includes(slug) ? "🟠 Changed since you approved it · needs review" : "🟡 Needs review · hidden from players";

export function SetStatus({ slug }: { slug: string }) {
  const { st, busy, act } = useContext(Ctx), on = !!st?.approved.includes(slug);
  return <div className="row" style={{ alignItems: "center", gap: 8, margin: "6px 0 10px", flexWrap: "wrap" }}>
    <span style={{ fontWeight: 700 }}>{label(st, slug)}</span>
    <button className={on ? "btn ghost" : "btn"} style={{ width: "auto", padding: "6px 14px" }} disabled={busy || !st} onClick={() => act([slug], !on)}>{on ? "Pull back" : "Green light"}</button>
  </div>;
}

export function WeekApprove({ slugs }: { slugs: string[] }) {
  const { st, busy, act } = useContext(Ctx);
  const left = st ? slugs.filter(s => !st.approved.includes(s)) : slugs;
  return <div className="row" style={{ alignItems: "center", gap: 8, margin: "4px 0 14px", flexWrap: "wrap" }}>
    <span>{st ? `${slugs.length - left.length} of ${slugs.length} green-lit` : "…"}</span>
    <button className="btn" style={{ width: "auto", padding: "6px 14px" }} disabled={busy || !st || !left.length} onClick={() => act(left, true)}>Green light all {left.length || ""}</button>
  </div>;
}

/** A set's questions in the saved order, with ▲/▼ to move them (paired questions move together). */
export function SetQuestions({ slug, questions }: { slug: string; questions: Question[] }) {
  const { st, busy, reorder } = useContext(Ctx);
  const ordered = applyOrder(questions, st?.order[slug]), U = units(ordered);
  const locked = !st || !st.configured || st.approved.includes(slug);
  const move = (i: number, d: -1 | 1) => { const u = [...U]; [u[i], u[i + d]] = [u[i + d], u[i]]; reorder(slug, u.flat().map(q => q.sig)) };
  let n = 0;
  return <>
    {st?.approved.includes(slug) && <p className="note" style={{ textAlign: "left", margin: "0 0 6px" }}>To reorder, pull it back first (then green-light it again).</p>}
    <ol style={{ listStyle: "none", paddingLeft: 0 }}>{U.map((u, i) => <li key={u[0].sig} style={{ position: "relative" }}>
      <div className="row" style={{ justifyContent: "flex-end", gap: 6, margin: "4px 0" }}>
        <button className="btn ghost" style={{ width: "auto", padding: "2px 12px" }} aria-label="Move up" disabled={busy || locked || i === 0} onClick={() => move(i, -1)}>▲</button>
        <button className="btn ghost" style={{ width: "auto", padding: "2px 12px" }} aria-label="Move down" disabled={busy || locked || i === U.length - 1} onClick={() => move(i, 1)}>▼</button>
      </div>
      {u.map(q => { const r = reviewQuestion(q); n++; return <div key={q.sig} className="qcard">
        <div className="kind">{n}. {r.kind}{r.flags.map(fl => <span key={fl} className="chip" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>{fl}</span>)}</div>
        <div className="rd" style={{ opacity: 0.75 }}>{formatOf(q)}</div>
        <div className="rq">{r.prompt}</div>
        {r.options && q.type !== "rank" && <div className="ro">{r.options.join(" / ")}</div>}
        <div className="ra" style={{ whiteSpace: "pre-line" }}>{r.answer}</div>
        {r.detail && <div className="rd" style={{ whiteSpace: "pre-line" }}>{r.detail}</div>}
        {q.info && <div className="rd">ⓘ {q.info.title}: {q.info.text}</div>}
        {q.more?.rows.length ? <div className="rd">More · {q.more.title}: {q.more.rows.join(" · ")}</div> : null}
        <div className="rd" style={{ opacity: 0.5, fontSize: 12 }}>id: {q.sig.slice(0, 40)}</div>
      </div> })}
    </li>)}</ol>
  </>;
}
