import type { View } from "../../types";
import { C } from "../theme";
import { type Seg, logLineSegs, truncSegs, wrapSegs } from "../highlight";

export function LogsView({
  view,
  height,
  width,
}: {
  view: Extract<View, { kind: "logs" }>;
  height: number;
  width: number;
}) {
  const viewH = Math.max(1, height - 1); // leave a row for the status line
  const lines = view.text === "" ? [] : view.text.replace(/\n$/, "").split("\n");
  const clampedOffset = Math.min(view.bottomOffset, Math.max(0, lines.length - viewH));
  const w = Math.max(1, width);

  // Build the visible display rows (each a colored segment list). When wrapping
  // is on a source line can span several rows, so we fill from the bottom up to
  // keep the live tail pinned and never overflow the pane.
  const endLine = Math.max(0, lines.length - clampedOffset);
  let rows: Seg[][] = [];
  if (view.wrap) {
    for (let li = endLine - 1; li >= 0; li--) {
      rows = [...wrapSegs(logLineSegs(lines[li]!), w), ...rows];
      if (rows.length >= viewH) break;
    }
    rows = rows.slice(Math.max(0, rows.length - viewH));
  } else {
    const startLine = Math.max(0, endLine - viewH);
    rows = lines.slice(startLine, endLine).map((l) => truncSegs(logLineSegs(l), w));
  }

  const pinned = clampedOffset === 0;
  let statusLine: string;
  if (lines.length === 0) {
    statusLine = view.streaming ? "⏳ waiting for output — container may be idle or has no logs" : "(no logs)";
  } else {
    statusLine = `${lines.length} lines · ${pinned ? "● live tail" : "scrollback"} · ${view.wrap ? "wrap" : "nowrap"} · k/j scroll · ^u/^d page · w wrap · G tail · esc back`;
  }

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={C.textDim}>{statusLine}</text>
      {rows.map((segs, i) => (
        <text key={i}>
          {segs.map((s, j) => (
            <span key={j} fg={s.fg}>{s.t}</span>
          ))}
        </text>
      ))}
    </box>
  );
}
