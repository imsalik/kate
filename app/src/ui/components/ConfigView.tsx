import type { View } from "../../types";
import { C, THEME_NAMES, currentThemeName } from "../theme";
import { fit } from "../format";

// Settings view. Two rows: an edit-mode toggle and a theme dropdown. Walking the
// rows changes nothing — the theme only changes once you open its dropdown
// (enter) and preview/commit there. Keyboard handling lives in App.
export function ConfigView({
  view,
  editEnabled,
}: {
  view: Extract<View, { kind: "config" }>;
  editEnabled: boolean;
}) {
  const editSel = view.index === 0 && !view.themeOpen;
  const themeSel = view.index === 1 && !view.themeOpen;

  // A fixed, padded label column so the value never butts against the label.
  const Row = ({ on, label, value, valueOk }: { on: boolean; label: string; value: string; valueOk?: boolean }) => (
    <box flexDirection="row" paddingX={1} backgroundColor={on ? C.highlight : undefined}>
      <text fg={on ? C.accent : C.border} selectable={false}>{on ? "▸ " : "  "}</text>
      <text fg={on ? C.accentLight : C.text} selectable={false}>{fit(label, 10)}</text>
      <text fg={valueOk ? C.ok : C.textDim} selectable={false}>{value}</text>
    </box>
  );

  return (
    <box flexDirection="column" padding={1}>
      <text fg={C.accent}>Settings</text>
      <text fg={C.textDim}>{view.themeOpen ? "  j/k preview · enter select · esc cancel" : "  j/k move · space toggle · enter open · esc done"}</text>
      <text> </text>

      <Row on={editSel} label="Edit mode" value={editEnabled ? "on" : "off"} valueOk={editEnabled} />
      <Row on={themeSel} label="Theme" value={`${currentThemeName} ▾`} />

      {/* Theme dropdown — only rendered (and able to change the theme) when open */}
      {view.themeOpen && (
        <box flexDirection="column" marginLeft={4}>
          {THEME_NAMES.map((name, i) => {
            const on = i === view.themeSel;
            const active = name === currentThemeName;
            return (
              <box key={name} flexDirection="row" paddingX={1} backgroundColor={on ? C.highlight : undefined}>
                <text fg={on ? C.accent : C.border} selectable={false}>{active ? "▸ " : "  "}</text>
                <text fg={on || active ? C.accentLight : C.text} selectable={false}>{fit(name, 14)}</text>
              </box>
            );
          })}
        </box>
      )}

      {!view.themeOpen && (
        <>
          <text> </text>
          <text fg={C.textDim}>{"  Edit mode lets you delete pods and services (always behind a confirm)."}</text>
        </>
      )}
    </box>
  );
}
