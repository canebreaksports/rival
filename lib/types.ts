// Data model (spec §7) and serializable question objects.

export type SchoolKey = string;
export type Pos = "RB" | "QB" | "WR" | "TE";

export interface Sourced { source: string; verified: boolean }

export interface School {
  key: SchoolKey;
  name: string;
  color: string;
  program: { heisman: number; sec: number; natl: number; unbeaten: number };
  programSource: string;
  programVerified: boolean;
}

export interface SeasonRecords extends Sourced { records: string[] } // "W-L" × 26, 2000–2025

export interface Player { name: string; school: SchoolKey; pos: Pos; star?: boolean }

export type StatKey = "rush" | "rushTD" | "att" | "rec" | "recN" | "recTD" | "scrim";
export interface PlayerSeason extends Sourced, Partial<Record<StatKey, number>> {
  name: string;
  school: SchoolKey;
  year: number | "career";
}

export interface CareerList extends Sourced {
  floor: number; // 10th-place total: counts are complete at or above it
  list: { name: string; yards: number; active?: boolean }[];
}

export interface Game { date: string; away: SchoolKey; home: SchoolKey; site?: string }

export interface GameBox { date: string; winner: SchoolKey; ws: number; ls: number; ot?: boolean; venue: string }

// ---- curated content (data/curated.json) ----
export type CuratedItem = Sourced & (
  | { type: "moment"; prompt: string; line: string; answer: "over" | "under"; reveal: string; game?: GameBox }
  | { type: "duel"; year: number; stat: string; aSchool: SchoolKey; aName: string; bName: string; A: { big: string; sm: string }; B: { big: string; sm: string } }
  | { type: "cross"; prompt: string; options: string[]; answer: number; reveal: string }
  | { type: "rank"; prompt: string; items: { label: string; value: number }[]; unit: string; trap?: boolean; note?: string }
  | { type: "h2h"; prompt: string; A: { label: string; value: number }; B: { label: string; value: number }; unit: string }
);
export interface Matchup { a: SchoolKey; b: SchoolKey; name: string; items: CuratedItem[] }

export interface Dataset {
  schools: School[];
  seasons: Record<SchoolKey, SeasonRecords>;
  players: { players: Player[]; seasons: PlayerSeason[] };
  career: Record<SchoolKey, CareerList>;
  schedule: { source: string; games: Game[] };
  curated: { matchups: Matchup[]; teamPacks: Record<SchoolKey, CuratedItem[]> };
}

// ---- questions: fully self-contained so frozen sets need no data at runtime ----
interface QBase { label: string; verified: boolean; sig: string; trap?: boolean; upset?: boolean; pair?: string; pairPart?: 1 | 2 }
export interface Item { label: string; value: number; school?: SchoolKey } // school: who the item belongs to (pitted checks)

export type Question = QBase & (
  | { type: "prog"; a: SchoolKey; b: SchoolKey; prompt: string; values: [number, number] }
  | { type: "moment"; game?: GameBox & { loser: SchoolKey }; prompt: string; line: string; answer: "over" | "under"; reveal: string;
      check?: { value: number; line: number } }
  | { type: "rank"; prompt: string; items: Item[]; unit: string; note?: string }
  | { type: "h2h"; prompt: string; A: Item; B: Item; unit: string; ypc?: boolean; note?: string; flip: boolean }
  | { type: "count"; a: SchoolKey; b: SchoolKey; threshold: number; A: { name: string; yards: number; active?: boolean }[]; B: { name: string; yards: number; active?: boolean }[] }
  | { type: "duel"; year: number; stat: string; aSchool: SchoolKey; other: SchoolKey; aName: string; bName: string; A: { big: string; sm: string }; B: { big: string; sm: string }; flip: boolean }
  | { type: "cross"; a: SchoolKey; b: SchoolKey; prompt: string; options: string[]; answer: number; reveal: string; order: number[] }
);
export type QType = Question["type"];

export interface FrozenSet {
  key: string;      // rival:<date>:<away>@<home>
  slug: string;     // URL-safe
  game: Game;
  generatedAt: string;
  engine: number;   // ENGINE_VERSION used to build it
  questions: Question[];
}

export interface Progress { i: number; pts: number; streak: number; best: number; right: number; n: number; done: boolean }
