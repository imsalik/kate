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
