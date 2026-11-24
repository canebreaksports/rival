# Builds the owner-approved "marquee" questions for the rivalry-week matchups into data/curated.json:
#   close games (decided by 3 or fewer, or in overtime) + name the years, the classic close finish (final score),
#   and recap-sourced star lines (ESPN/AP recaps, quoted in each item's source). Re-runnable: replaces its own items.
import json, sys
R = json.load(open('data/rivalry.json'))['pairs']; K = json.load(open('data/game-ranks.json'))['pairs']; W = json.load(open('data/walkoffs.json'))['pairs']
S = {s['key']: s['name'] for s in json.load(open('data/schools.json'))}
PAIRS = [("FLA","FSU"),("TEX","TAMU"),("ASU","ARIZ"),("GT","UGA"),("LOU","UK"),("LSU","ARK"),("MICH","OSU"),("MSST","MISS"),("OU","MIZ"),("PUR","IU"),("SC","CLEM"),("TENN","VAN"),("USC","UCLA")]
SRC = "CollegeFootballData /games (scores), data/rivalry.json; AP ranks: CollegeFootballData /rankings, poll in force that week (data/game-ranks.json); overtime: CFBD line scores (data/walkoffs.json)"
def pk(a, b): return "|".join(sorted([a, b]))
def rank(p, g, k):
  r = next((x for x in K.get(p, {}).get('games', []) if x['date'] == g['date']), None)
  return r['ranks'].get(k) if r else None
def tag(p, g, k): r = rank(p, g, k); return f"No. {r} {S[k]}" if r else S[k]
def ot(p, g): return any(w['season'] == g['season'] and w['how'] == 'ot' and w['ws'] == max(g['hp'], g['ap']) for w in W.get(p, {}).get('list', []))
def wl(g): return (g['home'], g['away']) if g['hp'] > g['ap'] else (g['away'], g['home'])
items = {}
for a, b in PAIRS:
  p = pk(a, b); gs = [g for g in R[p]['games'] if 2000 <= g['season'] <= 2025 and g['hp'] != g['ap']]
  out = []
  close = [g for g in gs if abs(g['hp'] - g['ap']) <= 3 or ot(p, g)]
  def line(g): w, l = wl(g); return f"{tag(p, g, w)} {max(g['hp'], g['ap'])}, {tag(p, g, l)} {min(g['hp'], g['ap'])}{' (OT)' if ot(p, g) else ''}"
  n = len(close)
  if 2 <= n <= 12:
    opts = [n] + [x for x in [n - 2, n - 1, n + 1, n + 2, n + 3] if x >= 0 and x != n][:3]
    ent = lambda g: {"name": line(g), "yards": 0, "season": g['season'], "label": line(g), "profile": line(g)}
    out.append({"type": "mc", "prompt": f"Of the {len(gs)} {S[a]}–{S[b]} games from 2000 through 2025, how many were decided by 3 points or fewer, or in overtime?",
      "options": [str(x) for x in opts], "answer": 0,
      "reveal": f"{n}: " + " · ".join(f"{g['season']} {line(g)}" for g in close) + ".",
      "years": {"prompt": f"Name the {n} seasons.", "a": a, "b": b, "A": [ent(g) for g in close if wl(g)[0] == a], "B": [ent(g) for g in close if wl(g)[0] == b]},
      "source": SRC, "verified": True, "marquee": True})
  def score(g):
    w, l = wl(g); walk = any(x['season'] == g['season'] for x in W.get(p, {}).get('list', []))
    return (2 if rank(p, g, w) and rank(p, g, l) else 1 if rank(p, g, w) or rank(p, g, l) else 0) + (1 if walk else 0) + (1 if rank(p, g, l) and not rank(p, g, w) else 0) + (1 if abs(g['hp'] - g['ap']) <= 1 else 0)
  if close:
    g = max(close, key=lambda g: (score(g), g['season'])); w, l = wl(g); ws, ls = max(g['hp'], g['ap']), min(g['hp'], g['ap'])
    opts = [f"{S[w]} {ws}, {S[l]} {ls}", f"{S[l]} {ws}, {S[w]} {ls}", f"{S[w]} {ws + 7}, {S[l]} {ls + 4}", f"{S[w]} {ws}, {S[l]} {max(0, ls - 4)}"]
    if len(set(opts)) == 4:
      wo = next((x for x in W.get(p, {}).get('list', []) if x['season'] == g['season'] and x['ws'] == ws and x['ls'] == ls), None)
      hook = (", a game that went to overtime" if wo and wo['how'] == 'ot' else ", decided by a field goal as time expired" if wo and wo['how'] == 'fg'
        else ", decided on the final play" if wo else ", and the unranked team won" if rank(p, g, l) and not rank(p, g, w) else "")
      out.append({"type": "mc", "prompt": f"{g['season']}: {tag(p, g, g['away'])} at {tag(p, g, g['home'])}{hook}. What was the final score?",
        "options": opts, "answer": 0, "reveal": f"{line(g)} ({g['date']}{', ' + g['venue'] if g.get('venue') else ''}).", "source": SRC, "verified": True, "marquee": True})
  items[p] = out
# recap-sourced star lines: (pair, question). Scores, totals and ranks cross-checked against data/rivalry.json and data/game-ranks.json.
def recap(eid, quote): return f"ESPN game recap (AP), event {eid}: \"{quote}\". Score and totals match data/rivalry.json; AP ranks from data/game-ranks.json"
EXTRA = {
 "CLEM|SC": [{"type": "mc", "prompt": "2012: No. 13 South Carolina won at No. 12 Clemson, 27–17, with backup quarterback Dylan Thompson. How many sacks did Jadeveon Clowney have?",
   "options": ["4.5", "3", "2.5", "1.5"], "answer": 0, "reveal": "4.5 sacks, a South Carolina single-game record: 1.5 in the first half and 3 in the second. It also set the school's single-season record (13).",
   "source": recap(323290228, "Jadeveon Clowney had 4½ sacks") + "; Wikipedia \"Jadeveon Clowney\" (revision 1386779542): \"a single-game school record 4.5\"", "verified": True, "marquee": True}],
 "MICH|OSU": [
  {"type": "mc", "prompt": "2006 was the first time Ohio State and Michigan met ranked No. 1 and No. 2. No. 1 Ohio State won 42–39 at Ohio Stadium. Which team committed more turnovers?",
   "options": ["Ohio State, 3 to 0", "Michigan, 3 to 0", "Ohio State, 2 to 1", "Michigan, 2 to 1"], "answer": 0,
   "reveal": "🔄 Twist: Ohio State turned it over 3 times; Michigan never did, and still lost. Ohio State out-gained Michigan 503 to 397.",
   "source": "ESPN box score, event 263220194 (turnovers Ohio State 3, Michigan 0; total yards 503 and 397); Wikipedia \"2006 Michigan vs. Ohio State football game\" (revision 1359177321): first No. 1 vs. No. 2 meeting, 42–39", "verified": True, "marquee": True},
  {"type": "mc", "prompt": "In the 2006 No. 1 vs. No. 2 game, Mike Hart ran for 142 yards on 23 carries in Michigan's 42–39 loss. How many rushing touchdowns did he score?",
   "options": ["3", "1", "2", "0"], "answer": 0, "reveal": "3 touchdowns, in a loss. He came in with 1,373 yards and 11 touchdowns on the season.",
   "source": "ESPN box score, event 263220194 (Hart 23 carries, 142 yards, 3 TD); Wikipedia \"2006 Michigan vs. Ohio State football game\" (revision 1359177321): Hart's 1,373 yards and 11 touchdowns entering the game", "verified": True, "marquee": True},
  {"type": "mc", "prompt": "Troy Smith won the 2006 Heisman. In the No. 1 vs. No. 2 game against Michigan, he went 29 of 41 for 316 yards. How many touchdown passes did he throw?",
   "options": ["4", "2", "3", "1"], "answer": 0, "reveal": "4 touchdowns (1 interception), as Ohio State won 42–39.",
   "source": "ESPN box score, event 263220194 (Smith 29/41, 316 yards, 4 TD, 1 INT)", "verified": True, "marquee": True},
  {"type": "mc", "prompt": "2007: No. 7 Ohio State held No. 23 Michigan to 91 total yards in a 14–3 win. Ohio State had four sacks. How many were Vernon Gholston's?",
   "options": ["3", "4", "2", "1"], "answer": 0, "reveal": "3 of Ohio State's 4 sacks. Chris Wells added 222 rushing yards, and Michigan finished with 15 rushing yards.",
   "source": recap(273210130, "Gholston made life miserable for them with three of Ohio State's four sacks"), "verified": True, "marquee": True}],
 "FLA|FSU": [{"type": "mc", "prompt": "2014: No. 1 Florida State beat Florida 24–19 to extend its winning streak to 28 games. How many interceptions did Jameis Winston, the reigning Heisman winner, throw?",
   "options": ["4", "0", "1", "2"], "answer": 0, "reveal": "🔄 Twist: a career-high 4, three of them in the first quarter. Florida State won anyway.",
   "source": recap(400547771, "Winston threw a career-high four interceptions, including three in the first quarter"), "verified": True, "marquee": True}],
 "LOU|UK": [{"type": "mc", "prompt": "2014: No. 24 Louisville led Kentucky 44–40 in the final minute when safety Gerod Holliman intercepted Patrick Towles. That pick tied the NCAA single-season record. Which interception of his season was it?",
   "options": ["14th", "12th", "13th", "15th"], "answer": 0, "reveal": "His 14th, with 35 seconds left, returned 65 yards to the Kentucky 2.",
   "source": recap(400547785, "Gerod Holliman sealed it with an NCAA record-tying 14th interception with 35 seconds left"), "verified": True, "marquee": True}],
 "TENN|VAN": [{"type": "mc", "prompt": "2013: Vanderbilt won at Tennessee, 14–10. How many passing yards did Tennessee finish with?",
   "options": ["53", "103", "153", "203"], "answer": 0, "reveal": "53. Vanderbilt also forced three interceptions; Joshua Dobbs went 11 of 19 for 53 yards and was picked off twice.",
   "source": recap(333272633, "The Commodores still held Tennessee to 53 yards passing while forcing three interceptions"), "verified": True, "marquee": True}],
 "MISS|MSST": [{"type": "mc", "prompt": "The 2013 Egg Bowl went to overtime: Mississippi State scored first, 17–10. How did Ole Miss's last chance end?",
   "options": ["Bo Wallace fumbled; Mississippi State recovered in the end zone", "An interception in the end zone", "A missed field goal", "A turnover on downs at the 1"], "answer": 0,
   "reveal": "Bo Wallace fumbled and Jamerson Love recovered in the end zone. Wallace had also thrown three first-half interceptions.",
   "source": recap(333320344, "the drive ended when quarterback Bo Wallace fumbled and Mississippi State's Jamerson Love recovered the ball in the end zone"), "verified": True, "marquee": True}],
 "ARIZ|ASU": [{"type": "mc", "prompt": "2012: Arizona led Arizona State 27–17 after three quarters. Arizona State won 41–34. How many points did the Sun Devils score in the fourth quarter?",
   "options": ["24", "14", "17", "21"], "answer": 0, "reveal": "24, turning two turnovers and a blocked punt into three touchdowns. Arizona still out-gained them, 522 to 460.",
   "source": recap(323280012, "Arizona State scores 24 in fourth quarter to rally vs. Arizona"), "verified": True, "marquee": True}],
 "GT|UGA": [{"type": "mc", "prompt": "2012: No. 3 Georgia beat Georgia Tech 42–10. Safety Bacarri Rambo's interception that day tied Jake Scott's school record for career interceptions. Which career interception was it?",
   "options": ["16th", "14th", "15th", "17th"], "answer": 0, "reveal": "His 16th. He also stripped the ball at the Georgia 1 to stop Georgia Tech's first possession.",
   "source": recap(323290061, "grabbing his 16th career interception to tie Jake Scott's school record"), "verified": True, "marquee": True}],
}
d = json.load(open('data/curated.json'))
for a, b in PAIRS:
  p = pk(a, b)
  m = next((m for m in d['matchups'] if {m['a'], m['b']} == {a, b}), None)
  if not m: m = {"a": a, "b": b, "name": f"{S[a]}–{S[b]}", "items": []}; d['matchups'].append(m)
  m['items'] = [i for i in m['items'] if not i.get('marquee')] + items[p] + EXTRA.get(p, [])
  print(p, len(items[p]), "data +", len(EXTRA.get(p, [])), "recap")
json.dump(d, open('data/curated.json', 'w'), indent=1, ensure_ascii=False); open('data/curated.json', 'a').write("\n")
