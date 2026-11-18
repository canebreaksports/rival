// Minimal parser for Wikipedia college-statistics tables (wikitext). Pure, so it is unit-tested.

export interface ParsedRow { year: number | "career"; team: string | null; stats: Partial<Record<StatName, number | null>> }
export type StatName = "rush" | "rushTD" | "att" | "rec" | "recTD" | "recN";
export interface ParsedTable { columns: string[]; rows: ParsedRow[]; hasTeamColumn: boolean }

/** Strips links, templates, refs, bold/italic and HTML from a cell. */
export function cleanCell(s: string): string {
  let t = s.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  t = t.replace(/\{\{\s*(?:abbr|abbreviation|tooltip|tt)\s*\|\s*([^|}]*)\|[^{}]*\}\}/gi, "$1"); // {{abbr|Yds|Rushing yards}} → Yds
  t = t.replace(/\{\{\s*sortname\s*\|\s*([^|}]*)\|\s*([^|}]*)(?:\|[^{}]*)?\}\}/gi, "$1 $2");    // {{sortname|Bo|Jackson}} → Bo Jackson
  for (let i = 0; i < 3; i++) t = t.replace(/\{\{[^{}]*\}\}/g, m => {
    const sort = m.match(/^\{\{\s*(?:sort|nts|ntsh)\s*\|\s*(?:[^|}]*\|)?\s*([^|}]*)\}\}$/i); // keep the displayed value of sort templates
    return sort ? sort[1] : "";
  });
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")      // [[target|text]] → text
       .replace(/\[(?:https?:)?\/\/\S+\s+([^\]]*)\]/g, "$1")   // [url text] → text
       .replace(/'{2,}/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
  return t.trim();
}

interface Cell { text: string; colspan: number; rowspan: number }

/** Splits "attr | content" while ignoring pipes inside links (already removed) */
function cell(raw: string): Cell {
  let attrs = "", text = raw;
  const m = raw.match(/^([^|]*=[^|]*)\|(?!\|)([\s\S]*)$/); // attributes contain "="
  if (m) { attrs = m[1]; text = m[2]; }
  const num = (k: string) => Number(attrs.match(new RegExp(k + `\\s*=\\s*"?(\\d+)`))?.[1] ?? 1);
  return { text: cleanCell(text), colspan: num("colspan"), rowspan: num("rowspan") };
}

/** Tokenizes one wikitable into rows of cells. */
export function tableRows(table: string): Cell[][] {
  const body = table.replace(/^\{\|[^\n]*\n/, "").replace(/\n?\|\}\s*$/, "");
  const rows: Cell[][] = [];
  for (const chunk of body.split(/\n\|-[^\n]*/)) {
    const cells: Cell[] = [];
    for (const line of chunk.split("\n")) {
      const l = line.trim();
      if (!l || l.startsWith("|+") || l.startsWith("|-")) continue; // captions and row separators aren't cells
      if (!(l.startsWith("|") || l.startsWith("!"))) { if (cells.length) cells[cells.length - 1].text += " " + cleanCell(l); continue; }
      // drop citations, then protect pipes inside links and templates before splitting on || / !!
      let protectedLine = l.slice(1).replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
        .replace(/\[\[[^\]]*\]\]/g, m => m.replace(/\|/g, "\u0001"));
      for (let i = 0; i < 3; i++) protectedLine = protectedLine.replace(/\{\{[^{}]*\}\}/g, m => m.replace(/\|/g, "\u0001").replace(/\{\{/, "\u0002").replace(/\}\}$/, "\u0003"));
      protectedLine = protectedLine.replace(/\u0002/g, "{{").replace(/\u0003/g, "}}");
      for (const part of protectedLine.split(/\|\||!!/)) cells.push(cell(part.replace(/\u0001/g, "|")));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** Expands colspans/rowspans into a rectangular grid of strings. */
function grid(rows: Cell[][]): string[][] {
  const out: string[][] = [], pending: { text: string; left: number }[] = [];
  for (const r of rows) {
    const line: string[] = [];
    let ci = 0;
    const fillPending = () => { while (pending[line.length]?.left > 0) { line.push(pending[line.length].text); pending[line.length - 1].left-- } };
    for (const c of r) {
      fillPending();
      for (let k = 0; k < c.colspan; k++) {
        if (c.rowspan > 1) pending[line.length] = { text: c.text, left: c.rowspan - 1 };
        line.push(c.text);
      }
      ci++;
    }
    fillPending();
    out.push(line);
  }
  return out;
}

const yearOf = (s: string) => { const m = s.match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : null };
const isCareer = (s: string) => /^(career|total|totals|college totals?)$/i.test(s.trim());
const toNum = (s: string | undefined) => {
  if (s == null) return null;
  const t = s.replace(/[,\s*†‡]/g, "").replace(/[−–]/g, "-");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

/** Parses a college stats table with grouped headers (Rushing / Receiving). Returns null if it isn't one. */
export function parseStatsTable(table: string): ParsedTable | null {
  const rows = tableRows(table);
  const headerRows = [] as Cell[][];
  for (const r of rows) { if (r.some(c => yearOf(c.text) || isCareer(c.text))) break; headerRows.push(r) }
  if (!headerRows.length) return null;
  const hg = grid(headerRows);
  const width = Math.max(...hg.map(r => r.length));
  const columns = Array.from({ length: width }, (_, i) => {
    const parts = hg.map(r => r[i] ?? "").filter((x, j, a) => x && a.indexOf(x) === j);
    return parts.join(" ").trim();
  });
  if (!columns.some(c => /^Rushing/i.test(c)) && !columns.some(c => /^Receiving/i.test(c))) return null;
  const find = (group: RegExp, sub: RegExp) => columns.findIndex(c => group.test(c) && sub.test(c.replace(group, "").trim()));
  const idx: Record<StatName, number> = {
    att: find(/^Rushing/i, /^(Att|Car|Carries|Rush|No\.?)$/i),
    rush: find(/^Rushing/i, /^(Yds|Yards)$/i),
    rushTD: find(/^Rushing/i, /^(TD|TDs)$/i),
    recN: find(/^Receiving/i, /^(Rec|Receptions|No\.?)$/i),
    rec: find(/^Receiving/i, /^(Yds|Yards)$/i),
    recTD: find(/^Receiving/i, /^(TD|TDs)$/i),
  };
  const teamCol = columns.findIndex(c => /^(Team|School)$/i.test(c));
  const yearCol = columns.findIndex(c => /^(Season|Year)$/i.test(c));
  const body = grid(rows.slice(headerRows.length));
  const out: ParsedRow[] = [];
  for (const r of body) {
    const lead = r[yearCol >= 0 ? yearCol : 0] ?? "";
    const year = isCareer(lead) || isCareer(r[0] ?? "") ? "career" : yearOf(lead);
    if (year == null) continue;
    const stats: ParsedRow["stats"] = {};
    for (const [k, i] of Object.entries(idx) as [StatName, number][]) if (i >= 0) stats[k] = toNum(r[i]);
    out.push({ year, team: teamCol >= 0 ? (r[teamCol] ?? null) : null, stats });
  }
  return out.length ? { columns, rows: out, hasTeamColumn: teamCol >= 0 } : null;
}

/** All wikitables in an article. */
export const tablesIn = (wikitext: string) => wikitext.match(/\{\|[\s\S]*?\n\|\}/g) ?? [];
