import Link from "next/link";
import type { Metadata } from "next";
import { readSets } from "@/lib/sets";
import { weekOf } from "@/lib/review";
import { SCHOOL } from "@/lib/schools";
import { Dot } from "@/components/Dot";
import { REVIEW_FROM } from "@/lib/approvals";
import { CopyNotes, PublishProvider, SetQuestions, SetStatus, StorageNote, WeekApprove } from "@/components/PublishControls";
import { reviewQuestion } from "@/lib/review";

export const metadata: Metadata = { title: "PITTED · Publish", robots: { index: false, follow: false } };

// Coach → Publish: every matchup set awaiting review, all on one scrolling page, with a green light per set or per week.
export default function Publish() {
  const sets = readSets().filter(s => s.game.date >= REVIEW_FROM).sort((a, b) => a.game.date.localeCompare(b.game.date) || a.slug.localeCompare(b.slug));
  const weeks = [...new Set(sets.map(s => weekOf(s.game.date)))].sort();
  return <PublishProvider><section>
    <div className="tag" style={{ marginTop: 6 }}>Coach · Publish</div>
    <h2 className="sec" style={{ fontSize: 22 }}>Review and green-light</h2>
    <p className="note" style={{ marginTop: 0, textAlign: "left" }}>Players only see a matchup after you green-light it. If a set changes after you approve it, it goes back to review.
      Correct answers are in gold. Review each question: green light, needs work (add a note), or reject. A set can be published once every question is green-lit. Use ▲/▼ to reorder (a new order sends the set back to review). Claude reads your notes and revises.</p>
    <StorageNote />
    <CopyNotes sets={sets.map(s => ({ slug: s.slug, title: `${SCHOOL[s.game.away].name} @ ${SCHOOL[s.game.home].name}`, qs: s.questions.map(q => ({ sig: q.sig, prompt: reviewQuestion(q).prompt })) }))} />
    <nav className="note" style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", textAlign: "left" }}>{weeks.flatMap(w => sets.filter(s => weekOf(s.game.date) === w)).map(s =>
      <a key={s.slug} href={`#${s.slug}`} style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>{s.game.away}@{s.game.home}</a>)}</nav>
    {weeks.map(w => { const mine = sets.filter(s => weekOf(s.game.date) === w); const d = new Date(w + "T12:00:00");
      return <div key={w}>
        <h2 className="sec" style={{ fontSize: 20, marginTop: 18 }}>Week of {d.toLocaleDateString("en-US", { month: "long", day: "numeric" })} · {mine.length} matchups</h2>
        <WeekApprove sets={mine.map(s => ({ slug: s.slug, sigs: s.questions.map(q => q.sig) }))} />
        {mine.map(s => <div key={s.slug} id={s.slug} className="review" style={{ scrollMarginTop: 12 }}>
          <h3 className="sec"><Dot k={s.game.away} /> {SCHOOL[s.game.away].name} @ <Dot k={s.game.home} /> {SCHOOL[s.game.home].name} · {s.game.date} · {s.questions.length} Qs</h3>
          <SetStatus slug={s.slug} sigs={s.questions.map(q => q.sig)} />
          <SetQuestions slug={s.slug} questions={s.questions} />
        </div>)}
      </div>; })}
    <Link className="back" href="/coach">← Coach</Link>
  </section></PublishProvider>;
}
