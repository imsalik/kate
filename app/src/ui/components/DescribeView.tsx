import type { View } from "../../types";
import { C } from "../theme";
import { truncSegs, yamlSegs } from "../highlight";

export function DescribeView({
  view,
  height,
  width,
}: {
  view: Extract<View, { kind: "describe" }>;
  height: number;
  width: number;
}) {
  const viewH = Math.max(1, height - 1);
  const lines = view.loading ? ["loading…"] : view.text.split("\n");
  const maxScroll = Math.max(0, lines.length - viewH);
  const scroll = Math.min(view.scroll, maxScroll);
  const window = lines.slice(scroll, scroll + viewH);
  const w = Math.max(1, width);
  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={C.textDim}>{`${lines.length} lines · ${scroll}/${maxScroll} · j/k scroll · g top · esc back`}</text>
      {window.map((l, i) => (
        <text key={scroll + i}>
          {truncSegs(yamlSegs(l), w).map((s, j) => (
            <span key={j} fg={s.fg}>{s.t}</span>
          ))}
        </text>
      ))}
    </box>
  );
}
