// Sidebar model + the namespace typeahead filter — small navigation helpers
// shared between the App orchestrator and the views.

import { KINDS } from "../k8s";
import { fuzzyScore } from "../lib/fuzzy";

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

// Fuzzy-filter + rank namespace names for the namespace typeahead.
export function filterNamespaces(all: string[], filter: string): string[] {
  if (!filter) return all;
  return all
    .map((ns) => ({ ns, score: fuzzyScore(filter, ns) }))
    .filter((x): x is { ns: string; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.ns);
}
