import { C } from "../theme";
import { fit } from "../format";

export function HelpView() {
  const groups: [string, [string, string][]][] = [
    ["Navigate", [
      ["j / k, ↑ / ↓", "move down / up"],
      ["g / G, home/end", "top / bottom (in logs: top / live tail)"],
      ["ctrl-d/u, pgdn/pgup", "half page down / up"],
      ["h / l, ← / →, tab", "focus sidebar / table / toggle"],
    ]],
    ["Command palette  ( : )", [
      [":<resource>", "jump to any resource (:po, :deploy, :svc, :sa…)"],
      [":ctx [name]", "switch context (arg completes) or open the list"],
      [":ns [name]", "switch namespace (arg completes) or open picker"],
      [":theme [name]", "change theme live · :config opens settings"],
      [":pf  ·  :all  ·  :q", "forwards · all-namespaces · quit"],
      ["tab / ↑↓ / enter", "complete · move · run the highlighted command"],
    ]],
    ["Act", [
      ["enter / l", "pods: container→logs · contexts: switch · else focus"],
      ["d", "describe (YAML) the selected resource"],
      ["f", "port-forward a pod (pick a port if several)"],
      ["shift-f", "list / stop active port-forwards (also :pf)"],
      ["w", "toggle line wrap (in the logs view)"],
      ["/ <text>", "fuzzy filter rows"],
      ["a", "toggle all-namespaces"],
      ["n", "open Namespaces (enter on one switches to it)"],
      ["r", "refresh now (auto every 5s)"],
    ]],
    ["Leave", [
      ["esc", "back one step (logs → containers → list)"],
      ["q", "quit (from the table)"],
    ]],
  ];
  return (
    <box flexDirection="column" padding={1}>
      {groups.map(([title, rows], gi) => (
        <box key={gi} flexDirection="column" marginBottom={1}>
          <text fg={C.accent}>{title}</text>
          {rows.map(([k, v], i) => (
            <box key={i} flexDirection="row">
              <text fg={C.accentLight}>{fit("  " + k, 22)}</text>
              <text fg={C.text}>{v}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  );
}
