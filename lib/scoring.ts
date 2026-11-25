// Answer checking and scoring (spec §5). Pure functions so the UI and tests share them.
import type { Progress, Question } from "./types";

export const POINTS = { correct: 100, perfectRank: 150, rankSlot: 25, streakStep: 25, bonus: 50 };
/** Bonus rounds (owner, Nov 2026): worth 100 in all, the same as a question, split evenly across the answers
 *  (10 answers = 10 each). Each hint on an answer takes 25% off that answer: three hints leave 25%. */
export const BONUS = { total: 100, hintCut: 0.25, maxHints: 3 };
export const answerValue = (answers: number) => (answers ? BONUS.total / answers : 0);
export const earnedFor = (answers: number, hintsOnIt: number) => answerValue(answers) * Math.max(0, 1 - BONUS.hintCut * Math.min(BONUS.maxHints, hintsOnIt));
/** Total for a finished bonus: the answers named, each reduced by its hints. */
export const bonusTotal = (answers: number, named: number[], hintsOn: (i: number) => number) => Math.round(named.reduce((t, i) => t + earnedFor(answers, hintsOn(i)), 0));
export const fmtPts = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ""));

/** The correct answer token for a question (rank questions are scored with scoreRank instead). */
export function correctAnswer(q: Question): string {
  switch (q.type) {
    case "prog": return q.values[0] > q.values[1] ? "a" : q.values[1] > q.values[0] ? "b" : "t";
    case "count": return q.A.length > q.B.length ? "a" : q.B.length > q.A.length ? "b" : "t";
    case "moment": return q.answer;
    case "h2h": return q.A.value > q.B.value ? q.A.label : q.B.label;
    case "duel": return q.flip ? "y" : "x";
    case "cross": case "mc": return String(q.answer);
    case "rank": return "";
  }
}

/** Indices of rank items, highest value first. */
export const rankOrder = (q: Extract<Question, { type: "rank" }>) => q.items.map((_, i) => i).sort((x, y) => q.items[y].value - q.items[x].value);

export function scoreRank(q: Extract<Question, { type: "rank" }>, picks: number[]) {
  const order = rankOrder(q);
  const hits = picks.filter((p, slot) => order[slot] === p).length;
  const perfect = hits === q.items.length;
  return { order, hits, perfect, base: perfect ? POINTS.perfectRank + (q.trap ? POINTS.bonus : 0) : hits * POINTS.rankSlot };
}

/** Applies a result to progress. Streak bonus only on correct answers; partial rank credit breaks the streak. */
export function applyResult(p: Progress, ok: boolean, base: number): Progress {
  if (ok) {
    const streak = p.streak + 1;
    return { ...p, streak, right: p.right + 1, best: Math.max(p.best, streak), pts: p.pts + base + (streak - 1) * POINTS.streakStep };
  }
  return { ...p, streak: 0, pts: p.pts + base };
}

export function grade(pct: number) {
  return pct === 1 ? "Perfect season. Heisman stuff." : pct >= 0.8 ? "Conference champs." : pct >= 0.6 ? "Bowl eligible."
    : pct >= 0.4 ? "Rebuilding year." : "Coach is on the hot seat.";
}
