import type { View } from "../../types";
import { C, THEME_NAMES, currentThemeName } from "../theme";
import { fit } from "../format";

// Settings view. Currently a live theme picker: moving the cursor applies the
// theme immediately (and persists it), so you preview as you browse. Built to
// grow more sections later. Keyboard handling lives in App.
export function ConfigView({ view }: { view: Extract<View, { kind: "config" }> }) {
  return (
    <box flexDirection="column" padding={1}>
      <text fg={C.accent}>Theme</text>
      <text fg={C.textDim}>{"  j/k move · live preview · enter/esc done"}</text>
      <text> </text>
      {THEME_NAMES.map((name, i) => {
        const on = i === view.index;
        const active = name === currentThemeName;
        const fg = on ? C.bg : active ? C.accentLight : C.text;
        return (
          <box key={name} flexDirection="row" paddingX={1} backgroundColor={on ? C.accent : undefined}>
            <text fg={fg}>{active ? "▸ " : "  "}{fit(name, 14)}</text>
            {/* a little swatch row so the palette is visible at a glance */}
            <text fg={on ? C.bg : C.accent}>{"██"}</text>
            <text fg={on ? C.bg : C.ok}>{"██"}</text>
            <text fg={on ? C.bg : C.warn}>{"██"}</text>
            <text fg={on ? C.bg : C.danger}>{"██"}</text>
          </box>
        );
      })}
    </box>
  );
}
