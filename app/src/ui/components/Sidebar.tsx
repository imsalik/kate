import type { Focus } from "../../types";
import { C } from "../theme";
import { SIDEBAR } from "../nav";

export function Sidebar({
  sideIndex,
  focus,
  activeId,
  inList,
}: {
  sideIndex: number;
  focus: Focus;
  activeId: string;
  inList: boolean;
}) {
  const focused = inList && focus === "sidebar";
  return (
    <box
      width={22}
      flexDirection="column"
      border
      borderColor={focused ? C.accent : C.border}
      title="Resources"
      titleAlignment="left"
    >
      {SIDEBAR.map((e, i) => {
        if (e.type === "header") {
          return <text key={i} fg={C.accentDim}>{` ${e.label}`}</text>;
        }
        const active = e.id === activeId;
        const cursor = i === sideIndex && focused;
        const fg = cursor ? C.bg : active ? C.accentLight : C.text;
        return (
          <box key={i} backgroundColor={cursor ? C.accent : undefined} paddingX={1}>
            <text fg={fg}>{active ? "▸ " : "  "}{e.label}</text>
          </box>
        );
      })}
    </box>
  );
}
