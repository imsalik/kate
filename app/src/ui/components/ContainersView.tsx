import type { View } from "../../types";
import { C } from "../theme";
import { fit } from "../format";

export function ContainersView({
  view,
  height,
}: {
  view: Extract<View, { kind: "containers" }>;
  height: number;
}) {
  const viewH = Math.max(1, height - 1);
  const window = view.items.slice(0, viewH);
  const headers = ["NAME", "READY", "STATE", "RESTARTS", "CPU", "MEM", "IMAGE"];
  const w = [
    Math.max(4, ...view.items.map((c) => c.name.length)),
    5,
    Math.max(5, ...view.items.map((c) => c.state.length)),
    8,
    6,
    8,
    60,
  ];
  const cpu = (c: (typeof view.items)[number]) => (c.cpuMilli === undefined ? "-" : `${Math.round(c.cpuMilli)}m`);
  const mem = (c: (typeof view.items)[number]) => (c.memMi === undefined ? "-" : `${Math.round(c.memMi)}Mi`);
  return (
    <box flexDirection="column">
      <text fg={C.textDim}>{`  pick a container · enter ${view.action === "shell" ? "open shell" : "follow logs · s shell"} · f port-fwd · esc back`}</text>
      <box flexDirection="row" paddingX={1}>
        {headers.map((h, i) => (
          <text key={i} fg={C.accentDim}>{fit(h, w[i]!)} </text>
        ))}
      </box>
      {window.map((c, i) => {
        const sel = i === view.index;
        const fg = sel ? C.bg : C.text;
        // A terminated container (Completed Job/init step) is never "ready" by
        // definition — show a neutral dash rather than an alarming ✗ for it.
        const ready = c.ready ? "✓" : c.state === "Completed" ? "—" : "✗";
        const cells = [c.name, ready, c.state, String(c.restarts), cpu(c), mem(c), c.image];
        return (
          <box key={i} flexDirection="row" paddingX={1} backgroundColor={sel ? C.accent : undefined}>
            {cells.map((cell, ci) => (
              <text key={ci} fg={fg}>{fit(cell, w[ci]!)} </text>
            ))}
          </box>
        );
      })}
    </box>
  );
}
