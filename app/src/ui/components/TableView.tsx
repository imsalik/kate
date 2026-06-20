import type { Focus } from "../../types";
import { type Table, kindById } from "../../k8s";
import { C } from "../theme";
import { fit } from "../format";
import { cellColor } from "../colors";

const GUTTER = 2; // cursor column ("▌ " / "  ")
const PF_W = 2; // forwarded-pod marker ("⇄ " / "  "), pods view only
const MIN_GAP = 2; // minimum space between the NAME group and the metrics group
const MIN_NAME = 12; // never shrink NAME below this
const MAX_NAME = 80; // …nor stretch it past the longest name

export function TableView({
  table,
  visible,
  start,
  tableViewH,
  rowIndex,
  focus,
  loading,
  query,
  kindId,
  ctxName,
  total,
  forwardedPods,
  width,
  onRowClick,
}: {
  table: Table;
  visible: Table["rows"];
  start: number;
  tableViewH: number;
  rowIndex: number;
  focus: Focus;
  loading: boolean;
  query: string;
  kindId: string;
  ctxName: string;
  total: number;
  forwardedPods: Set<string>;
  width: number; // pane inner content width, for spreading columns
  onRowClick: (idx: number) => void;
}) {
  const kind = kindById(kindId);
  const showPF = kindId === "pods";
  const nameIdx = table.headers.indexOf("NAME");
  const hasName = nameIdx >= 0;

  // Natural width of each column: header vs widest cell. NAME may grow large so
  // long pod names show in full; the rest stay compact.
  const nat = table.headers.map((h, i) => {
    let w = h.length;
    for (const r of table.rows) w = Math.max(w, (r.cells[i] ?? "").length);
    return i === nameIdx ? Math.min(MAX_NAME, w) : Math.min(60, w);
  });

  // Split into a left group (identity columns, up to & including NAME) pinned
  // left, and a right group (the metrics) pushed to the right edge by a flex
  // spacer — so the table fills the pane and reacts to resize. NAME keeps its
  // natural width unless the terminal is too narrow to hold it.
  const cols = table.headers.map((_, i) => i);
  const leftIdx = hasName ? cols.filter((i) => i <= nameIdx) : cols;
  const rightIdx = hasName ? cols.filter((i) => i > nameIdx) : [];

  // Fit the row by lowering a uniform width ceiling until it fits the pane: the
  // WIDEST columns come down first (and together), each clamped no lower than a
  // floor (NAME → MIN_NAME, others → their header width). So in metric views
  // NAME — usually the widest — gives before the small columns (STATUS, AGE, …
  // stay intact), while in Contexts the oversized redundant columns (CLUSTER,
  // AUTHINFO) give before NAME instead of NAME being starved to nothing.
  const colW = nat.slice();
  if (hasName) {
    const chrome = GUTTER + (showPF ? PF_W : 0) + MIN_GAP + 1;
    const floorOf = (i: number) =>
      i === nameIdx
        ? Math.min(nat[i] ?? MIN_NAME, MIN_NAME)
        : Math.min(nat[i] ?? 1, table.headers[i]?.length ?? 1);
    const widthFor = (cap: number) =>
      chrome + nat.reduce((s, w, i) => s + Math.max(floorOf(i), Math.min(w, cap)) + 1, 0);

    let cap = Math.max(MIN_NAME, ...nat);
    while (cap > 1 && widthFor(cap) > width) cap--;
    for (let i = 0; i < colW.length; i++) colW[i] = Math.max(floorOf(i), Math.min(nat[i] ?? 0, cap));
  }

  const headerCell = (i: number) => (
    <text key={i} fg={C.accentDim}>{fit(table.headers[i]!, colW[i] ?? 0)} </text>
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

      {visible.map((r, vi) => {
        const idx = start + vi;
        const sel = idx === rowIndex && focus === "table";
        const activeCtx = kindId === "contexts" && r.name === ctxName;
        const pf = showPF && forwardedPods.has(r.name);
        const cell = (i: number) => {
          const semantic = cellColor(r.colors?.[i]);
          const isName = i === nameIdx;
          const base = activeCtx ? C.accentLight : C.text;
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
            onMouseDown={() => onRowClick(idx)}
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

      {start + tableViewH < total && (
        <text fg={C.textDim}>{`     ↓ ${total - start - tableViewH} more`}</text>
      )}
      {total === 0 && !loading && (
        <text fg={C.textDim}>{`     no ${kind?.title.toLowerCase() ?? "items"} ${query ? "match filter" : "here"}`}</text>
      )}
    </box>
  );
}
