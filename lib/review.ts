// Plain-text review of a frozen set: every question with its correct answer, for the owner's weekly review
// (Coach → Review page, and scripts/review.ts for a Markdown export).
import type { FrozenSet, Question } from "./types";
import { SCHOOL } from "./schools";
import { correctAnswer, rankOrder } from "./scoring";
import { sundayOf } from "./gating";

const n = (k: string) => SCHOOL[k]?.name ?? k;
const f = (v: number) => v.toLocaleString("en-US");

export interface ReviewItem { kind: string; prompt: string; options?: string[]; answer: string; detail?: string; flags: string[] }

export function reviewQuestion(q: Question): ReviewItem {
  const flags = [q.trap && "🪤 trap", q.upset && "🚨 upset", q.pair && `side by side ${q.pairPart}/2`, !q.verified && "UNVERIFIED"].filter(Boolean) as string[];
  const game = "game" in q && q.game ? `${q.game.date} · ${n(q.game.winner)} ${q.game.ws}, ${n(q.game.loser)} ${q.game.ls}${q.game.venue ? " · " + q.game.venue : ""}` : "";
  switch (q.type) {
    case "prog": {
      const c = correctAnswer(q);
      return { kind: "Program Pit", prompt: q.prompt, options: [n(q.a), n(q.b), "Tied"], answer: c === "t" ? "Tied" : n(c === "a" ? q.a : q.b),
        detail: `${n(q.a)} ${q.values[0]} · ${n(q.b)} ${q.values[1]}`, flags };
    }
    case "count": {
      const c = correctAnswer(q);
      const list = (k: string, L: typeof q.A) => `${n(k)} (${L.length}): ${L.map(x => `${x.name}${x.season ? " " + x.season : ""} (${x.label ?? f(x.yards)})`).join(", ") || "none"}`;
      return { kind: "School Count + Name Them", prompt: q.prompt ?? `Which school has more ${f(q.threshold)}-yard career rushers?`,
        options: [n(q.a), n(q.b), "Tied"], answer: c === "t" ? "Tied" : n(c === "a" ? q.a : q.b), detail: `${list(q.a, q.A)}\n${list(q.b, q.B)}`, flags };
    }
    case "moment":
      return { kind: q.pair ? "Higher or Lower (paired)" : `Higher or Lower · ${q.label}`, prompt: `${game ? `[${game}] ` : ""}${q.prompt} ${q.line}`,
        options: ["More", "Less"], answer: q.answer === "over" ? "More" : "Less", detail: q.reveal, flags };
    case "rank": {
      const order = rankOrder(q).map((i, s) => `${s + 1}. ${q.items[i].label} (${f(q.items[i].value)})`).join("\n");
      return { kind: `Rank It · ${q.label}`, prompt: `${game ? `[${game}] ` : ""}${q.prompt}`, options: q.items.map(x => x.label), answer: order, detail: q.note, flags };
    }
    case "h2h": {
      const w = q.A.value > q.B.value ? q.A : q.B, fmtv = (v: number) => (q.ypc ? v.toFixed(1) + " ypc" : f(v));
      return { kind: `Head to Head · ${q.label}`, prompt: q.prompt, options: [q.A.label, q.B.label], answer: w.label,
        detail: `${q.A.label} ${fmtv(q.A.value)} · ${q.B.label} ${fmtv(q.B.value)}${q.note ? "\n" + q.note : ""}`, flags };
    }
    case "duel":
      return { kind: "Blind Stat Duel", prompt: `${q.year} ${q.stat.toLowerCase()}: which line is ${n(q.aSchool)}'s? X = ${(q.flip ? q.B : q.A).big} (${(q.flip ? q.B : q.A).sm}), Y = ${(q.flip ? q.A : q.B).big} (${(q.flip ? q.A : q.B).sm})`,
        options: ["Player X", "Player Y"], answer: q.flip ? "Player Y" : "Player X", detail: `${n(q.aSchool)}: ${q.aName} (${q.A.big}). ${n(q.other)}: ${q.bName} (${q.B.big}).`, flags };
    case "cross":
    case "mc":
      return { kind: q.type === "cross" ? "Crossover" : q.label, prompt: `${game ? `[${game}] ` : ""}${q.prompt}`, options: q.order.map(i => q.options[i]),
        answer: q.options[q.answer], detail: q.reveal + (q.type === "mc" && q.years ? `\nName the Years: ${[...q.years.A, ...q.years.B].map(x => `${x.season} (${x.profile})`).join(", ")}` : ""), flags };
  }
}

/** Sunday a game's week unlocks, as YYYY-MM-DD. */
export const weekOf = (date: string) => sundayOf(date);

/** How the player answers, in plain words. */
export function formatOf(q: Question): string {
  switch (q.type) {
    case "prog": return "Pick a school: A / B / Tied";
    case "count": return q.bonus === "years" ? "Pick a school: A / B / Tied, then Name the Years bonus (one year at a time, 3 misses, hints −10)" : "Pick a school: A / B / Tied, then Name Them bonus (one name at a time, 3 misses, hints −10)";
    case "moment": return q.pair ? "Higher or lower: More / Less (paired, 1 of 2 back to back)" : "Higher or lower: More / Less";
    case "rank": return "Rank It: tap 4 in order, highest first";
    case "h2h": return "Head to head: pick 1 of 2";
    case "duel": return "Blind stat duel: pick Player X or Y";
    case "cross": return "Multiple choice: pick 1 of 4";
    case "mc": return q.years ? "Multiple choice: pick 1 of 4, then Name the Years bonus (one year at a time, 3 misses, hints −10)" : "Multiple choice: pick 1 of 4";
  }
}

export function reviewMarkdown(week: string, sets: FrozenSet[]): string {
  const lines = [`# RIVAL · questions for the week of ${week}`, "", `${sets.length} matchups. Answers in **bold**.`, ""];
  for (const s of sets) {
    lines.push(`## ${n(s.game.away)} @ ${n(s.game.home)} · ${s.game.date} (${s.questions.length} questions)`, "");
    s.questions.forEach((q, i) => {
      const r = reviewQuestion(q);
      lines.push(`${i + 1}. *${r.kind}*${r.flags.length ? ` · ${r.flags.join(" · ")}` : ""}  `, `   Format: ${formatOf(q)}  `, `   ${r.prompt}  `);
      if (r.options && q.type !== "rank") lines.push(`   Options: ${r.options.join(" / ")}  `);
      lines.push(...r.answer.split("\n").map(a => `   **${a}**  `));
      if (r.detail) lines.push(...r.detail.split("\n").map(d => `   ${d}  `));
      if (q.info) lines.push(`   *ⓘ ${q.info.title}:* ${q.info.text}  `);
      if (q.more?.rows.length) lines.push(`   *More · ${q.more.title}:* ${q.more.rows.join(" · ")}  `);
      lines.push("");
    });
  }
  return lines.join("\n");
}
