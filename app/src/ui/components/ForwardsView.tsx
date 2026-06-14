import type { PortForwardEntry } from "../../k8s";
import { C } from "../theme";
import { fit } from "../format";

export function ForwardsView({
  forwards,
  index,
  height,
}: {
  forwards: PortForwardEntry[];
  index: number;
  height: number;
}) {
  const window = forwards.slice(0, Math.max(1, height - 2));
  const lw = Math.max(5, ...forwards.map((f) => `localhost:${f.localPort}`.length));
  const pw = Math.max(3, ...forwards.map((f) => f.pod.length));
  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={C.textDim}>{`  ${forwards.length} active · d stop · esc back`}</text>
      <box flexDirection="row">
        <text fg={C.accentDim}>{`  ${fit("LOCAL", lw)}    ${fit("POD", pw)}  REMOTE  NAMESPACE`}</text>
      </box>
      {forwards.length === 0 && <text fg={C.textDim}>  none — press f on a pod/deployment/service to start one</text>}
      {window.map((f, i) => {
        const on = i === index;
        const fg = on ? C.bg : C.text;
        return (
          <box key={f.id} flexDirection="row" backgroundColor={on ? C.accent : undefined}>
            <text fg={fg}>{`  ${fit(`localhost:${f.localPort}`, lw)} →  ${fit(f.pod, pw)}  ${fit(String(f.remotePort), 6)}  ${f.namespace}`}</text>
          </box>
        );
      })}
    </box>
  );
}
