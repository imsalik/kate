// Lightweight syntax colorizers. OpenTUI ships Tree-sitter grammars only for a
// few languages (no YAML/JSON), so we hand-tokenize describe output and log
// lines into colored segments. Each segment is a {text, fg} run.

import { C } from "./theme";

export type Seg = { t: string; fg: string; bg?: string };

// Clip a segment list to a max display width, splitting the segment that
// straddles the boundary so colors stay aligned.
export function truncSegs(segs: Seg[], width: number): Seg[] {
  let used = 0;
  const out: Seg[] = [];
  for (const s of segs) {
    if (used >= width) break;
    const room = width - used;
    if (s.t.length <= room) {
      out.push(s);
      used += s.t.length;
    } else {
      out.push({ t: s.t.slice(0, room), fg: s.fg, bg: s.bg });
      used += room;
    }
  }
  return out;
}

// ----- YAML (describe pane) ----------------------------------------------

function colorScalar(v: string): string {
  const s = v.trim();
  if (s === "") return C.text;
  if (/^-?\d+(\.\d+)?$/.test(s)) return C.accentLight; // numbers
  if (/^(true|false|null|~)$/i.test(s)) return C.accentLight; // bool/null
  if (/^['"].*['"]$/.test(s)) return C.text; // quoted string
  return C.text;
}

export function yamlSegs(line: string): Seg[] {
  const indentLen = line.length - line.trimStart().length;
  const indent = line.slice(0, indentLen);
  let rest = line.slice(indentLen);
  const segs: Seg[] = [];
  if (indent) segs.push({ t: indent, fg: C.text });

  // Comment line.
  if (rest.startsWith("#")) {
    segs.push({ t: rest, fg: C.textDim });
    return segs;
  }
  // List item: dim the "- " then treat the remainder as a value/key.
  while (rest.startsWith("- ")) {
    segs.push({ t: "- ", fg: C.accentDim });
    rest = rest.slice(2);
  }
  if (rest === "-") {
    segs.push({ t: "-", fg: C.accentDim });
    return segs;
  }
  // key: value  (only split on the first ": " that isn't inside quotes/braces).
  const m = rest.match(/^([^:\s][^:]*?):(\s|$)(.*)$/);
  if (m) {
    segs.push({ t: m[1]!, fg: C.accent }); // key
    segs.push({ t: ":", fg: C.textDim });
    const val = m[3] ?? "";
    if (m[2] === " ") segs.push({ t: " ", fg: C.text });
    if (val) segs.push({ t: val, fg: colorScalar(val) });
  } else {
    segs.push({ t: rest, fg: C.text });
  }
  return segs;
}

// ----- JSON / logs --------------------------------------------------------

// Colorize a JSON fragment: keys (the string before a `:`), string values,
// numbers, and literals.
function jsonSegs(line: string): Seg[] {
  const segs: Seg[] = [];
  const n = line.length;
  let i = 0;
  let buf = "";
  const flush = () => { if (buf) { segs.push({ t: buf, fg: C.textDim }); buf = ""; } };
  while (i < n) {
    const ch = line[i]!;
    if (ch === '"') {
      flush();
      let j = i + 1;
      let str = '"';
      while (j < n) {
        const cj = line[j]!;
        str += cj;
        if (cj === "\\" && j + 1 < n) { str += line[j + 1]; j += 2; continue; }
        j++;
        if (cj === '"') break;
      }
      let k = j;
      while (k < n && line[k] === " ") k++;
      const isKey = line[k] === ":";
      segs.push({ t: str, fg: isKey ? C.accent : C.ok });
      i = j;
    } else if ((ch === "-" || (ch >= "0" && ch <= "9")) && /[\s:,[{]/.test(line[i - 1] ?? " ")) {
      flush();
      let j = i;
      let num = "";
      while (j < n && /[-0-9.eE+]/.test(line[j]!)) { num += line[j]; j++; }
      segs.push({ t: num, fg: C.accentLight });
      i = j;
    } else if (line.startsWith("true", i) || line.startsWith("false", i) || line.startsWith("null", i)) {
      flush();
      const w = line.startsWith("true", i) ? "true" : line.startsWith("false", i) ? "false" : "null";
      segs.push({ t: w, fg: C.warn });
      i += w.length;
    } else {
      buf += ch;
      i++;
    }
  }
  flush();
  return segs;
}

// Color a log-level word.
function levelHex(word: string): string {
  if (/error|critical|fatal|fail/i.test(word)) return C.danger;
  if (/warn/i.test(word)) return C.warn;
  if (/info|notice/i.test(word)) return C.ok;
  return C.textDim; // debug / trace
}

// Color the non-JSON part of a log line: highlight a leading level token
// (INFO/WARNING/ERROR/…), leave the rest as normal text.
function logPrefixSegs(prefix: string): Seg[] {
  const m = prefix.match(/^(\s*)(ERROR|WARNING|WARN|INFO|DEBUG|TRACE|CRITICAL|FATAL|NOTICE)\b(.*)$/i);
  if (m) return [{ t: m[1]!, fg: C.text }, { t: m[2]!, fg: levelHex(m[2]!) }, { t: m[3]!, fg: C.text }];
  return prefix ? [{ t: prefix, fg: C.text }] : [];
}

// A full log line: a level/prefix portion (e.g. "INFO:  ") followed by an
// optional embedded JSON object. Many loggers emit "<level> <json>", so we find
// the first `{` and JSON-colorize from there.
export function logLineSegs(l: string): Seg[] {
  const brace = l.indexOf("{");
  if (brace >= 0) return [...logPrefixSegs(l.slice(0, brace)), ...jsonSegs(l.slice(brace))];
  return logPrefixSegs(l);
}

// Soft-wrap a segment list into multiple display rows of at most `width` cells,
// preserving per-segment colors across the wrap boundary.
export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  if (width < 1) return [segs];
  const rows: Seg[][] = [];
  let row: Seg[] = [];
  let used = 0;
  for (const s of segs) {
    let text = s.t;
    while (text.length > 0) {
      const room = width - used;
      if (text.length <= room) {
        row.push({ t: text, fg: s.fg, bg: s.bg });
        used += text.length;
        text = "";
      } else {
        row.push({ t: text.slice(0, room), fg: s.fg, bg: s.bg });
        text = text.slice(room);
        rows.push(row);
        row = [];
        used = 0;
      }
    }
  }
  if (row.length || rows.length === 0) rows.push(row);
  return rows;
}

// ----- search (highlight + jump) -----------------------------------------

// A single substring hit: which source line, the start column, and the match
// length. Search is case-insensitive and non-overlapping, left to right.
export type Match = { line: number; col: number; len: number };

export function findMatches(lines: string[], term: string): Match[] {
  const out: Match[] = [];
  if (!term) return out;
  const needle = term.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const hay = lines[i]!.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      out.push({ line: i, col: idx, len: needle.length });
      from = idx + needle.length;
    }
  }
  return out;
}

// Paint match backgrounds onto a line's colored segments. `cols` are the start
// columns of matches on this line (absolute, pre-truncation); `activeCol` is the
// column of the n/N-selected match if it's on this line, else -1. Matched runs
// take the search style (fg/bg flipped for contrast) — the active one a brighter
// bg. We walk char-by-char so a match that straddles a color boundary still
// highlights cleanly; only ever runs on the handful of visible rows.
export function highlightSegs(
  segs: Seg[],
  cols: number[],
  len: number,
  match: { fg: string; bg: string },
  active: { fg: string; bg: string },
  activeCol: number,
): Seg[] {
  if (cols.length === 0 || len === 0) return segs;
  const styleAt = (abs: number): { fg: string; bg: string } | null => {
    for (const c of cols) if (abs >= c && abs < c + len) return c === activeCol ? active : match;
    return null;
  };
  const out: Seg[] = [];
  let pos = 0;
  for (const s of segs) {
    let cur = "";
    let curStyle: { fg: string; bg: string } | null | undefined = undefined;
    for (let k = 0; k < s.t.length; k++) {
      const st = styleAt(pos + k);
      if (st !== curStyle) {
        if (cur) out.push(curStyle ? { t: cur, fg: curStyle.fg, bg: curStyle.bg } : { t: cur, fg: s.fg, bg: s.bg });
        cur = "";
        curStyle = st;
      }
      cur += s.t[k];
    }
    if (cur) out.push(curStyle ? { t: cur, fg: curStyle.fg, bg: curStyle.bg } : { t: cur, fg: s.fg, bg: s.bg });
    pos += s.t.length;
  }
  return out;
}
