import type { Focus } from "../../types";
import { type Table, kindById } from "../../k8s";
import { DataTable } from "./DataTable";

// List-view adapter over the shared DataTable: maps kind-specific concerns
// (the forwarded-pod marker on pods, the active-context highlight, the empty
// message) onto the generic table. All column/layout logic lives in DataTable.
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
  const emptyText = loading
    ? undefined
    : `no ${kind?.title.toLowerCase() ?? "items"} ${query ? "match filter" : "here"}`;
  return (
    <DataTable
      headers={table.headers}
      allRows={table.rows}
      rows={visible}
      start={start}
      total={total}
      viewH={tableViewH}
      selIndex={rowIndex}
      focused={focus === "table"}
      width={width}
      pfNames={kindId === "pods" ? forwardedPods : undefined}
      activeName={kindId === "contexts" ? ctxName : undefined}
      emptyText={emptyText}
      onRowClick={onRowClick}
    />
  );
}
