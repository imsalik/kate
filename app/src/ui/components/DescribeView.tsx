import { useMemo } from "react";
import type { View } from "../../types";
import { C } from "../theme";
import { type Match, type Seg, makeHighlighter, truncSegs, yamlSegs } from "../highlight";

export function DescribeView({
  view,
  height,
  width,
  matches,
}: {
  view: Extract<View, { kind: "describe" }>;
  height: number;
  width: number;
  matches: Match[];
}) {
  const viewH = Math.max(1, height - 1);
  const lines = view.loading ? ["loading…"] : view.text.split("\n");
  const maxScroll = Math.max(0, lines.length - viewH);
  const scroll = Math.min(view.scroll, maxScroll);
  const w = Math.max(1, width);

  // YAML segments for a line, with search matches painted on top (shared painter).
  const hl = useMemo(() => makeHighlighter(matches, view.search, view.matchIdx), [matches, view.search, view.matchIdx]);
  const segsFor = (li: number): Seg[] => hl(yamlSegs(lines[li]!), li);

  // Search overrides the line counter with the term + match position, mirroring
  // the logs view's status line.
  let statusLine = `${lines.length} lines · ${scroll}/${maxScroll}`;
  let statusFg = C.textDim;
  if (view.search) {
    const pos = matches.length ? `${view.matchIdx + 1}/${matches.length}` : "no matches";
    statusLine = `/${view.search} · ${pos} · n/N jump · esc clear`;
    statusFg = matches.length ? C.accentLight : C.warn;
  }

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={statusFg}>{statusLine}</text>
      {lines.slice(scroll, scroll + viewH).map((_, i) => {
        const li = scroll + i;
        return (
          <text key={li} selectable>
            {truncSegs(segsFor(li), w).map((s, j) => (
              <span key={j} fg={s.fg} bg={s.bg}>{s.t}</span>
            ))}
          </text>
        );
      })}
    </box>
  );
}
