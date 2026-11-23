"use client";
// Green-light controls on /coach/publish: status per set, approve one set or a whole week.
import { createContext, useContext, useEffect, useState } from "react";
import type { Question } from "@/lib/types";
import { formatOf, reviewQuestion } from "@/lib/review";
import { applyOrder, units } from "@/lib/order";

type State = { configured: boolean; approved: string[]; pending: string[]; stale: string[]; order: Record<string, string[]> };
type QS = "ok" | "work" | "reject";
type Reviews = Record<string, { s: QS; note?: string; t: string }>;
type Item = { sig: string; s: QS | null; note?: string };
type Ctx = { st: State | null; rv: Reviews; busy: boolean; act: (slugs: string[], approve: boolean) => void; reorder: (slug: string, order: string[]) => void;
  review: (slug: string, items: Item[]) => void; err: string | null };
const Ctx = createContext<Ctx>({ st: null, rv: {}, busy: false, act: () => {}, reorder: () => {}, review: () => {}, err: null });

export function PublishProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<State | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const [rv, setRv] = useState<Reviews>({});
  useEffect(() => {
    fetch("/api/approvals", { cache: "no-store" }).then(r => r.json()).then(setSt).catch(() => setErr("Couldn't load approvals."));
    fetch("/api/approvals/questions", { cache: "no-store" }).then(r => r.json()).then(d => setRv(d.reviews ?? {})).catch(() => {});
  }, []);
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
  const review = async (slug: string, items: Item[]) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/approvals/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, items }) });
      const d = await r.json();
      if (!r.ok) setErr(d.error === "storage not connected" ? "Storage isn't connected." : "Couldn't save the review.");
      else { setRv(d.reviews ?? {}); setSt(d) }
    } finally { setBusy(false) }
  };
  return <Ctx.Provider value={{ st, rv, busy, act, reorder, review, err }}>{children}</Ctx.Provider>;
}

export function StorageNote() {
  const { st, err } = useContext(Ctx);
  if (err) return <p className="note" style={{ color: "var(--bad, #e66)", textAlign: "left" }}>{err}</p>;
  if (st && !st.configured) return <p className="note" style={{ textAlign: "left" }}>⚠️ Storage isn&apos;t connected, so the buttons can&apos;t save yet. Until it is, tell Claude &quot;approve week of …&quot; (or name the matchups) and the approval is recorded in the code.</p>;
  return null;
}

const label = (st: State | null, slug: string) => !st ? "…" : st.approved.includes(slug) ? "🟢 Green-lit · live for players" : st.stale.includes(slug) ? "🟠 Changed since you approved it · needs review" : "🟡 Needs review · hidden from players";

const tally = (rv: Reviews, slug: string, sigs: string[]) => {
  const c = { ok: 0, work: 0, reject: 0, none: 0 };
  for (const s of sigs) c[rv[`${slug}|${s}`]?.s ?? "none"]++;
  return c;
};

export function SetStatus({ slug, sigs }: { slug: string; sigs: string[] }) {
  const { st, rv, busy, act, review } = useContext(Ctx), on = !!st?.approved.includes(slug);
  const c = tally(rv, slug, sigs), ready = c.ok === sigs.length;
  return <div style={{ margin: "6px 0 10px" }}>
    <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 700 }}>{label(st, slug)}</span>
      <button className={on ? "btn ghost" : "btn"} style={{ width: "auto", padding: "6px 14px" }} disabled={busy || !st || (!on && !ready)} onClick={() => act([slug], !on)}>{on ? "Pull back" : "Green light set"}</button>
    </div>
    <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      <span className="note" style={{ margin: 0 }}>Questions: ✅ {c.ok} · 🛠 {c.work} · ❌ {c.reject} · not reviewed {c.none}{!ready && !on ? " · green-light every question to publish the set" : ""}</span>
      {c.none > 0 && <button className="btn ghost" style={{ width: "auto", padding: "4px 12px", fontSize: 13 }} disabled={busy || !st}
        onClick={() => review(slug, sigs.filter(s => !rv[`${slug}|${s}`]).map(sig => ({ sig, s: "ok" as QS })))}>✅ Approve the {c.none} unreviewed</button>}
    </div>
  </div>;
}

export function WeekApprove({ sets }: { sets: { slug: string; sigs: string[] }[] }) {
  const { st, rv, busy, act } = useContext(Ctx);
  const left = st ? sets.filter(s => !st.approved.includes(s.slug)) : sets;
  const ready = left.filter(s => tally(rv, s.slug, s.sigs).ok === s.sigs.length);
  return <div className="row" style={{ alignItems: "center", gap: 8, margin: "4px 0 14px", flexWrap: "wrap" }}>
    <span>{st ? `${sets.length - left.length} of ${sets.length} green-lit` : "…"}</span>
    <button className="btn" style={{ width: "auto", padding: "6px 14px" }} disabled={busy || !st || !ready.length} onClick={() => act(ready.map(s => s.slug), true)}>
      Green light {ready.length ? `the ${ready.length} fully reviewed` : "sets once every question is reviewed"}</button>
  </div>;
}

/** Per-question review: green light, needs work (with a note), or reject. */
function QReviewBar({ slug, sig }: { slug: string; sig: string }) {
  const { st, rv, busy, review } = useContext(Ctx), cur = rv[`${slug}|${sig}`];
  const [mode, setMode] = useState<QS | null>(null), [note, setNote] = useState("");
  const off = busy || !st || !st.configured;
  const tone = cur?.s === "ok" ? "#3fbf7f" : cur?.s === "work" ? "#e0a800" : cur?.s === "reject" ? "#e5534b" : undefined;
  return <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.08)" }}>
    {cur && <div className="rd" style={{ color: tone, fontWeight: 700 }}>{cur.s === "ok" ? "✅ Green-lit" : cur.s === "work" ? "🛠 Needs work" : "❌ Rejected"}{cur.note ? `: ${cur.note}` : ""}</div>}
    {mode ? <div style={{ marginTop: 6 }}>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={mode === "work" ? "What needs to change? (e.g. the line is too high)" : "Why? (optional)"}
        style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 8, background: "rgba(0,0,0,.3)", color: "inherit", border: "1px solid rgba(255,255,255,.2)" }} />
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="btn" style={{ width: "auto", padding: "4px 12px", fontSize: 13 }} disabled={off || (mode === "work" && !note.trim())}
          onClick={() => { review(slug, [{ sig, s: mode, note: note.trim() || undefined }]); setMode(null); setNote("") }}>Save {mode === "work" ? "🛠 needs work" : "❌ reject"}</button>
        <button className="btn ghost" style={{ width: "auto", padding: "4px 12px", fontSize: 13 }} onClick={() => { setMode(null); setNote("") }}>Cancel</button>
      </div>
    </div>
    : <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
      <button className="btn ghost" style={{ width: "auto", padding: "4px 12px", fontSize: 13, borderColor: "#3fbf7f" }} disabled={off || cur?.s === "ok"} onClick={() => review(slug, [{ sig, s: "ok" }])}>✅ Green light</button>
      <button className="btn ghost" style={{ width: "auto", padding: "4px 12px", fontSize: 13, borderColor: "#e0a800" }} disabled={off} onClick={() => { setMode("work"); setNote(cur?.s === "work" ? cur.note ?? "" : "") }}>🛠 Needs work</button>
      <button className="btn ghost" style={{ width: "auto", padding: "4px 12px", fontSize: 13, borderColor: "#e5534b" }} disabled={off} onClick={() => { setMode("reject"); setNote(cur?.s === "reject" ? cur.note ?? "" : "") }}>❌ Reject</button>
      {cur && <button className="btn ghost" style={{ width: "auto", padding: "4px 12px", fontSize: 13 }} disabled={off} onClick={() => review(slug, [{ sig, s: null }])}>Clear</button>}
    </div>}
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
        <QReviewBar slug={slug} sig={q.sig} />
      </div> })}
    </li>)}</ol>
  </>;
}

/** Copies every needs-work / rejected question with its note, ready to paste to Claude. */
export function CopyNotes({ sets }: { sets: { slug: string; title: string; qs: { sig: string; prompt: string }[] }[] }) {
  const { rv } = useContext(Ctx), [done, setDone] = useState(false);
  const lines: string[] = [];
  for (const s of sets) s.qs.forEach((q, i) => {
    const r = rv[`${s.slug}|${q.sig}`];
    if (r && r.s !== "ok") lines.push(`${r.s === "work" ? "NEEDS WORK" : "REJECT"} · ${s.title} #${i + 1} (id ${q.sig.slice(0, 40)}): ${q.prompt}${r.note ? `\n  Note: ${r.note}` : ""}`);
  });
  if (!lines.length) return null;
  return <button className="btn" style={{ width: "auto", padding: "6px 14px", margin: "6px 0 10px" }}
    onClick={() => { navigator.clipboard?.writeText(lines.join("\n")).then(() => { setDone(true); setTimeout(() => setDone(false), 2500) }) }}>
    {done ? "Copied ✓ paste it to Claude" : `📋 Copy ${lines.length} note${lines.length > 1 ? "s" : ""} for Claude`}</button>;
}
