"use client";
// The play screen (spec §3 Play + Final). Works for frozen weekly sets (with saved progress) and Coach free play.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Progress, Question, SchoolKey } from "@/lib/types";
import { SCHOOL } from "@/lib/data";
import { fmt } from "@/lib/generators";
import { applyResult, correctAnswer, grade, POINTS, scoreRank } from "@/lib/scoring";
import { matchNames } from "@/lib/names";
import { store } from "@/lib/storage";
import { Dot } from "./Dot";

export interface PlayProps {
  questions: Question[];
  away?: SchoolKey | null;
  home?: SchoolKey | null;
  mode?: "weekly" | "dive" | "mix" | "round";
  storageKey?: string | null;   // weekly runs save progress here
  nextUnlock?: string | null;   // e.g. "Sun, Nov 22" for the final screen
  onExit: () => void;
  onAgain?: () => void;         // free play only
}

type Reveal = { ok: boolean; msg: ReactNode; correct: string; chosen: string };
const fresh = (n: number): Progress => ({ i: 0, pts: 0, streak: 0, best: 0, right: 0, n, done: false });

export function Play({ questions, away, home, mode = "weekly", storageKey, nextUnlock, onExit, onAgain }: PlayProps) {
  const n = questions.length;
  const [p, setP] = useState<Progress>(() => fresh(n));
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [finished, setFinished] = useState(false);
  const [loaded, setLoaded] = useState(!storageKey);

  // resume or show the finished run
  useEffect(() => {
    if (!storageKey) return;
    const sv = store.get(storageKey);
    if (sv?.done) { setP(sv); setFinished(true) }
    else if (sv) setP({ ...sv, i: Math.min(sv.i, n - 1), n });
    setLoaded(true);
  }, [storageKey, n]);

  const save = (np: Progress) => { if (storageKey) store.set(storageKey, np) };
  const q = questions[p.i];

  function settle(ok: boolean, base: number, msg: ReactNode, correct = "", chosen = "") {
    const np = applyResult(p, ok, base);
    const last = p.i + 1 >= n;
    setP(np);
    setReveal({ ok, msg, correct, chosen });
    // save as already answered so a reload can't replay this question; answering the last one completes the run
    save({ ...np, i: last ? p.i : p.i + 1, done: last });
  }

  function answer(v: string) {
    if (reveal || !q) return;
    const correct = correctAnswer(q), ok = v === correct, bonus = (q.trap || q.upset) && ok;
    settle(ok, ok ? POINTS.correct + (bonus ? POINTS.bonus : 0) : 0,
      <>{revealText(q)}{bonus && <><br /><b>+50 {q.upset ? "upset" : "trap"} bonus</b></>}</>, correct, v);
  }

  function next() {
    setReveal(null);
    if (p.i + 1 >= n) { setFinished(true); return }
    setP(x => ({ ...x, i: x.i + 1 }));
  }

  const addBonus = (pts: number) => {
    setP(x => { const np = { ...x, pts: x.pts + pts }; save({ ...np, i: x.i + 1 >= n ? x.i : x.i + 1, done: x.i + 1 >= n }); return np });
  };

  if (!loaded) return null;
  if (finished) return <Final p={p} n={n} weekly={mode === "weekly"} away={away} home={home} nextUnlock={nextUnlock} onExit={onExit} onAgain={onAgain} />;
  if (!q) return <p className="note">No questions available.</p>;

  return (
    <section>
      <div className="board">
        <div className="tm">{away ? <><Dot k={away} />{SCHOOL[away].name.toUpperCase()}</> : "SEC"}</div>
        <div className="sc">SCORE<b>{p.pts}</b></div>
        <div className="tm">{home ? <>{SCHOOL[home].name.toUpperCase()}<Dot k={home} /></> : mode === "dive" ? "DEEP DIVE" : "MIX"}</div>
      </div>
      <div className="prog"><i style={{ width: `${(p.i / n) * 100}%` }} /></div>
      <div className="qcard" key={p.i}>
        <QuestionBody q={q} reveal={reveal} onAnswer={answer} onRank={(ok, base, msg) => settle(ok, base, msg)} />
        {reveal && (
          <div className={`reveal show ${reveal.ok ? "good" : "bad"}`}>
            <b>{reveal.ok ? "TOUCHDOWN ✓" : "FUMBLE ✗"}</b><br />{reveal.msg}
          </div>
        )}
        {reveal && q.type === "count" ? <NameThem q={q} onDone={addBonus} onNext={next} last={p.i === n - 1} />
          : reveal && <div className="next show"><button className="btn" onClick={next}>{p.i === n - 1 ? "Final Whistle" : "Next Play →"}</button></div>}
      </div>
      <div className="streak">{p.streak > 1 ? `🔥 ${p.streak} in a row` : `Question ${p.i + 1} of ${n}`}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function kindLabel(q: Question) {
  switch (q.type) {
    case "prog": return `Program Pit · ${SCHOOL[q.a].name} vs ${SCHOOL[q.b].name}`;
    case "count": return `School Count · ${SCHOOL[q.a].name} vs ${SCHOOL[q.b].name}`;
    case "moment": return `Higher or Lower · ${q.label}`;
    case "rank": return `Rank It · ${q.label}`;
    case "h2h": return `Head to Head · ${q.label}`;
    case "duel": return `Blind Stat Duel · ${q.year}`;
    case "cross": return `Crossover · ${SCHOOL[q.a].name} × ${SCHOOL[q.b].name}`;
  }
}

const h2hFmt = (q: Extract<Question, { type: "h2h" }>, v: number) => (q.ypc ? v.toFixed(1) + " per carry" : `${fmt(v)}${q.unit ? " " + q.unit : ""}`);

function revealText(q: Question): ReactNode {
  switch (q.type) {
    case "prog": return `${SCHOOL[q.a].name} ${q.values[0]} · ${SCHOOL[q.b].name} ${q.values[1]}`;
    case "count": return `${SCHOOL[q.a].name} ${q.A.length} · ${SCHOOL[q.b].name} ${q.B.length}`;
    case "moment": return q.reveal;
    case "h2h": return <>{q.A.label}: {h2hFmt(q, q.A.value)} · {q.B.label}: {h2hFmt(q, q.B.value)}{q.note && <><br />{q.note}</>}</>;
    case "duel": return `${SCHOOL[q.aSchool].name}: ${q.aName} (${q.A.big}). ${SCHOOL[q.other].name}: ${q.bName} (${q.B.big}).`;
    case "cross": return q.reveal;
    case "rank": return "";
  }
}

function Opt({ v, reveal, onAnswer, children }: { v: string; reveal: Reveal | null; onAnswer: (v: string) => void; children: ReactNode }) {
  const cls = reveal ? (v === reveal.correct ? " ok" : v === reveal.chosen ? " no" : "") : "";
  return <button className={"opt" + cls} disabled={!!reveal} onClick={() => onAnswer(v)}>{children}</button>;
}

function QuestionBody({ q, reveal, onAnswer, onRank }: { q: Question; reveal: Reveal | null; onAnswer: (v: string) => void; onRank: (ok: boolean, base: number, msg: ReactNode) => void }) {
  const o = (v: string, c: ReactNode) => <Opt key={v} v={v} reveal={reveal} onAnswer={onAnswer}>{c}</Opt>;
  const head = <div className="kind">{kindLabel(q)}{!q.verified && <span className="chip">UNVERIFIED</span>}</div>;
  switch (q.type) {
    case "prog":
    case "count":
      return <>{head}
        <div className="prompt">{q.type === "prog" ? q.prompt : `Which school has more ${fmt(q.threshold)}-yard career rushers?`}</div>
        <div className="opts two">{o("a", <><Dot k={q.a} />{SCHOOL[q.a].name}</>)}{o("b", <><Dot k={q.b} />{SCHOOL[q.b].name}</>)}</div>
        <div className="opts" style={{ marginTop: 10 }}>{o("t", "Tied")}</div></>;
    case "moment":
      return <>{head}
        {q.game && <div className="game"><div className="d">{q.game.date}</div>
          <div className="s"><Dot k={q.game.winner} /> {SCHOOL[q.game.winner].name} {q.game.ws}, {SCHOOL[q.game.loser].name} {q.game.ls}{q.game.ot ? " (OT)" : ""}</div>
          <div className="v">{q.game.venue}</div></div>}
        <div className="prompt">{q.prompt}</div><div className="line">{q.line}</div>
        <div className="opts two">{o("over", "▲ More")}{o("under", "▼ Less")}</div></>;
    case "h2h": {
      const [L, R] = q.flip ? [q.B, q.A] : [q.A, q.B];
      return <>{head}<div className="prompt">{q.prompt}</div><div className="opts">{o(L.label, L.label)}{o(R.label, R.label)}</div></>;
    }
    case "duel": {
      const [L, R] = q.flip ? [q.B, q.A] : [q.A, q.B];
      return <>{head}
        <div className="prompt">{q.year} {q.stat.toLowerCase()} for each school. Which line belongs to <b>{SCHOOL[q.aSchool].name}</b>?</div>
        <div className="blind">
          <div className="bl"><div className="h">PLAYER X</div><div className="big">{L.big}</div><div className="sm">{L.sm}</div></div>
          <div className="bl"><div className="h">PLAYER Y</div><div className="big">{R.big}</div><div className="sm">{R.sm}</div></div>
        </div>
        <div className="opts two">{o("x", "Player X")}{o("y", "Player Y")}</div></>;
    }
    case "cross":
      return <>{head}<div className="prompt">{q.prompt}</div><div className="opts">{q.order.map(i => o(String(i), q.options[i]))}</div></>;
    case "rank":
      return <>{head}<RankIt q={q} locked={!!reveal} onLock={onRank} /></>;
  }
}

function RankIt({ q, locked, onLock }: { q: Extract<Question, { type: "rank" }>; locked: boolean; onLock: (ok: boolean, base: number, msg: ReactNode) => void }) {
  const [picks, setPicks] = useState<number[]>([]);
  const display = useMemo(() => q.items.map((_, i) => i).sort((a, b) => (hashIdx(q.prompt, a) - hashIdx(q.prompt, b))), [q]);
  const result = locked ? scoreRank(q, picks) : null;
  function lock() {
    const r = scoreRank(q, picks);
    const msg = <>Correct order: {r.order.map((i, s) => `${s + 1}. ${q.items[i].label} (${fmt(q.items[i].value)})`).join(" · ")}
      {!r.perfect && <><br />You had {r.hits} of {q.items.length} in the right spot (+{r.hits * POINTS.rankSlot}).</>}
      {q.note && <><br />{q.note}</>}{r.perfect && q.trap && <><br /><b>+50 trap bonus</b></>}</>;
    onLock(r.perfect, r.base, msg);
  }
  return <>
    <div className="prompt">{q.prompt}</div>
    <div className="opts">{display.map(i => {
      const slot = picks.indexOf(i), good = result ? result.order[slot] === i : false;
      return <button key={i} className={"opt rk" + (result ? (good ? " ok" : " no") : "")} disabled={locked}
        onClick={() => !picks.includes(i) && setPicks([...picks, i])}>
        <span className={"badge" + (slot < 0 ? " empty" : "")}>{slot < 0 ? "" : slot + 1}</span>{q.items[i].label}
        <span className="val">{locked ? `${fmt(q.items[i].value)} ${q.unit}` : ""}</span></button>;
    })}</div>
    <div className="row">
      <button className="btn ghost" disabled={locked} onClick={() => setPicks([])}>Reset</button>
      <button className="btn" disabled={locked || picks.length !== q.items.length} onClick={lock}>Lock In</button>
    </div>
  </>;
}
// Stable display order for rank items (not sorted by value, same on every render and device).
function hashIdx(s: string, i: number) { let h = 2166136261; for (const c of s + i) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

function NameThem({ q, onDone, onNext, last }: { q: Extract<Question, { type: "count" }>; onDone: (pts: number) => void; onNext: () => void; last: boolean }) {
  const people = [...q.A.map(x => ({ ...x, t: q.a })), ...q.B.map(x => ({ ...x, t: q.b }))];
  const [text, setText] = useState("");
  const [hit, setHit] = useState<Set<string> | null>(null);
  if (!people.length) return <div className="next show"><button className="btn" onClick={onNext}>{last ? "Final Whistle" : "Next Play →"}</button></div>;
  const submit = (input: string) => { const h = matchNames(input, people); setHit(h); onDone(h.size * POINTS.name) };
  const list = (k: SchoolKey) => people.filter(x => x.t === k);
  return <div className="bonus">
    <div className="kind">Bonus · Name Them</div>
    <div className="prompt" style={{ fontSize: 15, margin: "6px 0 10px" }}>Name as many of the {people.length} as you can, from either school. +25 each. Last names are fine.</div>
    <textarea rows={3} value={text} disabled={!!hit} onChange={e => setText(e.target.value)} placeholder="e.g. Jackson, Fournette, ..." aria-label="Names" />
    {!hit && <div className="row"><button className="btn ghost" onClick={() => submit("")}>Skip</button><button className="btn" onClick={() => submit(text)}>Submit</button></div>}
    {hit && <>
      <div className={`reveal show ${hit.size ? "good" : "bad"}`}>
        <b>{hit.size} of {people.length} named · +{hit.size * POINTS.name}</b>
        {[q.a, q.b].map(k => <div key={k} style={{ marginTop: 10 }}><b>{SCHOOL[k].name}</b>
          {list(k).length ? list(k).map(x => <div key={x.name}>{hit.has(x.name) ? "✅" : "▫️"} {x.name} ({fmt(x.yards)}{x.active ? ", active" : ""})</div>) : <div>None</div>}</div>)}
      </div>
      <div className="next show"><button className="btn" onClick={onNext}>{last ? "Final Whistle" : "Next Play →"}</button></div>
    </>}
  </div>;
}

function Final({ p, n, weekly, away, home, nextUnlock, onExit, onAgain }: { p: Progress; n: number; weekly: boolean; away?: SchoolKey | null; home?: SchoolKey | null; nextUnlock?: string | null; onExit: () => void; onAgain?: () => void }) {
  return <section className="final">
    <div className="kind">Final</div>
    <div className="big">{p.pts}</div>
    <p>{p.right}/{n} correct · best streak {p.best}<br />{grade(n ? p.right / n : 0)}
      {weekly && away && home && <><br /><br />That&apos;s this week&apos;s set for {SCHOOL[away].name} vs {SCHOOL[home].name}.{nextUnlock ? ` New matchups unlock ${nextUnlock}.` : ""}</>}</p>
    {!weekly && onAgain && <><button className="btn" onClick={onAgain}>Run It Back</button><div style={{ height: 10 }} /></>}
    <button className="btn ghost" onClick={onExit}>{weekly ? "Back to This Week" : "Back"}</button>
  </section>;
}
