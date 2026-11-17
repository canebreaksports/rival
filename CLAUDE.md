# RIVAL — weekly SEC college football trivia

Harrison's game. The two SEC schools playing each other get one fixed set of 10 questions during their game week: the same set for everyone, one run each. Mobile-first. The product spec (owner's document) is the source of truth for intent; this file covers how the code implements it.

Next.js 16 (App Router, TypeScript) on Vercel. Stage 1 is fully static: no database yet.

## Commands

- `npm run dev`: local server at http://localhost:3000. Coach (Preview Mode) is at `/coach`.
- `npm test`: vitest (data, generators, caps, determinism, gating, names, scoring, frozen sets).
- `npm run sets`: build weekly sets into `data/sets/` (see Freezing).
- `npm run validate`: data + frozen-set checks. `npm run build` runs it first, so a bad data change fails the Vercel deploy.
- `npm run typecheck`

Run `npm test` and `npm run sets` before every commit that touches data or `lib/`.

## Layout

```
data/*.json            datasets; every record has `source` and `verified`
  schools.json         colors + program stats (Heisman, SEC/national titles, unbeaten); programVerified=false until re-checked
  seasons.json         W-L 2000–2025 per school (on-field results, vacated wins restored)
  players.json         players (pos, star) + player seasons (year | "career")
  career-rushing.json  top-10 career rushing per school, floor = 10th place, active players flagged
  schedule.json        2026 SEC games
  curated.json         matchups (moments, duels, crossovers, series facts, rank/h2h) + team packs
  sets/<slug>.json     FROZEN weekly sets (committed). Do not hand-edit.
lib/                   engine (pure TS, shared by scripts, tests and UI)
  rng.ts               FNV-1a + mulberry32; every generator takes an Rng (no Math.random swapping)
  generators.ts        rank, prop, h2h, trap rank, trap prop, upset, school count
  build.ts             buildRound (caps, ≤1 trap, ≤1 upset), weeklySet, Coach free-play builders, ENGINE_VERSION
  gating.ts            Sunday 00:00 → game day 23:59 local; liveGames / nextGames
  scoring.ts names.ts validate.ts storage.ts data.ts sets.ts (server-only) summaries.ts (server-only)
app/                   / (home), /play/[slug], /coach, /coach/play/[slug]
components/            Play (question flow + final), WeekView (cards), WeeklyRun (gating), CoachClient
scripts/               build-sets.ts, validate.ts, port-prototype.mjs (one-time port from the old static prototype)
```

## Rules the code enforces

- **Weekly sets use verified content only.** Unverified records stay in the data for Coach free play, where they show an UNVERIFIED chip. A thin set beats a wrong one; fewer than 3 questions shows "Stats pack coming soon".
- **Caps per set:** ≤4 higher/lower, ≤3 program (≤7 if either school has no verified player data), ≤3 h2h, ≤2 rank, ≤1 count, ≤2 duels, ≤1 crossover, and ≤1 trap and ≤1 upset across generated *and* curated questions.
- **School Count** only uses thresholds ≥ both schools' floor, and never one above an active player's current total (he could cross it mid-week).
- **Progress** is saved in localStorage under `rival:<date>:<away>@<home>` right after each answer; answering the last question completes the run. Coach runs use a `preview:` prefix so testing doesn't burn the real run.

## Freezing (why changes can't alter a live set)

Questions are generated at build time by `npm run sets`, not in the browser. A set is frozen from 36 hours before its Sunday unlock: after that, `npm run sets` never rewrites it. Future weeks are rebuilt on every run, so new data flows into upcoming sets. `npm run sets -- --force <slug>` rebuilds one frozen set; only do that if nobody has played it. Bump `ENGINE_VERSION` in `lib/build.ts` when generation output changes.

## Data integrity: the most important rule

Wrong trivia kills the game. **Never write a stat from memory.** Every value needs a source fetched at the time, recorded in its `source` field. Set `verified: true` only when that's done.

- Player stats: Sports Reference via `https://aws.sports-reference.com/cfb/players/<slug>.html` (main domain blocks fetches). Some slugs end in `-2`.
- Season records: Wikipedia "List of <School> football seasons", on-field results.
- Career rushing: Wikipedia "<School> football statistical leaders" (top 10 only, hence the floor).
- Series facts: Winsipedia; anything that can drift (all-time record, last meeting) needs a second source.
- Game moments: a box score.
- Program stats: re-verify (spec §8.4) and then set `programVerified: true` per school.

The network allowlist for this repo's cloud environment includes www.winsipedia.com, en.wikipedia.org and aws.sports-reference.com.

## Adding a school's player pack

1. Pick 8–12 players (stars + upset-friendly role players: TEs, pass-catching RBs, dual-threat QBs, WRs with carries).
2. Add them to `players.json` (`pos`, `star`) with every season (peak season required for traps) and a `career` row with `att`, `recN`, `rec`, `recTD` where they exist. Each row gets `source` + `verified`.
3. Add the school's top-10 career rushing list to `career-rushing.json` and seasons to `seasons.json` if missing.
4. `npm test`, `npm run sets`, then play the week in `/coach` with the date picker.

## Deploy

Vercel auto-detects Next.js. Push to `main` and it builds (`npm run build` → validate → next build). No environment variables needed in Stage 1.

## Roadmap

- Stage 2: sign-in, server-side one-run enforcement, weekly leaderboards (Vercel Postgres), Coach behind sign-in.
- Stage 3: more conferences (Big Ten next).
- Data backlog: verify the 42 unverified curated items and program stats; player packs for FLA, VAN, MIZ, UK, OU, TAMU, UGA, SC, TEX, ARK, MISS, MSST; season records for AUB, ALA, MISS, MSST; full career lists for 2,000-yard counts; record-book comparisons.
