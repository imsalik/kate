import type { Focus } from "../../types";
import { C } from "../theme";
import { SIDEBAR } from "../nav";

export function Sidebar({
  sideIndex,
  focus,
  activeId,
  inList,
  onSelect,
  onScroll,
}: {
  sideIndex: number;
  focus: Focus;
  activeId: string;
  inList: boolean;
  onSelect: (id: string) => void;
  onScroll: (dir: "up" | "down" | "left" | "right") => void;
}) {
  const focused = inList && focus === "sidebar";
  return (
    <box
      width={22}
      flexDirection="column"
      borderStyle="rounded"
      border
      borderColor={focused ? C.accent : C.border}
      title=" resources "
      titleAlignment="left"
      onMouseScroll={(e) => e.scroll && onScroll(e.scroll.direction)}
    >
      {SIDEBAR.map((e, i) => {
        if (e.type === "header") {
          return (
            <box key={i} paddingX={1} marginTop={i === 0 ? 0 : 1}>
              <text fg={C.accentDim} selectable={false}>{e.label.toUpperCase()}</text>
            </box>
          );
        }
        const active = e.id === activeId;
        const cursor = i === sideIndex && focused;
        const markerFg = cursor ? C.accent : active ? C.accentLight : C.border;
        const labelFg = active || cursor ? C.accentLight : C.text;
        return (
          <box
            key={i}
            flexDirection="row"
            backgroundColor={cursor ? C.highlight : undefined}
            paddingX={1}
            onMouseDown={() => onSelect(e.id)}
          >
            <text fg={markerFg} selectable={false}>{active || cursor ? "▌ " : "  "}</text>
            <text fg={labelFg} selectable={false}>{active ? <b>{e.label}</b> : e.label}</text>
          </box>
        );
      })}
    </box>
  );
}
