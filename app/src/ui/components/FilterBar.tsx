import { C } from "../theme";

// The `/` filter — a floating bar below the header, mirroring the command
// palette so the two read as the same family. Prominent and centered, instead
// of buried at the bottom of the screen. Live-filters the list as you type;
// `count` shows how many rows currently match. Presentation only.
export function FilterBar({
  query,
  count,
  dims,
  top,
}: {
  query: string;
  count: number;
  dims: { width: number; height: number };
  top: number;
}) {
  const W = Math.min(72, Math.max(48, dims.width - 8));
  const left = Math.max(0, Math.floor((dims.width - W) / 2));

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
      title=" filter "
      titleAlignment="center"
      flexDirection="column"
    >
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accent}><b>{"⌕ "}</b></text>
        <text fg={C.text}>{query || ""}</text>
        <text fg={C.accent}>▏</text>
        <box flexGrow={1} />
        <text fg={C.textDim}>{`${count} match${count === 1 ? "" : "es"}`}</text>
      </box>
      <box paddingX={1} backgroundColor={C.surface}>
        <text fg={C.textDim}>{"type to fuzzy-match   enter keep   esc clear"}</text>
      </box>
    </box>
  );
}
