import type { Candidate } from "../../commands";
import { C } from "../theme";
import { fit } from "../format";

// The `:` command palette — a popup near the top with a live, fuzzy-ranked
// candidate list. Tab completes the highlighted row, ↑/↓ move, Enter runs.
// Keyboard handling lives in App; this is presentation only.
export function CommandPalette({
  input,
  candidates,
  sel,
  dims,
}: {
  input: string;
  candidates: Candidate[];
  sel: number;
  dims: { width: number; height: number };
}) {
  const W = Math.min(64, Math.max(40, dims.width - 8));
  const left = Math.max(0, Math.floor((dims.width - W) / 2));
  const top = 2;

  const MAX = 12; // visible candidate rows
  const start = Math.min(Math.max(0, sel - Math.floor(MAX / 2)), Math.max(0, candidates.length - MAX));
  const window = candidates.slice(start, start + MAX);
  const labelW = Math.min(22, Math.max(8, ...candidates.map((c) => c.label.length)));

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={W}
      border
      borderColor={C.accent}
      backgroundColor={C.bg}
      title="Command"
      titleAlignment="left"
      flexDirection="column"
    >
      {/* input line */}
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accent}>:</text>
        <text fg={C.text}>{input}</text>
        <text fg={C.accent}>▌</text>
      </box>

      {/* candidate list */}
      {candidates.length === 0 && <text fg={C.textDim}>{"  no match"}</text>}
      {window.map((c, i) => {
        const idx = start + i;
        const on = idx === sel;
        const fg = on ? C.bg : C.accentLight;
        const hintFg = on ? C.bg : C.textDim;
        return (
          <box key={idx} flexDirection="row" paddingX={1} backgroundColor={on ? C.accent : undefined}>
            <text fg={fg}>{fit(c.label, labelW)}</text>
            <text fg={hintFg}>{`  ${c.hint}`}</text>
          </box>
        );
      })}

      {start + MAX < candidates.length && <text fg={C.textDim}>{`  ↓ ${candidates.length - start - MAX} more`}</text>}

      <box paddingX={1} backgroundColor={C.surface}>
        <text fg={C.textDim}>tab complete · ↑/↓ move · enter run · esc cancel</text>
      </box>
    </box>
  );
}
