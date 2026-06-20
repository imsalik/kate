// Sidebar model — flattens the kind registry into selectable rows + group
// headers for the resource sidebar.
//
// The sidebar lists the *built-in* kinds only. Discovered CRDs are deliberately
// kept out of it: a cluster can have 100+ CRDs (cilium, cert-manager, istio, …)
// and flooding the sidebar with them is noise *and* overflows the pane. CRDs are
// reached through the `:` palette instead (`:certificates`, shortNames, fuzzy
// completion) — exactly how k9s does it. Discovery still powers list/describe.

import { KINDS } from "../k8s";

// Flattened sidebar entry: either a non-selectable group header or a kind row.
export type SideEntry =
  | { type: "header"; label: string }
  | { type: "kind"; id: string; label: string };

// `crds` are the CRD rows to surface in the sidebar: the user's pinned CRDs plus
// the one currently being viewed (so you always know where you are). They land
// in a "Custom" group at the bottom — the built-in spine above never changes, so
// indices into it (POD_INDEX, etc.) stay valid.
export function buildSidebar(
  kinds = KINDS,
  crds: { id: string; label: string }[] = [],
): SideEntry[] {
  const out: SideEntry[] = [];
  let lastGroup = "";
  for (const k of kinds) {
    if (k.group !== lastGroup) {
      out.push({ type: "header", label: k.group });
      lastGroup = k.group;
    }
    out.push({ type: "kind", id: k.id, label: k.title });
  }
  if (crds.length) {
    out.push({ type: "header", label: "Custom" });
    for (const c of crds) out.push({ type: "kind", id: c.id, label: c.label });
  }
  return out;
}

export function kindIndex(sidebar: SideEntry[], id: string): number {
  return sidebar.findIndex((e) => e.type === "kind" && e.id === id);
}

// Built-in-only index for `pods`, used as the initial selection before any CRDs
// are discovered. CRDs only ever append, so this stays valid afterwards.
export const POD_INDEX = kindIndex(buildSidebar(KINDS), "pods");
