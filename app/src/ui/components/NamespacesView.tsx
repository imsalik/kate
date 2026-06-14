import type { View } from "../../types";
import { C } from "../theme";
import { filterNamespaces } from "../nav";

export function NamespacesView({
  view,
  height,
  current,
}: {
  view: Extract<View, { kind: "namespaces" }>;
  height: number;
  current: string;
}) {
  const items = filterNamespaces(view.all, view.filter);
  const viewH = Math.max(1, height - 1); // count line
  const start = Math.min(
    Math.max(0, view.index - Math.floor(viewH / 2)),
    Math.max(0, items.length - viewH),
  );
  const window = items.slice(start, start + viewH);
  const count = view.filter
    ? `${items.length}/${view.all.length} · filter: ${view.filter}`
    : `${items.length} namespaces`;
  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={C.textDim}>{count}</text>
      {window.map((ns, i) => {
        const idx = start + i;
        const sel = idx === view.index;
        const isCurrent = ns === current;
        const fg = sel ? C.bg : isCurrent ? C.accentLight : C.text;
        return (
          <box key={idx} backgroundColor={sel ? C.accent : undefined}>
            <text fg={fg}>{isCurrent ? "▸ " : "  "}{ns}</text>
          </box>
        );
      })}
      {items.length === 0 && <text fg={C.textDim}>  no namespace matches</text>}
    </box>
  );
}
