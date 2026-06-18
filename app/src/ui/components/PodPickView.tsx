import type { View } from "../../types";
import { C } from "../theme";

// Pod picker — shown when a workload resolves to more than one pod. Pick one to
// tail its logs. Pods arrive running-first, newest-first, so the top is usually
// the one you want. Keyboard handling lives in App.
export function PodPickView({
  view,
  height,
}: {
  view: Extract<View, { kind: "podpick" }>;
  height: number;
}) {
  const viewH = Math.max(1, height - 1);
  const start = Math.min(
    Math.max(0, view.index - Math.floor(viewH / 2)),
    Math.max(0, view.pods.length - viewH),
  );
  const window = view.pods.slice(start, start + viewH);
  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={C.textDim}>{`${view.pods.length} pods · ${view.subtitle} · enter logs · esc back`}</text>
      {window.map((p, i) => {
        const idx = start + i;
        const on = idx === view.index;
        return (
          <box key={p} backgroundColor={on ? C.accent : undefined}>
            <text fg={on ? C.bg : C.text}>{`  ${p}`}</text>
          </box>
        );
      })}
    </box>
  );
}
