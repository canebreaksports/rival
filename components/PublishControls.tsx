"use client";
// Green-light controls on /coach/publish: status per set, approve one set or a whole week.
import { createContext, useContext, useEffect, useState } from "react";

type State = { configured: boolean; approved: string[]; pending: string[]; stale: string[] };
const Ctx = createContext<{ st: State | null; busy: boolean; act: (slugs: string[], approve: boolean) => void; err: string | null }>({ st: null, busy: false, act: () => {}, err: null });

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
  return <Ctx.Provider value={{ st, busy, act, err }}>{children}</Ctx.Provider>;
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
