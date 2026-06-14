import { C } from "../theme";
import { fit } from "../format";

export function HelpView() {
  const groups: [string, [string, string][]][] = [
    ["Navigate", [
      ["j / k", "move down / up"],
      ["g / G", "top / bottom (in logs: top / live tail)"],
      ["ctrl-d / ctrl-u", "half page down / up"],
      ["h / l, tab", "focus sidebar / table / toggle"],
    ]],
    ["Act", [
      ["enter / l", "pods: container→logs · contexts: switch · else focus"],
      ["d", "describe (YAML) the selected resource"],
      ["f", "port-forward a pod (pick a port if several)"],
      ["shift-f", "list / stop active port-forwards (also :pf)"],
      ["w", "toggle line wrap (in the logs view)"],
      [": <name>", "jump to resource (e.g. :deploy, :ctx, :sa)"],
      ["/ <text>", "fuzzy filter rows"],
      ["a", "toggle all-namespaces"],
      ["n", "switch namespace (type to filter)"],
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
