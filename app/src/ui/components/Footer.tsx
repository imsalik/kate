import type { Status, View } from "../../types";
import { canDescribe, canPortForward } from "../../k8s";
import { C } from "../theme";

export function Footer({
  searchMode,
  cmdMode,
  query,
  cmd,
  status,
  view,
  kindId,
}: {
  searchMode: boolean;
  cmdMode: boolean;
  query: string;
  cmd: string;
  status: Status;
  view: View;
  kindId: string;
}) {
  // The namespaces picker has its own filter state; show its input here too so
  // the `/` bar lives at the bottom everywhere, just like the list view.
  const nsSearching = view.kind === "namespaces" && view.searching;
  if (searchMode || cmdMode || nsSearching) {
    const prefix = cmdMode ? ":" : "/";
    const val = cmdMode ? cmd : nsSearching ? (view as Extract<View, { kind: "namespaces" }>).filter : query;
    return (
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accent}>{prefix}</text>
        <text fg={C.text}>{val}</text>
        <text fg={C.accent}>▌</text>
      </box>
    );
  }
  if (status?.kind === "error") {
    return (
      <box paddingX={1} backgroundColor={C.surface}>
        <text fg={C.danger}>{status.text}</text>
      </box>
    );
  }
  let hint: string;
  if (view.kind === "logs") hint = "k/j scroll  w wrap  G live-tail  esc back  ctrl-c quit";
  else if (view.kind === "describe") hint = "j/k scroll  g top  esc back";
  else if (view.kind === "containers") hint = "j/k move  enter follow-logs  esc back";
  else if (view.kind === "portpick") hint = "↑/↓ field  ←/→ change  digits = local port  enter start  esc cancel";
  else if (view.kind === "forwards") hint = "j/k move  d stop  esc back";
  else if (view.kind === "namespaces") hint = view.searching ? "type to filter  enter keep  esc clear" : "/ filter  j/k move  enter apply  esc back";
  else if (view.kind === "help") hint = "esc back";
  else {
    const parts: string[] = [];
    if (kindId === "pods") parts.push("enter logs");
    else if (kindId === "contexts") parts.push("enter switch-ctx");
    if (canDescribe(kindId)) parts.push("d describe");
    if (canPortForward(kindId)) parts.push("f port-fwd");
    const act = parts.length ? "  " + parts.join("  ") : "";
    hint = `j/k move  h/l panes  : cmd  / filter  a all-ns  n ns${act}  shift-f forwards  ? help  q quit`;
  }
  return (
    <box paddingX={1} backgroundColor={C.surface}>
      <text fg={C.textDim}>{hint}</text>
    </box>
  );
}
