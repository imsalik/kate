import type { View } from "../../types";
import { C } from "../theme";
import { fit } from "../format";

// A centered modal dialog for port-forward, k9s-style. Fields are navigated
// with ↑/↓ (or j/k); Container Port cycles with ←/→ (or h/l), Local Port takes
// digits. Keyboard handling lives in App; this is presentation only.
export function PortForwardModal({
  view,
  dims,
}: {
  view: Extract<View, { kind: "portpick" }>;
  dims: { width: number; height: number };
}) {
  const sel = view.entries[view.index]!;
  const W = 62;
  const H = 13;
  const left = Math.max(0, Math.floor((dims.width - W) / 2));
  const top = Math.max(0, Math.floor((dims.height - H) / 2));

  const Label = ({ text }: { text: string }) => <text fg={C.textDim}>{fit(text, 15)}</text>;
  const rowBg = (f: number) => (view.field === f ? C.surface : undefined);

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={W}
      height={H}
      border
      borderColor={C.accent}
      backgroundColor={C.bg}
      title="Port Forward"
      titleAlignment="center"
      flexDirection="column"
      padding={1}
    >
      <text fg={C.textDim}>{fit(`${view.pod.name}`, W - 4)}</text>
      <text> </text>

      {/* Container Port field (←/→ to change) */}
      <box flexDirection="row" backgroundColor={rowBg(0)}>
        <text fg={view.field === 0 ? C.accentLight : C.text}>{view.field === 0 ? "▸ " : "  "}</text>
        <Label text="Container Port" />
        <text fg={view.field === 0 ? C.accent : C.textDim}>{view.entries.length > 1 ? "◂ " : "  "}</text>
        <text fg={C.text}>{`${sel.container}::${sel.port}`}</text>
        <text fg={view.field === 0 ? C.accent : C.textDim}>{view.entries.length > 1 ? " ▸" : ""}</text>
      </box>

      {/* Local Port field (type digits) */}
      <box flexDirection="row" backgroundColor={rowBg(1)}>
        <text fg={view.field === 1 ? C.accentLight : C.text}>{view.field === 1 ? "▸ " : "  "}</text>
        <Label text="Local Port" />
        <text fg={C.text}>{view.local}</text>
        {view.field === 1 && <text fg={C.accent}>▌</text>}
      </box>

      {/* Address (fixed) */}
      <box flexDirection="row">
        <text>{"  "}</text>
        <Label text="Address" />
        <text fg={C.textDim}>localhost</text>
      </box>

      <text> </text>
      <text fg={C.accentLight}>{fit(`  → localhost:${view.local || "?"} → ${sel.port}`, W - 4)}</text>
      <text> </text>

      {/* OK / Cancel buttons */}
      <box flexDirection="row" justifyContent="center" gap={4}>
        <text fg={view.field === 2 ? C.bg : C.accentLight} bg={view.field === 2 ? C.accent : undefined}>
          {"  OK  "}
        </text>
        <text fg={view.field === 3 ? C.bg : C.text} bg={view.field === 3 ? C.accent : undefined}>
          {" Cancel "}
        </text>
      </box>
    </box>
  );
}
