import type { Row } from "../../k8s";
import { C } from "../theme";
import { fit, planColumns } from "../format";
import { cellColor } from "../colors";

const GUTTER = 2; // cursor column ("▌ " / "  ")
const PF_W = 2; // marker gutter ("⇄ " / "  "), pods view only

// The one table renderer used across the app (list view, container picker) so
// column alignment, the cursor gutter, selection highlight, and semantic cell
// colors are identical everywhere. Callers hand it a Table (headers + rows);
// windowing/selection stay the caller's job and arrive as start/selIndex.
export function DataTable({
  headers,
  allRows,
  rows,
  start,
  total,
  viewH,
  selIndex,
  focused,
  width,
  pfNames,
  activeName,
  emptyText,
  pinLeft,
  onRowClick,
}: {
  headers: string[];
  allRows: Row[]; // full set, for column-width planning
  rows: Row[]; // visible slice to render
  start: number; // absolute index of rows[0]
  total: number; // allRows length, for scroll hints
  viewH: number; // visible row budget
  selIndex: number; // absolute selected index
  focused: boolean; // whether selection is highlighted
  width: number; // pane inner content width
  pfNames?: Set<string>; // when set, draw the forwarded-pod marker gutter
  activeName?: string; // render this row's NAME in accent (e.g. current context)
  emptyText?: string; // shown when total === 0
  pinLeft?: (header: string, index: number) => boolean;
  onRowClick?: (idx: number) => void;
}) {
  const showPF = pfNames !== undefined;
  const leadWidth = GUTTER + (showPF ? PF_W : 0);
  const { colW, leftIdx, rightIdx, nameIdx } = planColumns(headers, allRows, { width, leadWidth, pinLeft });

  const headerCell = (i: number) => (
    <text key={i} fg={C.accentDim}>{fit(headers[i]!, colW[i] ?? 0)} </text>
  );

  return (
    <box flexDirection="column">
      {/* column-header band */}
      <box flexDirection="row" backgroundColor={C.surface} paddingX={1}>
        <text fg={C.accentDim}>{"  "}</text>
        {showPF && <text fg={C.accentDim}>{"  "}</text>}
        {leftIdx.map((i) => headerCell(i))}
        <box flexGrow={1} />
        <text fg={C.accentDim}>{"  "}</text>
        {rightIdx.map((i) => headerCell(i))}
      </box>

      {start > 0 && <text fg={C.textDim}>{`     ↑ ${start} more`}</text>}

      {rows.map((r, vi) => {
        const idx = start + vi;
        const sel = idx === selIndex && focused;
        const isActive = activeName !== undefined && r.name === activeName;
        const pf = showPF && pfNames!.has(r.name);
        const cell = (i: number) => {
          const semantic = cellColor(r.colors?.[i]);
          const isName = i === nameIdx;
          const base = isActive ? C.accentLight : C.text;
          const fg = semantic ?? (sel && isName ? C.accentLight : base);
          const body = fit(r.cells[i] ?? "", colW[i] ?? 0);
          return (
            <text key={i} fg={fg}>
              {sel && isName ? <b>{body}</b> : body}{" "}
            </text>
          );
        };
        return (
          <box
            key={idx}
            flexDirection="row"
            paddingX={1}
            backgroundColor={sel ? C.highlight : undefined}
            onMouseDown={onRowClick ? () => onRowClick(idx) : undefined}
          >
            <text fg={C.accent}>{sel ? "▌ " : "  "}</text>
            {showPF && <text fg={C.accentLight}>{pf ? "⇄ " : "  "}</text>}
            {leftIdx.map((i) => cell(i))}
            <box flexGrow={1} />
            <text fg={C.text}>{"  "}</text>
            {rightIdx.map((i) => cell(i))}
          </box>
        );
      })}

      {start + viewH < total && (
        <text fg={C.textDim}>{`     ↓ ${total - start - viewH} more`}</text>
      )}
      {total === 0 && emptyText && <text fg={C.textDim}>{`     ${emptyText}`}</text>}
    </box>
  );
}
