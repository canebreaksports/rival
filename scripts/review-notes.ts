// npm run notes — the owner's per-question reviews from /coach/publish (needs KV_REST_API_URL / KV_REST_API_TOKEN).
// Lists every question marked 🛠 needs work or ❌ rejected, with the owner's note, so they can be revised.
import { readSets } from "../lib/sets";
import { reviewQuestion } from "../lib/review";
import { questionReviews } from "../lib/approvals";

(async () => {
  const rv = await questionReviews(), sets = readSets();
  let n = 0;
  for (const s of sets) s.questions.forEach((q, i) => {
    const r = rv[`${s.slug}|${q.sig}`];
    if (!r || r.s === "ok") return;
    n++;
    console.log(`${r.s === "work" ? "🛠 NEEDS WORK" : "❌ REJECTED"}  ${s.slug} #${i + 1}  (id ${q.sig.slice(0, 40)})`);
    console.log(`   ${reviewQuestion(q).prompt}`);
    if (r.note) console.log(`   Note: ${r.note}`);
  });
  const ok = Object.values(rv).filter(r => r.s === "ok").length;
  console.log(`\n${n} to revise · ${ok} green-lit questions`);
})();
