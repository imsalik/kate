import { C } from "../theme";

// The logs `/` search entry — a floating bar below the header, matching the
// command palette and row filter so the three read as one family. Highlights
// matches live as you type; `count`/`pos` show how many hits there are and which
// one n/N has landed on. Presentation only.
export function LogSearchBar({
  term,
  count,
  pos,
  dims,
  top,
}: {
  term: string;
  count: number;
  pos: number; // 0-based index of the active match, or -1 when none
  dims: { width: number; height: number };
  top: number;
}) {
  const W = Math.min(72, Math.max(48, dims.width - 8));
  const left = Math.max(0, Math.floor((dims.width - W) / 2));
  const status = !term ? "" : count ? `${pos + 1}/${count}` : "no matches";

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
      title=" search logs "
      titleAlignment="center"
      flexDirection="column"
    >
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accent}><b>{"/ "}</b></text>
        <text fg={C.text}>{term || ""}</text>
        <text fg={C.accent}>▏</text>
        <box flexGrow={1} />
        <text fg={count || !term ? C.textDim : C.warn}>{status}</text>
      </box>
      <box paddingX={1} backgroundColor={C.surface}>
        <text fg={C.textDim}>{"type to highlight   enter keep   n/N jump   esc clear"}</text>
      </box>
    </box>
  );
}
