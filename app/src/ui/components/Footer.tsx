import type { Status, View } from "../../types";
import { canDescribe, canPortForward, canViewLogs } from "../../k8s";
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
  // The `/` filter bar lives at the bottom. (The `:` command palette renders its
  // own popup, so it's not handled here.)
  if (searchMode) {
    return (
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accent}>/</text>
        <text fg={C.text}>{query}</text>
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
  else if (view.kind === "podpick") hint = "j/k move  enter logs  esc back";
  else if (view.kind === "portpick") hint = "↑/↓ field  ←/→ change  digits = local port  enter start  esc cancel";
  else if (view.kind === "forwards") hint = "j/k move  d stop  esc back";
  else if (view.kind === "help") hint = "esc back";
  else if (view.kind === "config") hint = "j/k change theme (live)  enter/esc done";
  else {
    const parts: string[] = [];
    if (canViewLogs(kindId)) parts.push("enter logs");
    else if (kindId === "contexts") parts.push("enter switch-ctx");
    else if (kindId === "namespaces") parts.push("enter switch-ns");
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
