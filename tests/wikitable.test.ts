import { describe, expect, it } from "vitest";
import { cleanCell, parseStatsTable, tableRows } from "@/lib/wikitable";

// Shape of a real Wikipedia college stats table (grouped two-row header, linked year/team cells, bold leaders, career row).
const TABLE = `{| class="wikitable" style="text-align:center;"
|-
! rowspan="2"| Season
! rowspan="2"| Team
! colspan="1"| Games
! colspan="4"| Rushing
! colspan="4"| Receiving
|-
! GP !! Att !! Yds !! Avg !! TD !! Rec !! Yds !! Avg !! TD
|-
! [[2001 NCAA Division I-A football season|2001]] !! [[2001 Auburn Tigers football team|Auburn]]
| 10 || 84 || 330 || 3.9 || 2 || 7 || 109 || '''15.6''' || 0
|-
! [[2002 NCAA Division I-A football season|2002]] !! [[2002 Auburn Tigers football team|Auburn]]
| '''12''' || '''175''' || '''1,008''' || 5.8 || '''13''' || 9 || 166 || 18.4 || '''1'''
|-
! colspan="2"|[https://www.sports-reference.com/cfb/players/x.html Career] !! 22 !! 259 !! 1,338 !! 5.2 !! 15 !! 16 !! 275 !! 17.2 !! 1
|}`;

describe("wikitable parser", () => {
  it("cleans links, bold and numbers", () => {
    expect(cleanCell("[[2002 Auburn Tigers football team|Auburn]]")).toBe("Auburn");
    expect(cleanCell("'''1,008'''")).toBe("1,008");
    expect(cleanCell("[https://example.com/x Career]")).toBe("Career");
  });
  it("parses grouped headers, season rows and the career line", () => {
    const t = parseStatsTable(TABLE)!;
    expect(t.hasTeamColumn).toBe(true);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[1]).toEqual({ year: 2002, team: "Auburn", stats: { att: 175, rush: 1008, rushTD: 13, recN: 9, rec: 166, recTD: 1 } });
    expect(t.rows[2].year).toBe("career");
    expect(t.rows[2].stats).toEqual({ att: 259, rush: 1338, rushTD: 15, recN: 16, rec: 275, recTD: 1 });
  });
  it("rejects tables that aren't rushing/receiving stats", () => {
    expect(parseStatsTable(`{| class="wikitable"\n! Year !! Award\n|-\n| 2004 || Heisman\n|}`)).toBeNull();
  });
});

describe("wikitable templates", () => {
  it("keeps the short label of abbr/tooltip templates", () => {
    expect(cleanCell("{{abbr|Yds|Rushing yards}}")).toBe("Yds");
    expect(cleanCell("{{sortname|Derrick|Henry|Derrick Henry (American football)}}")).toBe("Derrick Henry");
    expect(cleanCell("Fumbles{{efn|name=F|note}}")).toBe("Fumbles");
  });
});

describe("wikitable citations", () => {
  it("ignores citations (with their own pipes) inside cells", () => {
    const rows = tableRows(`{| class="wikitable"\n|-\n| 1 || [[Samaje Perine]] || 4,122<ref name=X>{{cite web|url=https://a.b/c|title=T|access-date=2017-01-28}}</ref> || 2014 2015 2016\n|}`);
    expect(rows[0].map(c => c.text)).toEqual(["1", "Samaje Perine", "4,122", "2014 2015 2016"]);
  });
});
