import Link from "next/link";
import type { Metadata } from "next";
import { readSets } from "@/lib/sets";
import { formatOf, reviewQuestion, weekOf } from "@/lib/review";
import { SCHOOL } from "@/lib/schools";
import { Dot } from "@/components/Dot";
import { REVIEW_FROM } from "@/lib/approvals";
import { PublishProvider, SetStatus, StorageNote, WeekApprove } from "@/components/PublishControls";

export const metadata: Metadata = { title: "PITTED · Publish", robots: { index: false, follow: false } };

// Coach → Publish: every matchup set awaiting review, all on one scrolling page, with a green light per set or per week.
export default function Publish() {
  const sets = readSets().filter(s => s.game.date >= REVIEW_FROM).sort((a, b) => a.game.date.localeCompare(b.game.date) || a.slug.localeCompare(b.slug));
  const weeks = [...new Set(sets.map(s => weekOf(s.game.date)))].sort();
  return <PublishProvider><section>
    <div className="tag" style={{ marginTop: 6 }}>Coach · Publish</div>
    <h2 className="sec" style={{ fontSize: 22 }}>Review and green-light</h2>
    <p className="note" style={{ marginTop: 0, textAlign: "left" }}>Players only see a matchup after you green-light it. If a set changes after you approve it, it goes back to review.
      Correct answers are in gold. To change a question, tell Claude the matchup and question number (its id is shown under it).</p>
    <StorageNote />
    <nav className="note" style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", textAlign: "left" }}>{weeks.flatMap(w => sets.filter(s => weekOf(s.game.date) === w)).map(s =>
      <a key={s.slug} href={`#${s.slug}`} style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>{s.game.away}@{s.game.home}</a>)}</nav>
    {weeks.map(w => { const mine = sets.filter(s => weekOf(s.game.date) === w); const d = new Date(w + "T12:00:00");
      return <div key={w}>
        <h2 className="sec" style={{ fontSize: 20, marginTop: 18 }}>Week of {d.toLocaleDateString("en-US", { month: "long", day: "numeric" })} · {mine.length} matchups</h2>
        <WeekApprove slugs={mine.map(s => s.slug)} />
        {mine.map(s => <div key={s.slug} id={s.slug} className="review" style={{ scrollMarginTop: 12 }}>
          <h3 className="sec"><Dot k={s.game.away} /> {SCHOOL[s.game.away].name} @ <Dot k={s.game.home} /> {SCHOOL[s.game.home].name} · {s.game.date} · {s.questions.length} Qs</h3>
          <SetStatus slug={s.slug} />
          <ol>{s.questions.map((q, i) => { const r = reviewQuestion(q); return <li key={i} className="qcard">
            <div className="kind">{r.kind}{r.flags.map(fl => <span key={fl} className="chip" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>{fl}</span>)}</div>
            <div className="rd" style={{ opacity: 0.75 }}>{formatOf(q)}</div>
            <div className="rq">{r.prompt}</div>
            {r.options && q.type !== "rank" && <div className="ro">{r.options.join(" / ")}</div>}
            <div className="ra">{r.answer}</div>
            {r.detail && <div className="rd" style={{ whiteSpace: "pre-line" }}>{r.detail}</div>}
            {q.info && <div className="rd">ⓘ {q.info.title}: {q.info.text}</div>}
            {q.more?.rows.length ? <div className="rd">More · {q.more.title}: {q.more.rows.join(" · ")}</div> : null}
            <div className="rd" style={{ opacity: 0.5, fontSize: 12 }}>id: {q.sig.slice(0, 40)}</div>
          </li> })}</ol>
        </div>)}
      </div>; })}
    <Link className="back" href="/coach">← Coach</Link>
  </section></PublishProvider>;
}
