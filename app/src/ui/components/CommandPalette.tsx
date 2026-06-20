import type { Candidate } from "../../commands";
import { C } from "../theme";
import { fit } from "../format";

// The `:` command palette — a floating popup below the header with a live,
// fuzzy-ranked candidate list. Tab completes the highlighted row, ↑/↓ move,
// Enter runs. Keyboard handling lives in App; this is presentation only.
//
// Layout invariants that keep it from "jumping": the box is a FIXED size — a
// constant width and a constant MAX rows (short lists are padded with blanks) —
// and every candidate row is truncated to exactly one line (never wrapped), so
// typing never grows/shrinks/re-centers the popup.
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
  const innerW = W - 2; // minus the rounded border (1 col each side)

  const MAX = 12; // visible candidate rows — constant, so the box never resizes
  const start = Math.min(Math.max(0, sel - Math.floor(MAX / 2)), Math.max(0, candidates.length - MAX));
  const window = candidates.slice(start, start + MAX);

  // One line per row: marker(2) + label(labelW) + tag(5) + hint(hintW) == innerW.
  const MARKER = 2;
  const TAGW = 5; // " crd " badge for custom resources; blank for built-ins
  const longest = candidates.length ? Math.max(...candidates.map((c) => c.label.length)) : 10;
  const labelW = Math.min(24, Math.max(10, longest));
  const hintW = Math.max(6, innerW - MARKER - labelW - TAGW);

  // Pad the list out to MAX rows so a short result set doesn't shrink the box.
  const blanks = Math.max(0, MAX - window.length);

  // The selected item's full description, shown on its own line under the prompt
  // where it has the whole width — so the Kind name the compact row truncates is
  // still legible. Falls back to the hint for verbs (which have no detail).
  const cur = candidates[sel];
  const detailText = cur ? cur.command.detail ?? cur.hint : "";

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

      {/* selected item's full description — has the whole width, so the Kind
          name isn't truncated like it is in the compact row */}
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        {cur?.command.crd && <text fg={C.warn}>{"crd  "}</text>}
        <text fg={C.accentLight}>{fit(detailText, innerW - 2 - (cur?.command.crd ? 5 : 0))}</text>
      </box>

      <box height={1} />

      {/* candidate list — fixed MAX rows, each exactly one line */}
      {candidates.length === 0 && <text fg={C.textDim}>{fit("   no matching command", innerW)}</text>}
      {window.map((c, i) => {
        const idx = start + i;
        const on = idx === sel;
        return (
          <box key={idx} flexDirection="row" backgroundColor={on ? C.highlight : undefined}>
            <text fg={on ? C.accent : C.bg}>{on ? "▌ " : "  "}</text>
            <text fg={on ? C.accentLight : C.text}>
              {on ? <b>{fit(c.label, labelW)}</b> : fit(c.label, labelW)}
            </text>
            <text fg={C.warn}>{c.command.crd ? " crd " : "     "}</text>
            <text fg={C.textDim}>{fit(c.hint, hintW)}</text>
          </box>
        );
      })}
      {/* keep total height constant whether the list is full, short, or empty */}
      {Array.from({ length: candidates.length === 0 ? MAX - 1 : blanks }, (_, i) => (
        <box key={`blank-${i}`} height={1} />
      ))}

      {/* overflow indicator — always occupies one line so height stays fixed */}
      <text fg={C.textDim}>
        {start + MAX < candidates.length ? `   ↓ ${candidates.length - start - MAX} more` : " "}
      </text>

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
