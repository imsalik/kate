import type { Focus } from "../../types";
import { C } from "../theme";
import type { SideEntry } from "../nav";

export function Sidebar({
  entries,
  sideIndex,
  focus,
  activeId,
  inList,
  maxRows,
  onSelect,
  onScroll,
}: {
  entries: SideEntry[];
  sideIndex: number;
  focus: Focus;
  activeId: string;
  inList: boolean;
  maxRows: number; // rendered-row budget; entries are windowed to fit a short pane
  onSelect: (id: string) => void;
  onScroll: (dir: "up" | "down" | "left" | "right") => void;
}) {
  const focused = inList && focus === "sidebar";

  // Rows a given entry costs when rendered: a (non-first) group header also
  // draws a blank spacer above it (marginTop), so it's two rows, not one.
  const cost = (i: number) => (entries[i]!.type === "header" && i > 0 ? 2 : 1);
  const total = entries.reduce((s, _e, i) => s + cost(i), 0);

  // On a pane too short to hold every kind, window the list around the current
  // selection instead of letting the rows overflow and paint over each other.
  // Keep the cursor roughly centered by growing the window up/down alternately.
  let startIdx = 0;
  let endIdx = entries.length;
  if (total > maxRows) {
    let lo = sideIndex;
    let hi = sideIndex;
    let used = cost(sideIndex);
    let up = true;
    for (;;) {
      const canUp = lo - 1 >= 0 && used + cost(lo - 1) <= maxRows;
      const canDown = hi + 1 < entries.length && used + cost(hi + 1) <= maxRows;
      if (!canUp && !canDown) break;
      if (up && canUp) { lo--; used += cost(lo); }
      else if (canDown) { hi++; used += cost(hi); }
      else { lo--; used += cost(lo); }
      up = !up;
    }
    startIdx = lo;
    endIdx = hi + 1;
  }

  return (
    <box
      width={20}
      flexShrink={0}
      flexDirection="column"
      borderStyle="rounded"
      border
      borderColor={focused ? C.accent : C.border}
      title=" resources "
      titleAlignment="left"
      onMouseScroll={(e) => e.scroll && onScroll(e.scroll.direction)}
    >
      {entries.slice(startIdx, endIdx).map((e, vi) => {
        const i = startIdx + vi;
        const first = vi === 0;
        if (e.type === "header") {
          return (
            <box key={i} paddingLeft={0} paddingRight={1} marginTop={first ? 0 : 1}>
              <text fg={C.accentDim} selectable={false}>{e.label.toUpperCase()}</text>
            </box>
          );
        }
        const active = e.id === activeId;
        const cursor = i === sideIndex && focused;
        // No cursor bar: the cursor row is shown by its highlight, the active
        // (open) kind by its bold accent label. The 2-space lead just indents
        // kinds under their flush group header.
        const labelFg = active || cursor ? C.accentLight : C.text;
        return (
          <box
            key={i}
            flexDirection="row"
            backgroundColor={cursor ? C.highlight : undefined}
            paddingLeft={0}
            paddingRight={1}
            onMouseDown={() => onSelect(e.id)}
          >
            <text selectable={false}>{"  "}</text>
            <text fg={labelFg} selectable={false}>{active ? <b>{e.label}</b> : e.label}</text>
          </box>
        );
      })}
    </box>
  );
}
