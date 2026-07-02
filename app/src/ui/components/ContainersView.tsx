import type { View } from "../../types";
import { containerTable } from "../../k8s";
import { C } from "../theme";
import { DataTable } from "./DataTable";

export function ContainersView({
  view,
  height,
  width,
  onRowClick,
}: {
  view: Extract<View, { kind: "containers" }>;
  height: number;
  width: number;
  onRowClick?: (idx: number) => void;
}) {
  const table = containerTable(view.items);
  // One row for the hint line, one for the table's column-header band.
  const viewH = Math.max(1, height - 2);
  const total = table.rows.length;
  const start = view.index < viewH ? 0 : view.index - viewH + 1;
  const visible = table.rows.slice(start, start + viewH);

  return (
    <box flexDirection="column">
      <text fg={C.textDim}>{`  pick a container · enter ${view.action === "shell" ? "open shell" : "follow logs · s shell"} · f port-fwd · esc back`}</text>
      <DataTable
        headers={table.headers}
        allRows={table.rows}
        rows={visible}
        start={start}
        total={total}
        viewH={viewH}
        selIndex={view.index}
        focused
        width={width}
        // IMAGE rides beside NAME on the left; the metrics push to the right edge.
        pinLeft={(h) => h === "NAME" || h === "IMAGE"}
        onRowClick={onRowClick}
      />
    </box>
  );
}
