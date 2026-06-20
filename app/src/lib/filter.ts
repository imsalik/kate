// Column-aware parsing for the `/` list filter.
//
// A token shaped `col:value` (e.g. `ingest:true`) constrains a single column:
// `col` resolves to a header by exact, then unique-prefix, match (so `ing:true`
// works too) and the row's cell there must contain `value` — both
// case-insensitive. Tokens whose prefix doesn't resolve to a column are left as
// free text and fuzzy-matched against the whole row, so plain filtering is
// unchanged and `foo:bar` (no such column) still does something sensible.

export interface ColTerm {
  idx: number; // column index into a row's cells
  value: string; // lowercased substring the cell must contain
}

export interface ParsedFilter {
  cols: ColTerm[];
  text: string; // remaining free-text tokens, space-joined, for fuzzy matching
}

function resolveColumn(name: string, headers: string[]): number {
  const lc = name.toLowerCase();
  const lower = headers.map((h) => h.toLowerCase());
  const exact = lower.indexOf(lc);
  if (exact !== -1) return exact;
  const prefixes = lower.map((h, i) => (h.startsWith(lc) ? i : -1)).filter((i) => i !== -1);
  return prefixes.length === 1 ? prefixes[0]! : -1; // ambiguous prefix → not a column
}

export function parseFilter(query: string, headers: string[]): ParsedFilter {
  const cols: ColTerm[] = [];
  const rest: string[] = [];
  for (const tok of query.split(/\s+/).filter(Boolean)) {
    const ci = tok.indexOf(":");
    if (ci > 0) {
      const idx = resolveColumn(tok.slice(0, ci), headers);
      if (idx !== -1) {
        cols.push({ idx, value: tok.slice(ci + 1).toLowerCase() });
        continue;
      }
    }
    rest.push(tok);
  }
  return { cols, text: rest.join(" ") };
}

// Every column term must be satisfied (AND).
export function matchesCols(cells: string[], cols: ColTerm[]): boolean {
  for (const c of cols) {
    if (!(cells[c.idx] ?? "").toLowerCase().includes(c.value)) return false;
  }
  return true;
}

// ----- column-name completion (Tab in the filter) -------------------------
// We only ever append to the query (no mid-string cursor), so the token being
// typed is the trailing run of non-spaces.
function lastToken(query: string): string {
  const m = query.match(/\S*$/);
  return m ? m[0] : "";
}

// Headers the current pre-colon token could complete to. Empty once the token
// has a `:` (column already chosen) or matches nothing — i.e. when there's
// nothing to suggest.
export function columnMatches(query: string, headers: string[]): string[] {
  const tok = lastToken(query);
  if (!tok || tok.includes(":")) return [];
  const lc = tok.toLowerCase();
  return headers.filter((h) => h && h.toLowerCase().startsWith(lc));
}

function commonPrefix(xs: string[]): string {
  if (xs.length === 0) return "";
  let p = xs[0]!;
  for (const x of xs.slice(1)) {
    let i = 0;
    while (i < p.length && i < x.length && p[i] === x[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

// Tab-complete the current token toward a column. One match → full header + ":"
// (so filtering begins as soon as you type a value). Several → extend to their
// longest common prefix, shell-style. None / no progress → unchanged.
export function completeColumn(query: string, headers: string[]): string {
  const matches = columnMatches(query, headers);
  if (matches.length === 0) return query;
  const tok = lastToken(query);
  const head = query.slice(0, query.length - tok.length);
  if (matches.length === 1) return head + matches[0]!.toLowerCase() + ":";
  const cp = commonPrefix(matches.map((h) => h.toLowerCase()));
  return cp.length > tok.length ? head + cp : query;
}
