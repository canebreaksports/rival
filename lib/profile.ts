// Brief player profiles for the Name Them "profile" hint. Built only from verified data in the set
// (position, the qualifying season/game line, other appearances on the list). Never from memory.
// Initials are a separate, third hint (computed from the name in the play screen).
import { fmt } from "./generators";

const POS: Record<string, string> = { RB: "Running back", FB: "Fullback", QB: "Quarterback", WR: "Wide receiver", TE: "Tight end" };
export const posName = (p?: string) => (p && POS[p]) || "";

/** "Carnell 'Cadillac' Williams" → "C.W.", "Clyde Edwards-Helaire" → "C.E.-H." */
export function initials(name: string) {
  return name.replace(/['"‘’“”][^'"‘’“”]*['"‘’“”]/g, " ").replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").trim().split(/\s+/)
    .map(w => w.split("-").map(p => p[0]?.toUpperCase() + ".").join("-")).join("");
}

export const profileLine = (...parts: (string | number | false | null | undefined)[]) => parts.filter(p => typeof p === "string" && p).join(" · ");
export const yds = (v: number, what: string) => `${fmt(v)} ${what}`;
