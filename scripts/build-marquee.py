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
    meet = lambda g: f"{tag(p, g, g['away'])} at {tag(p, g, g['home'])}{' (OT)' if ot(p, g) else ''}"  # no score or winner: those would give away the classic finish
    ent = lambda g: {"name": meet(g), "yards": 0, "season": g['season'], "label": meet(g), "profile": meet(g)}
    out.append({"type": "mc", "prompt": f"Of the {len(gs)} {S[a]}–{S[b]} games from 2000 through 2025, how many were decided by 3 points or fewer, or in overtime?",
      "options": [str(x) for x in opts], "answer": 0,
      "reveal": f"{n}.", "after": " · ".join(f"{g['season']} ({meet(g)})" for g in close) + ".",
      "years": {"prompt": f"Name the {n} seasons.", "a": a, "b": b, "A": [ent(g) for g in close if wl(g)[0] == a], "B": [ent(g) for g in close if wl(g)[0] == b]},
      "source": SRC, "verified": True, "marquee": True})
  def score(g):
    w, l = wl(g); walk = any(x['season'] == g['season'] for x in W.get(p, {}).get('list', []))
    return (2 if rank(p, g, w) and rank(p, g, l) else 1 if rank(p, g, w) or rank(p, g, l) else 0) + (1 if walk else 0) + (1 if rank(p, g, l) and not rank(p, g, w) else 0) + (1 if abs(g['hp'] - g['ap']) <= 1 else 0)
  if p == "ARK|LSU":
    out.append({"type": "mc", "prompt": "2007: Arkansas won at No. 1 LSU, 50–48, a game that went to overtime. How many overtimes did it take?",
      "options": ["3", "1", "2", "4"], "answer": 0, "reveal": "Three overtimes. Darren McFadden ran for 206 yards; Arkansas scored 22 points in overtime to LSU's 20.",
      "source": "Wikipedia \"2007 LSU Tigers football team\" (revision 1367377976) and \"2007 Arkansas Razorbacks football team\" (revision 1361825609) schedules: 48–50 / 50–48, 3OT; overtime points: ESPN line score, event 273270099; McFadden: data/rivalry.json (ESPN box)",
      "verified": True, "marquee": True})
    close_classic = False
  else: close_classic = True
  if close and close_classic:
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
   "reveal": "Twist: Ohio State turned it over 3 times; Michigan never did, and still lost. Ohio State out-gained Michigan 503 to 397.",
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
   "options": ["4", "0", "1", "2"], "answer": 0, "reveal": "Twist: a career-high 4, three of them in the first quarter. Florida State won anyway.",
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
# ---- owner review round (Nov 2026): swaps and bonuses ----
RB = "data/rivalry.json (box scores: CollegeFootballData /games/players 2012+, ESPN game summaries before)"
REC_BOOK = lambda pages: "School record books via Wikipedia statistical leaders pages (" + pages + "), data/season-records.json / data/career-*.json"
def more(pk, items): EXTRA.setdefault(pk, []).extend(items)
more("TAMU|TEX", [
 {"type": "rank", "prompt": "Rank these Texas and Texas A&M seasons by yards, highest first.",
  "items": [{"label": "Trayveon Williams (Texas A&M, 2018) · rushing yards", "value": 1760, "school": "TAMU"},
            {"label": "Earl Campbell (Texas, 1977) · rushing yards", "value": 1744, "school": "TEX"},
            {"label": "Jordan Shipley (Texas, 2009) · receiving yards", "value": 1485, "school": "TEX"},
            {"label": "Kyler Murray (Texas A&M, 2015) · passing + rushing yards", "value": 1021, "school": "TAMU"}],
  "unit": "yds", "note": "Williams 1,760 and Campbell 1,744 are their schools' record-book seasons (Williams is A&M's single-season record). Murray, as an A&M freshman: 686 passing + 335 rushing.",
  "source": REC_BOOK("Texas A&M, Texas") + "; Kyler Murray 2015: CollegeFootballData /stats/player/season (686 passing, 335 rushing yards)", "verified": True, "marquee": True},
 {"type": "mc", "prompt": "2009: No. 3 Texas won at Texas A&M, 49–39. The game's leading rusher ran for 175 yards. Who was it?",
  "options": ["Colt McCoy (Texas QB)", "Tre' Newton (Texas RB)", "Christine Michael (Texas A&M RB)", "Jerrod Johnson (Texas A&M QB)"], "answer": 0,
  "reveal": "Quarterback Colt McCoy, 175 rushing yards. Also over 75: Tre' Newton 107, Jerrod Johnson 97, Christine Michael 83.",
  "source": RB + " (2009 box: McCoy 175, Newton 107, Johnson 97, Michael 83); AP rank: data/game-ranks.json", "verified": True, "marquee": True}])
more("LOU|UK", [
 {"type": "rank", "prompt": "Rank these single-game rushing performances in Louisville–Kentucky games since 2004, highest first.",
  "items": [{"label": "Benny Snell Jr. (Kentucky, 2017)", "value": 211, "school": "UK"}, {"label": "Lamar Jackson (Louisville, 2015)", "value": 186, "school": "LOU"},
            {"label": "Rafael Little (Kentucky, 2007)", "value": 151, "school": "UK"}, {"label": "Lionel Gates (Louisville, 2004)", "value": 112, "school": "LOU"}],
  "unit": "yds", "note": "Snell: 29 carries, 211 yards, 2 TD (2017). Jackson: 17 carries, 186 yards, 2 TD (2015).",
  "source": RB, "verified": True, "marquee": True}])
more("CLEM|SC", [
 {"type": "rank", "prompt": "Rank these single-game rushing performances in South Carolina–Clemson games since 2004, highest first.",
  "items": [{"label": "Wayne Gallman (Clemson, 2014)", "value": 191, "school": "CLEM"}, {"label": "LaNorris Sellers (South Carolina, 2024)", "value": 166, "school": "SC"},
            {"label": "C.J. Spiller (Clemson, 2006)", "value": 155, "school": "CLEM"}, {"label": "Cory Boyd (South Carolina, 2006)", "value": 106, "school": "SC"}],
  "unit": "yds", "note": "Gallman: 27 carries, 191 yards (2014). Sellers: 16 carries, 166 yards, 2 TD (2024). Spiller: 10 carries, 155 yards, 2 TD (2006). Boyd: 16 carries, 106 yards (2006).",
  "source": RB, "verified": True, "marquee": True}])
more("MISS|MSST", [
 {"type": "rank", "prompt": "Rank these ball carriers by career rushing yards at their school, highest first.",
  "items": [{"label": "Anthony Dixon (Mississippi State)", "value": 3994, "school": "MSST"}, {"label": "Jerious Norwood (Mississippi State)", "value": 3212, "school": "MSST"},
            {"label": "Deuce McAllister (Ole Miss)", "value": 3060, "school": "MISS"}, {"label": "Brandon Bolden (Ole Miss)", "value": 2604, "school": "MISS"}],
  "unit": "yds", "note": "Career totals from each school's record book.",
  "names": {"prompt": "Bonus: name the other 6 players in Mississippi State and Ole Miss's combined top 10 for career rushing yards.", "a": "MSST", "b": "MISS",
   "A": [{"name": "Nick Fitzgerald", "yards": 3607, "label": "3,607", "profile": "Mississippi State QB · 3,607 career rushing yards · No. 2 on the combined list"},
         {"name": "Walter Packer", "yards": 2820, "label": "2,820", "profile": "Mississippi State · 2,820 career rushing yards · No. 5"},
         {"name": "Michael Davis", "yards": 2721, "label": "2,721", "profile": "Mississippi State · 2,721 career rushing yards · No. 8"}],
   "B": [{"name": "Joe Gunn", "yards": 2749, "label": "2,749", "profile": "Ole Miss · 2,749 career rushing yards · No. 6"},
         {"name": "Quinshon Judkins", "yards": 2725, "label": "2,725", "profile": "Ole Miss · 2,725 career rushing yards · No. 7"},
         {"name": "Kayo Dottley", "yards": 2654, "label": "2,654", "profile": "Ole Miss · 2,654 career rushing yards · No. 9"}]},
  "source": REC_BOOK("Mississippi State, Ole Miss career rushing"), "verified": True, "marquee": True}])
more("TENN|VAN", [
 {"type": "rank", "prompt": "Rank these pass catchers by career receiving yards at their school, highest first.",
  "items": [{"label": "Jordan Matthews (Vanderbilt, 2010–13)", "value": 3759, "school": "VAN"}, {"label": "Dan Stricker (Vanderbilt, 1999–02)", "value": 2880, "school": "VAN"},
            {"label": "Joey Kent (Tennessee, 1993–96)", "value": 2814, "school": "TENN"}, {"label": "Jauan Jennings (Tennessee, 2015–19)", "value": 2153, "school": "TENN"}],
  "unit": "yds", "note": "Career totals from each school's record book.", "source": REC_BOOK("Tennessee, Vanderbilt career receiving"), "verified": True, "marquee": True}])
more("MIZ|OU", [
 {"type": "h2h", "prompt": "Who had more college receiving touchdowns (at the school shown)?",
  "A": {"label": "Albert Okwuegbunam (Missouri TE)", "value": 23, "school": "MIZ"}, "B": {"label": "Dede Westbrook (Oklahoma WR)", "value": 21, "school": "OU"}, "unit": "TD",
  "upset": True, "note": "Upset: tight end Albert Okwuegbunam 23, Biletnikoff winner Dede Westbrook 21 (4 in 2015, 17 in 2016).",
  "source": "CollegeFootballData /stats/player/season (Okwuegbunam 11/6/6 at Missouri 2017–19; Westbrook 4/17 at Oklahoma 2015–16)", "verified": True, "marquee": True},
 {"type": "rank", "prompt": "Rank these Oklahoma and Missouri pass catchers by career receiving yards at their school, highest first.",
  "items": [{"label": "Ryan Broyles (Oklahoma, 2008–11)", "value": 4586, "school": "OU"}, {"label": "Sterling Shepard (Oklahoma, 2012–15)", "value": 3482, "school": "OU"},
            {"label": "Danario Alexander (Missouri, 2006–09)", "value": 2778, "school": "MIZ"}, {"label": "Jeremy Maclin (Missouri, 2007–08)", "value": 2315, "school": "MIZ"}],
  "unit": "yds", "note": "Career totals from each school's record book. Maclin did it in two seasons.", "source": REC_BOOK("Oklahoma, Missouri career receiving"), "verified": True, "marquee": True}])
more("UCLA|USC", [
 {"type": "rank", "prompt": "Rank these USC and UCLA seasons by yards, highest first.",
  "items": [{"label": "Reggie Bush (USC, 2005) · rushing yards", "value": 1740, "school": "USC"}, {"label": "Marqise Lee (USC, 2012) · receiving yards", "value": 1721, "school": "USC"},
            {"label": "Paul Perkins (UCLA, 2014) · rushing yards", "value": 1575, "school": "UCLA"}, {"label": "Freddie Mitchell (UCLA, 2000) · receiving yards", "value": 1494, "school": "UCLA"}],
  "unit": "yds", "note": "Single seasons from each school's record book.", "source": REC_BOOK("USC, UCLA single season"), "verified": True, "marquee": True}])
# bonuses on existing recap questions
for it in EXTRA["MICH|OSU"]:
  if "Gholston" in it.get("prompt", ""):
    it["names"] = {"prompt": "Bonus: name the game's leading rusher.", "a": "MICH", "b": "OSU", "A": [],
      "B": [{"name": "Chris 'Beanie' Wells", "yards": 222, "label": "39 carries, 222 yds, 2 TD", "profile": "Ohio State RB · 39 carries, 222 yards, 2 TD (career high)"}]}
    it["source"] += "; Chris Wells 222 yards: same recap and " + RB
for it in EXTRA["TENN|VAN"]:
  if "53" in it.get("reveal", ""):
    it["names"] = {"prompt": "Bonus: name Tennessee's quarterback.", "a": "TENN", "b": "VAN", "A": [{"name": "Joshua Dobbs", "yards": 53, "label": "11 of 19, 53 yds, 2 INT", "profile": "Tennessee QB · 11 of 19 for 53 yards, 2 interceptions"}], "B": []}
for it in EXTRA["MISS|MSST"]:
  if "last chance" in it.get("prompt", ""):
    it["options"] = ["A fumble in the end zone", "An interception", "A missed field goal", "A turnover on downs"]

# ---- owner review round 2 (Nov 2026) ----
for it in EXTRA["MICH|OSU"]:
  if "Gholston" in it.get("prompt", ""):
    it["reveal"] = "3 of Ohio State's 4 sacks. Michigan finished with 91 total yards and 15 rushing."; it["after"] = "Chris \"Beanie\" Wells led everyone with 222 rushing yards (39 carries, 2 TD)."
for it in EXTRA["TENN|VAN"]:
  if "53" in it.get("reveal", ""):
    it["reveal"] = "53 passing yards. Vanderbilt also forced three interceptions."; it["after"] = "Joshua Dobbs went 11 of 19 for 53 yards and was picked off twice."
more("FLA|FSU", [{"type": "h2h", "prompt": "Who had more college receiving touchdowns (at the school shown)?",
  "A": {"label": "Kyle Pitts (Florida TE)", "value": 18, "school": "FLA"}, "B": {"label": "Anquan Boldin (Florida State WR)", "value": 21, "school": "FSU"}, "unit": "TD",
  "note": "Boldin 21 (1999–2002, 13 of them in 2002), Pitts 18 (2018–20, 12 of them in 2020).",
  "source": "Wikipedia \"Florida State Seminoles football statistical leaders\" (revision 1378376740): Boldin 21 career and 13 in 2002; Kyle Pitts: CollegeFootballData /stats/player/season (1, 5, 12)", "verified": True, "marquee": True}])
more("MIZ|OU", [{"type": "rank", "prompt": "Rank these ball carriers by career rushing yards at their school, highest first.",
  "items": [{"label": "Brad Smith (Missouri)", "value": 4289, "school": "MIZ"}, {"label": "Billy Sims (Oklahoma)", "value": 4118, "school": "OU"},
            {"label": "Adrian Peterson (Oklahoma)", "value": 4045, "school": "OU"}, {"label": "Zack Abron (Missouri)", "value": 3198, "school": "MIZ"}],
  "unit": "yds", "note": "Career totals from each school's record book. Brad Smith, a quarterback, is Missouri's career leader.",
  "names": {"prompt": "Bonus: name the other 7 players in Oklahoma and Missouri's combined top 10 for career rushing yards.", "a": "OU", "b": "MIZ",
   "A": [{"name": n, "yards": y, "label": f"{y:,}", "profile": f"Oklahoma · {y:,} career rushing yards · No. {r} on the combined list"} for n, y, r in [("Samaje Perine", 4122, 2), ("Joe Washington", 4071, 4), ("Steve Owens", 4041, 6), ("Quentin Griffin", 3938, 7), ("DeMarco Murray", 3685, 9), ("De'Mond Parker", 3403, 10)]],
   "B": [{"name": "Larry Rountree III", "yards": 3720, "label": "3,720", "profile": "Missouri · 3,720 career rushing yards · No. 8 on the combined list"}]},
  "source": REC_BOOK("Oklahoma, Missouri career rushing"), "verified": True, "marquee": True}])

d = json.load(open('data/curated.json'))
for a, b in PAIRS:
  p = pk(a, b)
  m = next((m for m in d['matchups'] if {m['a'], m['b']} == {a, b}), None)
  if not m: m = {"a": a, "b": b, "name": f"{S[a]}–{S[b]}", "items": []}; d['matchups'].append(m)
  m['items'] = [i for i in m['items'] if not i.get('marquee')] + items[p] + EXTRA.get(p, [])
  print(p, len(items[p]), "data +", len(EXTRA.get(p, [])), "recap")
json.dump(d, open('data/curated.json', 'w'), indent=1, ensure_ascii=False); open('data/curated.json', 'a').write("\n")
