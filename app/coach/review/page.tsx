import Link from "next/link";
import type { Metadata } from "next";
import { readSets } from "@/lib/sets";
import { weekOf } from "@/lib/review";
import { SCHOOL } from "@/lib/schools";
import { OWNER_NOTABLE } from "@/lib/notable";
import Logo from "@/components/Logo";

export const metadata: Metadata = { title: "PITTED · Review", robots: { index: false, follow: false } };

// Coach → Review: every game week's frozen questions, with answers, for checking before they go live.
export default function ReviewIndex() {
  const sets = readSets();
  const weeks = [...new Set(sets.map(s => weekOf(s.game.date)))].sort();
  return <section>
    <Logo />
    <div className="tag">Coach · Weekly Review</div>
    <p className="note" style={{ marginTop: 0 }}>Every week&apos;s questions with answers. Weeks unlock Monday at 7 AM Central. A week&apos;s sets keep updating with new data until 36 hours before that (Saturday 7 PM Central), then they&apos;re frozen.</p>
    <div className="grid">{weeks.map(w => {
      const mine = sets.filter(s => weekOf(s.game.date) === w);
      const d = new Date(w + "T12:00:00");
      return <Link key={w} className="rv" href={`/coach/review/${w}`}>
        <div className="n">Week of {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        <div className="t" style={{ fontSize: 13 }}>{mine.map(s => `${SCHOOL[s.game.away].name} @ ${SCHOOL[s.game.home].name}`).slice(0, 3).join(" · ")}{mine.length > 3 ? " …" : ""}</div>
        <div className="q">{mine.length} matchups · {mine.reduce((t, s) => t + s.questions.length, 0)} questions</div>
      </Link>;
    })}</div>
    <h2 className="kind" style={{ marginTop: 24 }}>Owner&apos;s notable players</h2>
    <p className="note">Players you&apos;ve named as notable, so they can appear in higher/lower questions even when no stat rule covers them. Ask Claude to add or remove a name (it lives in <code>lib/notable.ts</code>, <code>OWNER_NOTABLE</code>).</p>
    <ul>{OWNER_NOTABLE.map(([n, k]) => <li key={n + k}>{n} · {SCHOOL[k]?.name ?? k}</li>)}</ul>
    <Link className="back" href="/coach">← Coach</Link>
  </section>;
}
