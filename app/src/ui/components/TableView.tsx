import type { Focus } from "../../types";
import { type Table, kindById } from "../../k8s";
import { C } from "../theme";
import { fit } from "../format";
import { cellColor } from "../colors";

export function TableView({
  table,
  widths,
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
}: {
  table: Table;
  widths: number[];
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
}) {
  const kind = kindById(kindId);
  // Show a PF column on the pods list so forwarded pods are obvious (k9s-style).
  const showPF = kindId === "pods";
  // Index of the NAME column; the PF marker sits right after it, and NAME gets
  // extra breathing room so the metrics columns shift to the right.
  const nameIdx = table.headers.indexOf("NAME");
  const NAME_PAD = 4;
  const w = widths.map((x, i) => (i === nameIdx ? x + NAME_PAD : x));
  const pfHeader = <text key="pf" fg={C.accentDim}>{"PF  "}</text>;
  return (
    <box flexDirection="column">
      <box flexDirection="row" paddingX={1}>
        {table.headers.map((h, i) => [
          <text key={i} fg={C.accentDim}>{fit(h, w[i] ?? h.length)} </text>,
          showPF && i === nameIdx ? pfHeader : null,
        ])}
      </box>
      {start > 0 && <text fg={C.textDim}>{`  ↑ ${start} more`}</text>}
      {visible.map((r, vi) => {
        const idx = start + vi;
        const sel = idx === rowIndex && focus === "table";
        const activeCtx = kindId === "contexts" && r.name === ctxName;
        const pf = showPF && forwardedPods.has(r.name);
        const fg = sel ? C.bg : activeCtx ? C.accentLight : C.text;
        return (
          <box key={idx} flexDirection="row" paddingX={1} backgroundColor={sel ? C.accent : undefined}>
            {r.cells.map((c, ci) => {
              // On the highlighted row keep everything bg-colored for contrast;
              // otherwise use the cell's semantic color if it carries one.
              const cellFg = sel ? C.bg : cellColor(r.colors?.[ci]) ?? fg;
              return [
                <text key={ci} fg={cellFg}>{fit(c, w[ci] ?? c.length)} </text>,
                showPF && ci === nameIdx ? (
                  <text key={`pf${ci}`} fg={sel ? C.bg : C.accentLight}>{pf ? "⇄   " : "    "}</text>
                ) : null,
              ];
            })}
          </box>
        );
      })}
      {start + tableViewH < total && (
        <text fg={C.textDim}>{`  ↓ ${total - start - tableViewH} more`}</text>
      )}
      {total === 0 && !loading && (
        <text fg={C.textDim}>  no {kind?.title.toLowerCase() ?? "items"} {query ? "match filter" : "here"}</text>
      )}
    </box>
  );
}
