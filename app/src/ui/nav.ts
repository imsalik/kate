// Sidebar model — flattens the kind registry into selectable rows + group
// headers for the resource sidebar.

import { KINDS } from "../k8s";

// Flattened sidebar entry: either a non-selectable group header or a kind row.
export type SideEntry =
  | { type: "header"; label: string }
  | { type: "kind"; id: string; label: string };

function buildSidebar(): SideEntry[] {
  const out: SideEntry[] = [];
  let lastGroup = "";
  for (const k of KINDS) {
    if (k.group !== lastGroup) {
      out.push({ type: "header", label: k.group });
      lastGroup = k.group;
    }
    out.push({ type: "kind", id: k.id, label: k.title });
  }
  return out;
}

export const SIDEBAR = buildSidebar();
export const POD_INDEX = SIDEBAR.findIndex((e) => e.type === "kind" && e.id === "pods");
