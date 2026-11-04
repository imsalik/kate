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
const FOOTER: [string, string][] = [["tab", "complete"], ["↑↓", "move"], ["enter", "run"], ["esc", "cancel"]];

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
  const W = Math.min(100, Math.max(Math.min(48, dims.width - 2), dims.width - 8));
  const left = Math.max(0, Math.floor((dims.width - W) / 2));
  const innerW = W - 2; // minus the rounded border (1 col each side)

  const MAX = 12; // visible candidate rows — constant, so the box never resizes
  const start = Math.min(Math.max(0, sel - Math.floor(MAX / 2)), Math.max(0, candidates.length - MAX));
  const window = candidates.slice(start, start + MAX);

  // One line per row: marker(2) + label(labelW) + gap(2) + hint(hintW) + pad(1) == innerW.
  // CRD rows lead the hint with a "crd " badge. Arg completions carry no hint,
  // so the label takes the hint column too.
  const MARKER = 2;
  const GAP = 2;
  const longest = candidates.length
    ? Math.max(...candidates.map((c) => c.label.length + (c.prefix ? c.prefix.length + 1 : 0)))
    : 10;
  const hasHint = candidates.some((c) => c.hint);
  const rowW = Math.max(1, innerW - MARKER - 1);
  const labelW = hasHint ? Math.max(1, Math.min(28, Math.max(10, longest), Math.floor(rowW * 0.6))) : rowW;
  const hintW = hasHint ? Math.max(0, rowW - labelW - GAP) : 0;

  // Pad the list out to MAX rows so a short result set doesn't shrink the box.
  const blanks = Math.max(0, MAX - window.length);

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

      {/* candidate list — fixed MAX rows, each exactly one line */}
      {candidates.length === 0 && <text fg={C.textDim}>{fit("   no matching command", innerW)}</text>}
      {window.map((c, i) => {
        const idx = start + i;
        const on = idx === sel;
        const pre = c.prefix && labelW > c.prefix.length + 8 ? `${c.prefix} ` : "";
        const label = fit(c.label, labelW - pre.length);
        const badge = c.command.crd && hintW > 8 ? "crd " : "";
        return (
          <box key={idx} flexDirection="row" backgroundColor={on ? C.highlight : undefined}>
            <text selectable={false}>{"  "}</text>
            {pre && <text fg={C.accent}>{pre}</text>}
            <text fg={on ? C.accentLight : C.text}>{on ? <b>{label}</b> : label}</text>
            {hintW > 0 && <text>{" ".repeat(GAP)}</text>}
            {badge && <text fg={C.warn}>{badge}</text>}
            {hintW > 0 && <text fg={on ? C.text : C.textDim}>{fit(c.hint, hintW - badge.length)}</text>}
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
      <box flexDirection="row" paddingX={1} height={1} overflow="hidden" backgroundColor={C.surface}>
        {FOOTER.map(([k, label]) => (
          <box key={k} flexDirection="row" flexShrink={0}>
            <text fg={C.accentLight}>{k}</text>
            <text fg={C.textDim}>{` ${label}   `}</text>
          </box>
        ))}
      </box>
    </box>
  );
}
