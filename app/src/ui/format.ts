// Monospace layout helpers: fixed-width cells and column sizing.

import type { Table } from "../k8s";

// Pad/truncate a cell to a fixed width so columns line up in a monospace grid.
// When truncating, keep BOTH ends around a middle ellipsis — names like GKE
// contexts or pods share long common prefixes and differ in the suffix, so
// cutting only the tail would hide exactly what distinguishes them.
export function fit(s: string, w: number): string {
  if (s.length === w) return s;
  if (s.length < w) return s + " ".repeat(w - s.length);
  if (w <= 1) return s.slice(0, w);
  if (w <= 3) return s.slice(0, w - 1) + "…";
  const head = Math.ceil((w - 1) / 2);
  const tail = Math.floor((w - 1) / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

// Column widths: header length vs widest cell, capped so one fat column can't
// blow out the layout. The cap is generous so full resource/context names show
// on wide terminals; narrow terminals clip the rightmost columns.
export function colWidths(t: Table, cap = 60): number[] {
  const n = t.headers.length;
  const w = t.headers.map((h) => h.length);
  for (const r of t.rows) {
    for (let i = 0; i < n; i++) {
      w[i] = Math.max(w[i]!, (r.cells[i] ?? "").length);
    }
  }
  return w.map((x) => Math.min(x, cap));
}

const MIN_GAP = 2; // minimum space between the NAME group and the metrics group
const MIN_NAME = 12; // never shrink NAME below this
const MAX_NAME = 80; // …nor stretch it past the longest name

// Shared column layout for every list-style table (list view, container picker).
// Columns split into a left group (identity, pinned left — NAME and anything the
// caller pins) and a right group (metrics, pushed to the right edge by a flex
// spacer). Widths are the natural width (header vs widest cell) lowered by a
// uniform ceiling until the row fits `width`: the widest columns come down first,
// each floored (NAME → MIN_NAME, others → their header width), so NAME gives
// before the small metric columns. `leadWidth` is the fixed chrome to the left of
// the columns (cursor gutter + any marker gutter); `pinLeft` overrides the
// default "index ≤ NAME" split so a view can keep e.g. IMAGE beside NAME.
export function planColumns(
  headers: string[],
  rows: { cells: string[] }[],
  opts: { width: number; leadWidth: number; pinLeft?: (header: string, index: number) => boolean },
): { colW: number[]; leftIdx: number[]; rightIdx: number[]; nameIdx: number } {
  const { width, leadWidth, pinLeft } = opts;
  const nameIdx = headers.indexOf("NAME");
  const hasName = nameIdx >= 0;

  const nat = headers.map((h, i) => {
    let w = h.length;
    for (const r of rows) w = Math.max(w, (r.cells[i] ?? "").length);
    return i === nameIdx ? Math.min(MAX_NAME, w) : Math.min(60, w);
  });

  const cols = headers.map((_, i) => i);
  const isLeft = pinLeft ?? ((_h, i) => i <= nameIdx);
  const leftIdx = hasName ? cols.filter((i) => isLeft(headers[i]!, i)) : cols;
  const rightIdx = hasName ? cols.filter((i) => !isLeft(headers[i]!, i)) : [];

  const colW = nat.slice();
  if (hasName) {
    const chrome = leadWidth + MIN_GAP + 1;
    const floorOf = (i: number) =>
      i === nameIdx
        ? Math.min(nat[i] ?? MIN_NAME, MIN_NAME)
        : Math.min(nat[i] ?? 1, headers[i]?.length ?? 1);
    const widthFor = (cap: number) =>
      chrome + nat.reduce((s, w, i) => s + Math.max(floorOf(i), Math.min(w, cap)) + 1, 0);

    let cap = Math.max(MIN_NAME, ...nat);
    while (cap > 1 && widthFor(cap) > width) cap--;
    for (let i = 0; i < colW.length; i++) colW[i] = Math.max(floorOf(i), Math.min(nat[i] ?? 0, cap));
  }

  return { colW, leftIdx, rightIdx, nameIdx };
}
