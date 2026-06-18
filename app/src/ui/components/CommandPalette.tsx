import type { Candidate } from "../../commands";
import { C } from "../theme";
import { fit } from "../format";

// The `:` command palette — a floating popup below the header with a live,
// fuzzy-ranked candidate list. Tab completes the highlighted row, ↑/↓ move,
// Enter runs. Keyboard handling lives in App; this is presentation only.
export function CommandPalette({
  input,
  candidates,
  sel,
  dims,
  top,
}: {
  input: string;
  candidates: Candidate[];
  sel: number;
  dims: { width: number; height: number };
  top: number;
}) {
  const W = Math.min(72, Math.max(48, dims.width - 8));
  const left = Math.max(0, Math.floor((dims.width - W) / 2));

  const MAX = 12; // visible candidate rows
  const start = Math.min(Math.max(0, sel - Math.floor(MAX / 2)), Math.max(0, candidates.length - MAX));
  const window = candidates.slice(start, start + MAX);
  const labelW = Math.min(22, Math.max(10, ...candidates.map((c) => c.label.length)));

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={W}
      borderStyle="rounded"
      border
      borderColor={C.accent}
      backgroundColor={C.bg}
      title=" run command "
      titleAlignment="center"
      flexDirection="column"
    >
      {/* prompt line */}
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accent}><b>{"❯ "}</b></text>
        <text fg={C.text}>{input || ""}</text>
        <text fg={C.accent}>▏</text>
        {!input && <text fg={C.textDim}>type a resource or verb…</text>}
      </box>

      <box height={1} />

      {/* candidate list */}
      {candidates.length === 0 && <text fg={C.textDim}>{"   no matching command"}</text>}
      {window.map((c, i) => {
        const idx = start + i;
        const on = idx === sel;
        return (
          <box key={idx} flexDirection="row" backgroundColor={on ? C.highlight : undefined}>
            <text fg={on ? C.accent : C.bg}>{on ? "▌ " : "  "}</text>
            <text fg={on ? C.accentLight : C.text}>
              {on ? <b>{fit(c.label, labelW)}</b> : fit(c.label, labelW)}
            </text>
            <text fg={C.textDim}>{`  ${c.hint}`}</text>
          </box>
        );
      })}

      {start + MAX < candidates.length && (
        <text fg={C.textDim}>{`   ↓ ${candidates.length - start - MAX} more`}</text>
      )}

      <box height={1} />
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accentLight}>tab</text>
        <text fg={C.textDim}>{" complete   "}</text>
        <text fg={C.accentLight}>↑↓</text>
        <text fg={C.textDim}>{" move   "}</text>
        <text fg={C.accentLight}>enter</text>
        <text fg={C.textDim}>{" run   "}</text>
        <text fg={C.accentLight}>esc</text>
        <text fg={C.textDim}>{" cancel"}</text>
      </box>
    </box>
  );
}
