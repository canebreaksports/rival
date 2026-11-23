import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readSets } from "@/lib/sets";
import { reviewQuestion, weekOf } from "@/lib/review";
import { SCHOOL } from "@/lib/schools";
import { Dot } from "@/components/Dot";

export const metadata: Metadata = { title: "PITTED · Review", robots: { index: false, follow: false } };
export const dynamicParams = false;
export const generateStaticParams = () => [...new Set(readSets().map(s => weekOf(s.game.date)))].map(week => ({ week }));

export default async function ReviewWeek({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const sets = readSets().filter(s => weekOf(s.game.date) === week).sort((a, b) => a.game.date.localeCompare(b.game.date));
  if (!sets.length) notFound();
  const d = new Date(week + "T12:00:00");
  return <section>
    <div className="tag" style={{ marginTop: 6 }}>Coach · Review</div>
    <h2 className="sec" style={{ fontSize: 22 }}>Week of {d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</h2>
    <p className="note" style={{ marginTop: 0, textAlign: "left" }}>{sets.length} matchups. Correct answers are in gold. Play any of them in <Link href="/coach" style={{ color: "var(--gold)" }}>Coach</Link> to see them as players will.</p>
    {sets.map(s => <div key={s.slug} className="review">
      <h3 className="sec"><Dot k={s.game.away} /> {SCHOOL[s.game.away].name} @ <Dot k={s.game.home} /> {SCHOOL[s.game.home].name} · {s.game.date} · {s.questions.length} Qs</h3>
      <ol>{s.questions.map((q, i) => { const r = reviewQuestion(q); return <li key={i} className="qcard">
        <div className="kind">{r.kind}{r.flags.map(fl => <span key={fl} className="chip" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>{fl}</span>)}</div>
        <div className="rq">{r.prompt}</div>
        {r.options && q.type !== "rank" && <div className="ro">{r.options.join(" / ")}</div>}
        <div className="ra">{r.answer}</div>
        {r.detail && <div className="rd">{r.detail}</div>}
      </li> })}</ol>
    </div>)}
    <Link className="back" href="/coach/review">← All weeks</Link>
  </section>;
}
