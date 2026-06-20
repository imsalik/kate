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
  suggestions,
}: {
  query: string;
  count: number;
  dims: { width: number; height: number };
  top: number;
  // Column names the current token can Tab-complete to; shown as a hint row.
  suggestions: string[];
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
        {suggestions.length > 0 ? (
          <box flexDirection="row">
            <text fg={C.textDim}>{"⇥ "}</text>
            {suggestions.map((s, i) => (
              <text key={s} fg={C.accent}>
                {i > 0 ? "  " : ""}
                {s.toLowerCase()}
              </text>
            ))}
            <text fg={C.textDim}>{"  → col:value"}</text>
          </box>
        ) : (
          <text fg={C.textDim}>{"fuzzy or col:value   ⇥ complete   enter keep   esc clear"}</text>
        )}
      </box>
    </box>
  );
}
