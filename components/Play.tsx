"use client";
// The play screen (spec §3 Play + Final). Works for frozen weekly sets (with saved progress) and Coach free play.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Progress, Question, SchoolKey } from "@/lib/types";
import { SCHOOL } from "@/lib/schools";
import { fmt } from "@/lib/generators";
import { applyResult, correctAnswer, grade, POINTS, scoreRank } from "@/lib/scoring";
import { matchOne } from "@/lib/names";
import { initials } from "@/lib/profile";
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
  onFinish?: (p: Progress) => void; // called once when a run is completed (not when reopening a finished run)
}

type Reveal = { ok: boolean; msg: ReactNode; correct: string; chosen: string };
const fresh = (n: number): Progress => ({ i: 0, pts: 0, streak: 0, best: 0, right: 0, n, done: false });

export function Play({ questions, away, home, mode = "weekly", storageKey, nextUnlock, onExit, onAgain, onFinish }: PlayProps) {
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
    const mark = ok ? "✅" : base > 0 ? "🟨" : "❌"; // 🟨 = partial credit (rank)
    const scored = applyResult(p, ok, base), qpts = [...(p.qpts ?? [])];
    qpts[p.i] = scored.pts - p.pts;
    const np = { ...scored, marks: (p.marks ?? "") + mark, qpts };
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
    if (p.i + 1 >= n) { setFinished(true); onFinish?.(p); return }
    setP(x => ({ ...x, i: x.i + 1 }));
  }

  // after a question is answered, progress is saved as already past it (see settle)
  const savePast = (np: Progress) => save({ ...np, i: np.i + 1 >= n ? np.i : np.i + 1, done: np.i + 1 >= n });
  const addBonus = (pts: number) => setP(x => {
    const qpts = [...(x.qpts ?? [])]; qpts[x.i] = (qpts[x.i] ?? 0) + pts;
    const np = { ...x, pts: x.pts + pts, qpts }; savePast(np); return np;
  });
  // each hint costs 10 points, charged to the current question
  const addHint = () => setP(x => {
    const qpts = [...(x.qpts ?? [])]; qpts[x.i] = (qpts[x.i] ?? 0) + POINTS.hint;
    const np = { ...x, pts: x.pts + POINTS.hint, hints: (x.hints ?? 0) + 1, qpts }; savePast(np); return np;
  });

  if (!loaded) return null;
  if (finished) return <Final p={p} n={n} questions={questions} weekly={mode === "weekly"} away={away} home={home} nextUnlock={nextUnlock} onExit={onExit} onAgain={onAgain} />;
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
        {reveal && q.type === "count" ? <NameThem q={q} onDone={addBonus} onHint={addHint} onNext={next} last={p.i === n - 1} />
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
    case "moment": return q.pair ? `Higher or Lower · Side by Side ${q.pairPart} of 2` : `Higher or Lower · ${q.label}`;
    case "rank": return `Rank It · ${q.label}`;
    case "h2h": return `Head to Head · ${q.label}`;
    case "duel": return `Blind Stat Duel · ${q.year}`;
    case "cross": return `Crossover · ${SCHOOL[q.a].name} × ${SCHOOL[q.b].name}`;
    case "mc": return q.label;
  }
}

function GameBoxView({ game }: { game?: Extract<Question, { type: "moment" }>["game"] }) {
  if (!game) return null;
  return <div className="game"><div className="d">{game.date}</div>
    <div className="s"><Dot k={game.winner} /> {SCHOOL[game.winner].name} {game.ws}, {SCHOOL[game.loser].name} {game.ls}{game.ot ? " (OT)" : ""}</div>
    <div className="v">{game.venue}</div></div>;
}

const h2hFmt = (q: Extract<Question, { type: "h2h" }>, v: number) => (q.ypc ? v.toFixed(1) + " per carry" : `${fmt(v)}${q.unit ? " " + q.unit : ""}`);

function revealText(q: Question): ReactNode {
  switch (q.type) {
    case "prog": return `${SCHOOL[q.a].name} ${q.values[0]} · ${SCHOOL[q.b].name} ${q.values[1]}`;
    case "count": return `${SCHOOL[q.a].name} ${q.A.length} · ${SCHOOL[q.b].name} ${q.B.length}`;
    case "moment": return q.reveal;
    case "h2h": return <>{q.A.label}: {h2hFmt(q, q.A.value)} · {q.B.label}: {h2hFmt(q, q.B.value)}{q.note && <><br />{q.note}</>}</>;
    case "duel": return `${SCHOOL[q.aSchool].name}: ${q.aName} (${q.A.big}). ${SCHOOL[q.other].name}: ${q.bName} (${q.B.big}).`;
    case "cross": case "mc": return q.reveal;
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
        <div className="prompt">{q.type === "prog" ? q.prompt : q.prompt ?? `Which school has more ${fmt(q.threshold)}-yard career rushers?`}</div>
        <div className="opts two">{o("a", <><Dot k={q.a} />{SCHOOL[q.a].name}</>)}{o("b", <><Dot k={q.b} />{SCHOOL[q.b].name}</>)}</div>
        <div className="opts" style={{ marginTop: 10 }}>{o("t", "Tied")}</div></>;
    case "moment":
      return <>{head}
        <GameBoxView game={q.game} />
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
    case "mc":
      return <>{head}{q.type === "mc" && <GameBoxView game={q.game} />}<div className="prompt">{q.prompt}</div><div className="opts">{q.order.map(i => o(String(i), q.options[i]))}</div></>;
    case "rank":
      return <>{head}<GameBoxView game={q.game} /><RankIt q={q} locked={!!reveal} onLock={onRank} /></>;
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

function NameThem({ q, onDone, onHint, onNext, last }: { q: Extract<Question, { type: "count" }>; onDone: (pts: number) => void; onHint: () => void; onNext: () => void; last: boolean }) {
  // Every occurrence is its own slot: a player with two qualifying seasons (or games) has to be named twice.
  const slots = [...q.A.map(x => ({ ...x, t: q.a })), ...q.B.map(x => ({ ...x, t: q.b }))];
  const unique = [...new Map(slots.map(x => [x.t + "|" + x.name, x])).values()];
  const MISSES = 3;
  const [text, setText] = useState("");
  const [filled, setFilled] = useState<number[]>([]);      // slot indexes, in the order named
  const [hinted, setHinted] = useState<number[]>([]);      // slot indexes whose year has been revealed
  const [profiled, setProfiled] = useState<number[]>([]);  // slot indexes whose profile has been revealed (2nd hint)
  const [lettered, setLettered] = useState<number[]>([]);  // slot indexes whose initials have been revealed (3rd hint)
  const [misses, setMisses] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "good" | "bad" | "info"; text: string } | null>(null);
  const [over, setOver] = useState(false);
  if (!slots.length) return <div className="next show"><button className="btn" onClick={onNext}>{last ? "Final Whistle" : "Next Play →"}</button></div>;
  const hasYears = slots.some(x => x.season);
  const finish = (f: number[]) => { setOver(true); onDone(f.length * POINTS.name) };
  const openFor = (name: string, f: number[]) => slots.map((x, i) => i).filter(i => slots[i].name === name && !f.includes(i));
  // players whose every slot is filled count as "already named"
  const done = new Set(unique.filter(u => openFor(u.name, filled).length === 0).map(u => u.name));

  // one guess at a time: hits score, repeats and "which one?" are free, 3 misses ends it
  function guess(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || over) return;
    const g = matchOne(text, unique, done);
    setText("");
    if (g.status === "hit") {
      const open = openFor(g.name, filled);
      const i = open.find(j => hinted.includes(j)) ?? open[0]; // fill a hinted slot first
      const f = [...filled, i];
      setFilled(f);
      const left = openFor(g.name, f).length;
      setMsg({ tone: "good", text: `✅ ${g.name}${slots[i].season ? ` (${slots[i].season})` : ""} · +${POINTS.name}${left ? ` — he's on the list ${left} more time${left > 1 ? "s" : ""}` : ""}` });
      if (f.length === slots.length) finish(f);
    } else if (g.status === "dup") setMsg({ tone: "info", text: `Already named every ${g.name} entry.` });
    else if (g.status === "ambiguous") setMsg({ tone: "info", text: `Which one? Add a first name: ${g.options.join(" or ")}.` });
    else {
      const m = [...misses, text.trim()];
      setMisses(m);
      setMsg({ tone: "bad", text: `❌ “${text.trim()}” isn't on the list.` });
      if (m.length >= MISSES) finish(filled);
    }
  }
  // Hint 1 reveals the year of one more open slot; hint 2 adds a brief profile of that same player.
  // No point cost: hints are counted and shown on the final screen and in shared results.
  const open = (i: number) => !filled.includes(i);
  const nextHint = slots.map((_, i) => i).find(i => open(i) && !hinted.includes(i) && !profiled.includes(i));
  const profileTarget = [...hinted].reverse().find(i => open(i) && !profiled.includes(i) && slots[i].profile)
    ?? (!hasYears ? slots.map((_, i) => i).find(i => open(i) && !profiled.includes(i) && slots[i].profile) : undefined);
  const hint = () => { if (nextHint != null) { setHinted([...hinted, nextHint]); onHint() } };
  const hintProfile = () => { if (profileTarget != null) { setProfiled([...profiled, profileTarget]); onHint() } };
  const initialsTarget = [...profiled].reverse().find(i => open(i) && !lettered.includes(i));
  const hintInitials = () => { if (initialsTarget != null) { setLettered([...lettered, initialsTarget]); onHint() } };

  const bySchool = (k: SchoolKey) => slots.map((x, i) => ({ ...x, i })).filter(x => x.t === k);
  const slotView = (x: (typeof slots)[0] & { i: number }) =>
    filled.includes(x.i) ? <span key={x.i} className="slot ok">{x.name}{x.season ? ` ’${String(x.season).slice(2)}` : ""}</span>
      : (hinted.includes(x.i) || profiled.includes(x.i)) && x.season ? <span key={x.i} className="slot hint">? · {x.season}{profiled.includes(x.i) ? " 💡" : ""}</span>
      : profiled.includes(x.i) ? <span key={x.i} className="slot hint">? 💡</span>
      : <span key={x.i} className="slot" aria-label="unnamed">▢</span>;
  return <div className="bonus">
    <div className="kind">Bonus · Name Them</div>
    <div className="hintnote">Hints: year, then profile, then initials · {POINTS.hint} each</div>
    <div className="prompt" style={{ fontSize: 15, margin: "6px 0 10px" }}>
      Name all {slots.length} one at a time, from either school{hasYears && slots.length !== unique.length ? " (a player on the list twice must be named twice)" : ""}. +{POINTS.name} each, hints {POINTS.hint}. Last names are fine. {MISSES} misses and you&apos;re out.</div>
    {!over && <>
      <div className="tally" aria-live="polite">
        <span>{filled.length} of {slots.length} named</span>
        <span aria-label={`${misses.length} of ${MISSES} misses`}>{Array.from({ length: MISSES }, (_, i) => (i < misses.length ? "✗" : "○")).join(" ")}</span>
      </div>
      {[q.a, q.b].map(k => <div key={k} className="slots"><b>{SCHOOL[k].name}</b> {bySchool(k).length ? bySchool(k).map(slotView) : <span className="slot">none</span>}</div>)}
      <form className="row" onSubmit={guess}>
        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Fournette" aria-label="Player name"
          autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="go" autoFocus />
        <button className="btn" type="submit" style={{ width: "auto" }}>Enter</button>
      </form>
      {profiled.filter(open).map(i => <div key={i} className="profile">💡 {slots[i].profile}{lettered.includes(i) ? ` · initials ${initials(slots[i].name)}` : ""}</div>)}
      {msg && <div className={`guess ${msg.tone}`} role="status">{msg.text}</div>}
      <div className="row">
        {hasYears && <button className="btn ghost" disabled={nextHint == null} onClick={hint}>Year {POINTS.hint}</button>}
        <button className="btn ghost" disabled={profileTarget == null} onClick={hintProfile} title={hasYears ? "Profile of the player behind your latest year hint" : "Profile of an unnamed player"}>Profile {POINTS.hint}</button>
        <button className="btn ghost" disabled={initialsTarget == null} onClick={hintInitials} title="Initials of the player behind your latest profile hint">Initials {POINTS.hint}</button>
        </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => finish(filled)}>I&apos;m done</button>
    </>}
    {over && <>
      <div className={`reveal show ${filled.length ? "good" : "bad"}`}>
        <b>{filled.length} of {slots.length} named · +{filled.length * POINTS.name}</b>
        {[q.a, q.b].map(k => <div key={k} style={{ marginTop: 10 }}><b>{SCHOOL[k].name}</b>
          {bySchool(k).length ? bySchool(k).map(x => <div key={x.i}>{filled.includes(x.i) ? "✅" : "▫️"} {x.name}{x.season ? ` ${x.season}` : ""} ({x.label ?? fmt(x.yards)}{x.active ? ", active" : ""})</div>) : <div>None</div>}</div>)}
      </div>
      <div className="next show"><button className="btn" onClick={onNext}>{last ? "Final Whistle" : "Next Play →"}</button></div>
    </>}
  </div>;
}

function Final({ p, n, questions, weekly, away, home, nextUnlock, onExit, onAgain }: { p: Progress; n: number; questions: Question[]; weekly: boolean; away?: SchoolKey | null; home?: SchoolKey | null; nextUnlock?: string | null; onExit: () => void; onAgain?: () => void }) {
  const [shared, setShared] = useState<string | null>(null);
  const hints = p.hints ?? 0;
  const hintText = hints ? `💡 ${hints} hint${hints > 1 ? "s" : ""} used (${hints * POINTS.hint} pts)` : "💡 No hints";
  async function share() {
    const title = away && home ? `${SCHOOL[away].name} ${weekly ? "@" : "vs"} ${SCHOOL[home].name}` : "SEC Mix";
    const text = [`RIVAL by Canebreak · ${title}`, p.marks ?? "", `${p.pts} pts · ${p.right}/${n} · 🔥 best streak ${p.best}`, hintText].filter(Boolean).join("\n");
    const url = typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (navigator.share) { await navigator.share({ title: "RIVAL by Canebreak", text, url }); setShared("Shared") }
      else { await navigator.clipboard.writeText(`${text}\n${url}`); setShared("Copied to clipboard") }
    } catch { setShared(null) } // share sheet dismissed
  }
  return <section className="final">
    <div className="kind">Final</div>
    <div className="big">{p.pts}</div>
    {p.marks && <div className="marks" aria-label="Question results">{p.marks}</div>}
    <p>{p.right}/{n} correct · best streak {p.best}<br />{hintText}<br />{grade(n ? p.right / n : 0)}
      {weekly && away && home && <><br /><br />That&apos;s this week&apos;s set for {SCHOOL[away].name} vs {SCHOOL[home].name}.{nextUnlock ? ` New matchups unlock ${nextUnlock}.` : ""}</>}</p>
    <button className="btn" onClick={share}>Share Results</button>
    <Breakdown p={p} questions={questions} />
    {shared && <div className="note" style={{ marginTop: 8 }}>{shared}</div>}
    <div style={{ height: 10 }} />
    {!weekly && onAgain && <><button className="btn ghost" onClick={onAgain}>Run It Back</button><div style={{ height: 10 }} /></>}
    <button className="btn ghost" onClick={onExit}>{weekly ? "Back to This Week" : "Back"}</button>
  </section>;
}

/** Your results, question by question: type, prompt, ✅/🟨/❌ and points earned. Never the correct answers. */
function Breakdown({ p, questions }: { p: Progress; questions: Question[] }) {
  const marks = [...(p.marks ?? "").matchAll(/✅|🟨|❌/gu)].map(m => m[0]);
  if (!marks.length) return null;
  const what = (q: Question) => q.type === "count" ? (q.prompt ?? `Which school has more ${fmt(q.threshold)}-yard career rushers?`)
    : q.type === "duel" ? `${q.year} ${q.stat.toLowerCase()}: which line belongs to ${SCHOOL[q.aSchool].name}?`
    : `${"game" in q && q.game ? `${q.game.date} (${SCHOOL[q.game.winner].name} ${q.game.ws}, ${SCHOOL[q.game.loser].name} ${q.game.ls}): ` : ""}${q.prompt}${q.type === "moment" ? " " + q.line : ""}`;
  return <details className="breakdown" open>
    <summary>Your results</summary>
    <ol>{questions.map((q, i) => <li key={i}>
      <span className="bm">{marks[i] ?? "–"}</span>
      <span className="bq"><span className="kind">{kindLabel(q)}</span>{what(q)}</span>
      <span className="bp">{p.qpts?.[i] != null ? `${p.qpts[i] >= 0 ? "+" : ""}${p.qpts[i]}` : ""}</span>
    </li>)}</ol>
  </details>;
}

