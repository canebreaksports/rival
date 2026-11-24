// No emojis on the site (owner, Nov 2026). Sets frozen before that keep emoji in their stored text; strip at display time,
// so approved sets don't change (a content change would send them back to review).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{274C}\u{2B50}\u{FE0F}]\s?/gu;
export const noEmoji = (s: string) => s.replace(/✅/gu, "✓").replace(/❌/gu, "✗").replace(EMOJI, "");
/** A deep copy of a question (or anything JSON) with every string emoji-free. */
export function plainQ<T>(q: T): T {
  return JSON.parse(JSON.stringify(q), (_k, v) => (typeof v === "string" ? noEmoji(v) : v));
}
