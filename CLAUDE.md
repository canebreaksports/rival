# RIVAL — weekly SEC college football trivia

Harrison's game. The two SEC schools playing each other get one fixed set of 10 questions during their game week: the same set for everyone, one run each. Mobile-first. The product spec (owner's document) is the source of truth for intent; this file covers how the code implements it.

Next.js 16 (App Router, TypeScript) on Vercel. Stage 1 is fully static: no database yet.

## Commands

- `npm run dev`: local server at http://localhost:3000. Coach (Preview Mode) is at `/coach`.
- `npm test`: vitest (data, generators, caps, determinism, gating, names, scoring, frozen sets).
- `npm run sets`: build weekly sets into `data/sets/` (see Freezing).
- `npm run review -- [YYYY-MM-DD]`: writes `review/<week>.md` with every question and answer for a game week (default: the next one). Also in the app at `/coach/review`.
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
  rivalry.json         games between SEC schools 2000–2025, top performers per game (2012+), players' totals vs. each opponent
  sets/<slug>.json     FROZEN weekly sets (committed). Do not hand-edit.
lib/                   engine (pure TS, shared by scripts, tests and UI)
  rng.ts               FNV-1a + mulberry32; every generator takes an Rng (no Math.random swapping)
  generators.ts        rank, mixed rank, prop, h2h, duel, trap rank, trap prop, upset, school count (+ notable-value floor, source margins)
  build.ts             buildRound (caps, ≤1 trap, ≤1 upset), weeklySet, Coach free-play builders, ENGINE_VERSION
  gating.ts            unlock Sunday 7:00 AM Central → lock 11:59 PM Central game day (DST-aware); liveGames / nextGames
  review.ts            answer-key formatting for /coach/review and npm run review
  scoring.ts names.ts validate.ts storage.ts data.ts sets.ts (server-only) summaries.ts (server-only)
app/                   / (home), /play/[slug], /coach, /coach/play/[slug]
components/            Play (question flow + final), WeekView (cards), WeeklyRun (gating), CoachClient
scripts/               build-sets.ts, validate.ts, port-prototype.mjs (one-time port from the old static prototype)
```

## Rules the code enforces

- **Weekly sets use verified content only.** Unverified records stay in the data for Coach free play, where they show an UNVERIFIED chip. A thin set beats a wrong one; fewer than 3 questions shows "Stats pack coming soon".
- **Player-first sets:** 7 generated player questions per set (props, head-to-head, Rank It, Mixed Rank It, Blind Stat Duel, upset, trap, school count). Program comparisons only fill gaps.
- **Caps per set:** ≤4 higher/lower, ≤2 program (≤4 if either school has no verified player data), ≤3 h2h, ≤2 rank (incl. mixed), ≤1 count, ≤2 duels, ≤1 crossover, and ≤1 trap and ≤1 upset across generated *and* curated questions.
- **Pitted mode = both schools in every question** (`involvesBoth()` in `lib/build.ts`): head-to-heads and upsets pair one player from each school, every Rank It includes both, and team packs and single-player props are Team Deep Dive only.
- **Results view:** a played matchup's home card is clickable and reopens its final screen with "Your results": each question's type and prompt, ✅/🟨/❌ and points earned (`Progress.qpts`, incl. streak and Name Them bonuses). Never the answers. Stays viewable after the week locks.
- **Honors questions** (`lib/honors-gen.ts`; data `data/draft.json` from `scripts/import-draft.ts`, `data/honors.json` from `scripts/import-honors.ts`): NFL draft (first-round / top-10 / top-50 counts since a year, "drafted highest" multiple choice; drafts 2000–2026, each year checked complete), 15 major awards (counts 2000–2025, "which of these won the X Award" with big-name distractors who never won it in ANY year, via `everWon`), Heisman voting (winners / top-N counts and season-specific "finished highest that season"; each year's rows must satisfy points = 3×1st+2×2nd+3rd, partial years keep only trustworthy places, windows respect `heismanDepth`). NFL team names are deliberately not shown: the draft source uses each franchise's current city.
- **Player's school + tracking:** before their first weekly game a player picks their school (68 Power-conference schools from `data/teams.json`, CFBD 2026: SEC, Big Ten, ACC, Big 12, Notre Dame; or "Other"), stored on the device under `rivalfan` with a random anonymous ID (`lib/fan.ts`). `lib/track.ts` sends pick/start/finish events to `POST /api/track`, which validates them (`lib/track-server.ts`) and counts in Upstash Redis: each device's school, and per matchup starts/finishes split by whether the matchup involves the player's school (each device once per matchup). `/coach/stats` reads `GET /api/stats` (header `x-stats-key` = env `STATS_KEY`). Without `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`_TOKEN`) nothing is stored and the game works normally. Coach previews are never tracked.
- **"More:" lists:** after answering, list and ranking questions show a mini leaderboard (`more` on the question: top 6–12 from both schools in that stat, rivalry, draft, award or Heisman), built at generation time from verified data.
- **Name the Years:** only where the year is the answer and there is no player to name: walk-offs (`bonus: "years"`) and curated multiple choice with `years` (Saban vs 9-win Auburn). Every list of players uses Name Them (owner, Nov 2026: "name more players than years"). Until a bonus is finished, the reveal shows only the short answer, and More lists stay hidden so they can't give the bonus away.
- **Fill-ins** (`lib/fillin-gen.ts`): every pitted set gets one: the combined top 10 single-season rushing/receiving yards from both record books (`data/season-records.json` from `scripts/import-season-records.ts`; skipped if a tie straddles 10th or a school's whole top 10 makes it), or the top 5 (4–6, wherever the cutoff is clear) in yards against each other. The pitted count cap is 4 (two edges plus fill-ins).
- **ⓘ info:** `info` on a question shows a button after answering, before the bonus (award definitions from `honors.json` `for`, and Heisman voting points).
- **Both fan bases get an edge** (owner's rule, Nov 2026): each pitted set's two weekly count questions are one the away school leads and one the home school leads, from different families (season counts, big games vs each other, awards, Heisman, draft). Candidates are enumerated once per matchup (`countCandidates`, fixed seed). College stats first: a draft count is used only when no college-only pairing exists. Falls back to the best single count plus the most-yards-against multiple choice when one school leads everything (4 of 72 2026 sets: Alabama vs weaker programs).
- **NFL draft is a side dish:** at most one draft question per set; the "drafted highest" multiple choice is offered in ~30% of sets. Draft counts include position groups (QB, RB, WR/TE, OL, DL, LB, DB).
- **Multiple choice + Name the Years:** a curated `mc` can carry `years` ({prompt, a, b, A, B}); after answering, the player names the seasons (e.g. Saban vs 9-win Auburn → 2007, 2010, 2013, 2017, 2019). Entry names must not contain the year (hint 1 shows them); use the score line.
- **Notables Rank It:** (1) career receiving yards from each school's record book top 10 (`data/career-receiving.json` from `scripts/import-career-receiving.ts`, exact, so close calls allowed; careers ending 2000+, each school's top 6, two per school), (2) `genMixedRank(c, teams, true)`: only famous players with strong numbers or huge numbers by anyone (season 10/12 TDs or 1,000/1,300 yds; career 25/35 TDs or 2,500/3,000 yds).
- **Career ranking every week:** each pitted set gets one record-book career ranking (receiving 60%, rushing 40%; two players per school, each school's top 6). This is the owner's Evans / Shipley / Kirk / Worthy question.
- **Walk-offs** (`lib/walkoff-gen.ts`, `data/walkoffs.json` from `scripts/fetch-cfbd-drives.ts` + `scripts/import-walkoffs.ts`): games won on the final play (winner tied or trailing, scored on the last drive ending 0:00 in the 4th) or in overtime (owner: OT counts, and every prompt must say what counts). Count version (an edge candidate, always Name the Years) and "how many of the N games" multiple choice with a Name the Years bonus. Classified by score change, not CFBD's drive labels; CFBD folds all OTs into one period, so no OT counts are shown. Windows start after the last game whose data fails a check (2002 has no drives).
- **Name Them bonus** (`NameThem` in `components/Play.tsx`, matching in `lib/names.ts`): one name at a time, 3 misses and you're out, "I'm done" anytime. Every occurrence is a slot (a player with two qualifying seasons is named twice). Small typos are forgiven on longer names (none up to 4 letters, 1 up to 7, 2 beyond); a shared last name asks for a first name (free); repeats are free. Three hints, each for the same player: 1 year, 2 a brief profile (position, that season's/game's numbers, other appearances on the list, school years / career-list rank; built only from verified data at generation time, `profile` on each count entry), 3 initials (computed in the UI). Each hint costs 10 points (`POINTS.hint`), charged to that question; the run's hint count is saved (`Progress.hints`), shown on the final screen and home card, and included in "Share Results" (with a ✅/🟨/❌ row per question, `Progress.marks`).
- **Rivalry questions** (`lib/rivalry-gen.ts`, data `data/rivalry.json` built by `scripts/fetch-cfbd-games.ts` + `scripts/import-rivalry.ts`): game moments from real games between the two schools (scoreboard + a player's line in that game; single-game Rank It was removed at the owner's request), head-to-heads on players' totals against each other, ranked single-game performances in the series, and series wins since 2000. Results 2000–2025 (on-field), box scores 2012–2025, kept only when the box score's points match the result. Margins: single-game yards ≥ max(15, 12%), totals vs. the opponent ≥ max(25, 10%). Weighted up; at most one paired prop per set so they get the higher/lower slots.
- **Box scores 2004–2011** come from ESPN game summaries (`scripts/fetch-espn-box.ts`, keyed by the CFBD game IDs), kept only if points match, every stat table adds up (rushers may exceed the team total by ≤15 for team plays, never fall short; receiving = passing), and players agree with CFBD within the single-game margin. About 79% pass. "Against each other" totals only count from `vsFrom`, the first season after which every game of that pair has a box score, and the prompt names that season.
- **No close calls:** yardage comparisons need a gap of at least 25 yds or 5% (exact sources), 50 yds or 8% (CollegeFootballData), 25 yds or 15% (single games), unless both sides are notable players (star, award winner or Heisman top-5) in notable seasons (1,000+ yds, or 2,500+ career), exact sources only. `notablePair()` / `clear()` in `lib/generators.ts`.
- **No trivial values:** generated questions skip seasons under 250 yds / 3 TD and careers under 500 yds / 5 TD.
- **School Count** only uses thresholds ≥ both schools' floor, and never one above an active player's current total (he could cross it mid-week).
- **Progress** is saved in localStorage under `rival:<date>:<away>@<home>` right after each answer; answering the last question completes the run. Coach runs use a `preview:` prefix so testing doesn't burn the real run.

## Freezing (why changes can't alter a live set)

Questions are generated at build time by `npm run sets`, not in the browser. A set is frozen from 36 hours before its Sunday unlock: after that, `npm run sets` never rewrites it. Future weeks are rebuilt on every run, so new data flows into upcoming sets. `npm run sets -- --force <slug>` rebuilds one frozen set; only do that if nobody has played it. Bump `ENGINE_VERSION` in `lib/build.ts` when generation output changes.

## Data integrity: the most important rule

Wrong trivia kills the game. **Never write a stat from memory.** Every value needs a source fetched at the time, recorded in its `source` field. Set `verified: true` only when that's done.

- Player stats, AUB/TENN/LSU/ALA (and anyone before 2012): Sports Reference. As of Nov 2026 it sits behind a Cloudflare bot check, so new rows can't be fetched automatically.
- Player stats, the other 12 schools: CollegeFootballData API (`scripts/fetch-cfbd.ts` caches ~50 calls, `scripts/import-cfbd.ts` builds packs). Its season stats are incomplete before 2011, so packs only include players whose first season is 2012+, seasons 2012–2025, and no active (2026) players. Its totals can differ from official ones by a few yards, so generators enforce a safety margin (`clear()` / `minGap()` in `lib/generators.ts`): yardage gaps ≥ max(50, 8%), TD gaps ≥ 1, YPC ≥ 0.5 whenever a CFBD value is involved. The free tier has a monthly call limit: reuse the cache.
- Season records: Wikipedia "List of <School> football seasons", on-field results.
- Pre-2012 players / extra players: Wikipedia player articles' college stats tables (`scripts/import-wiki.ts`, targets in `data/wiki-targets.json`). Imported only if the school's seasons add up to the table's career line and agree with existing data and the school's career list. Many articles only have NFL tables; those players are reported and skipped.
- Career rushing lists (School Count): Wikipedia "<School> football statistical leaders" career table, which cites the school record book (`scripts/import-leaders.ts`), top 10. Tennessee's list is 18 deep from its official 2024 record book PDF plus later players. Floor = last listed total. **The school list is the authority for career rushing yards:** when a player's career row disagrees, the importer replaces it with the list's total and drops carries; a CollegeFootballData player more than 50 yards off gets his seasons marked unverified (Trayveon Williams).
- Wikipedia rate-limits by network address and cloud sessions share one, so `scripts/wiki-fetch.ts` paces requests, honors Retry-After and caches articles. Expect a few minutes per dozen pages.
- Series facts: Winsipedia; anything that can drift (all-time record, last meeting) needs a second source.
- Game moments: a box score.
- Program stats: re-verify (spec §8.4) and then set `programVerified: true` per school.

The cloud environment allows www.winsipedia.com, en.wikipedia.org, aws.sports-reference.com, www.sports-reference.com (Cloudflare-blocked) and s3.us-east-2.amazonaws.com (school record book PDFs), and holds keys for api.collegefootballdata.com and api.vercel.com.

## Adding a school's player pack

1. Pick 8–12 players (stars + upset-friendly role players: TEs, pass-catching RBs, dual-threat QBs, WRs with carries).
2. Add them to `players.json` (`pos`, `star`) with every season (peak season required for traps) and a `career` row with `att`, `recN`, `rec`, `recTD` where they exist. Each row gets `source` + `verified`.
3. Add the school's top-10 career rushing list to `career-rushing.json` and seasons to `seasons.json` if missing.
4. `npm test`, `npm run sets`, then play the week in `/coach` with the date picker.

## Deploy

Tracking needs two things in the Vercel project: an Upstash Redis database connected to it (provides `KV_REST_API_URL` / `KV_REST_API_TOKEN`) and an env var `STATS_KEY` (any secret; used to open `/coach/stats`).

Vercel auto-detects Next.js. Push to `main` and it builds (`npm run build` → validate → next build). No environment variables needed in Stage 1.

## Roadmap

- Stage 2: sign-in, server-side one-run enforcement, weekly leaderboards (Vercel Postgres), Coach behind sign-in.
- Stage 3: more conferences (Big Ten next).
- Data backlog: verify the 42 unverified curated items and program stats; player packs for FLA, VAN, MIZ, UK, OU, TAMU, UGA, SC, TEX, ARK, MISS, MSST; season records for AUB, ALA, MISS, MSST; full career lists for 2,000-yard counts; record-book comparisons.
