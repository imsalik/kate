import { useMemo } from "react";
import type { View } from "../../types";
import { C } from "../theme";
import { type Match, type Seg, logLineSegs, makeHighlighter, truncSegs, wrapSegs } from "../highlight";

export function LogsView({
  view,
  height,
  width,
  matches,
}: {
  view: Extract<View, { kind: "logs" }>;
  height: number;
  width: number;
  matches: Match[];
}) {
  const viewH = Math.max(1, height - 1); // leave a row for the status line
  const lines = view.text === "" ? [] : view.text.replace(/\n$/, "").split("\n");
  const clampedOffset = Math.min(view.bottomOffset, Math.max(0, lines.length - viewH));
  const w = Math.max(1, width);

  // Colored segments for a source line, with search matches painted on top
  // (shared painter — see makeHighlighter).
  const hl = useMemo(() => makeHighlighter(matches, view.search, view.matchIdx), [matches, view.search, view.matchIdx]);
  const segsFor = (li: number): Seg[] => hl(logLineSegs(lines[li]!), li);

  // Build the visible display rows (each a colored segment list). When wrapping
  // is on a source line can span several rows, so we fill from the bottom up to
  // keep the live tail pinned and never overflow the pane.
  const endLine = Math.max(0, lines.length - clampedOffset);
  let rows: Seg[][] = [];
  if (view.wrap) {
    for (let li = endLine - 1; li >= 0; li--) {
      rows = [...wrapSegs(segsFor(li), w), ...rows];
      if (rows.length >= viewH) break;
    }
    rows = rows.slice(Math.max(0, rows.length - viewH));
  } else {
    const startLine = Math.max(0, endLine - viewH);
    rows = [];
    for (let li = startLine; li < endLine; li++) rows.push(truncSegs(segsFor(li), w));
  }

  const pinned = clampedOffset === 0;
  let statusLine: string;
  let statusFg = C.textDim;
  if (view.search) {
    // Search overrides the tail/paused line: show the term and where you are in
    // the match list, plus the keys that move you through it.
    const pos = matches.length ? `${view.matchIdx + 1}/${matches.length}` : "no matches";
    statusLine = `/${view.search} · ${pos} · n/N jump · esc clear`;
    statusFg = matches.length ? C.accentLight : C.warn;
  } else if (lines.length === 0) {
    statusLine = view.streaming ? "⏳ waiting for output — container may be idle or has no logs" : "(no logs)";
  } else if (pinned) {
    statusLine = `● live tail · ${lines.length} lines · ${view.wrap ? "wrap" : "nowrap"}`;
    statusFg = C.ok;
  } else {
    // Paused: auto-scroll is held so reading isn't disrupted. Keep it short —
    // just say it's paused and how to get back to the live tail.
    statusLine = `⏸ paused · G for live`;
    statusFg = C.warn;
  }

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={statusFg}>{statusLine}</text>
      {rows.map((segs, i) => (
        <text key={i} selectable>
          {segs.map((s, j) => (
            <span key={j} fg={s.fg} bg={s.bg}>{s.t}</span>
          ))}
        </text>
      ))}
    </box>
  );
}
