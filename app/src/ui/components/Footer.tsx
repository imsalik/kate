import type { Status, View } from "../../types";
import { canDescribe, canPortForward, canViewLogs } from "../../k8s";
import { C } from "../theme";

type Hint = [key: string, label: string];

function Hints({ hints }: { hints: Hint[] }) {
  return (
    <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
      {hints.map(([k, label], i) => (
        <box key={i} flexDirection="row">
          {i > 0 && <text fg={C.border}>{"  "}</text>}
          <text fg={C.accentLight}>{k}</text>
          <text fg={C.textDim}>{` ${label}`}</text>
        </box>
      ))}
    </box>
  );
}

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
  // The `/` filter and `:` command palette render their own floating bars, so
  // the footer just shows an error (if any) or contextual key hints.
  if (status?.kind === "error") {
    return (
      <box paddingX={1} backgroundColor={C.surface}>
        <text fg={C.danger}>{`✗ ${status.text}`}</text>
      </box>
    );
  }

  let hints: Hint[];
  if (view.kind === "logs")
    hints = [["k/j", "scroll"], ["w", "wrap"], ["G", "live-tail"], ["esc", "back"], ["^c", "quit"]];
  else if (view.kind === "describe")
    hints = [["j/k", "scroll"], ["g", "top"], ["esc", "back"]];
  else if (view.kind === "containers")
    hints = [["j/k", "move"], ["enter", "follow-logs"], ["esc", "back"]];
  else if (view.kind === "podpick")
    hints = [["j/k", "move"], ["enter", "logs"], ["esc", "back"]];
  else if (view.kind === "portpick")
    hints = [["↑/↓", "field"], ["←/→", "change"], ["digits", "local port"], ["enter", "start"], ["esc", "cancel"]];
  else if (view.kind === "forwards")
    hints = [["j/k", "move"], ["d", "stop"], ["esc", "back"]];
  else if (view.kind === "help")
    hints = [["esc", "back"]];
  else if (view.kind === "config")
    hints = [["j/k", "theme (live)"], ["enter/esc", "done"]];
  else {
    hints = [["j/k", "move"], ["h/l", "panes"], [":", "cmd"], ["/", "filter"], ["a", "all-ns"], ["n", "ns"]];
    if (canViewLogs(kindId)) hints.push(["enter", "logs"]);
    else if (kindId === "contexts") hints.push(["enter", "switch-ctx"]);
    else if (kindId === "namespaces") hints.push(["enter", "switch-ns"]);
    if (canDescribe(kindId)) hints.push(["d", "describe"]);
    if (canPortForward(kindId)) hints.push(["f", "port-fwd"]);
    hints.push(["⇧f", "forwards"], ["?", "help"], ["q", "quit"]);
  }

  return <Hints hints={hints} />;
}
