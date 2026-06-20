// Dynamic resource discovery — the k9s trick that lets kate reach *any* CRD in
// the cluster (and every future one) with zero per-resource code.
//
// We use the cluster's *aggregated discovery* endpoint (one ~80 KB GET to
// /apis), NOT a full CRD list (which drags down every CRD's multi-MB OpenAPI
// schema). It gives us exactly what the UI needs per resource — plural, kind,
// scope, shortNames, served version — and nothing we don't.
//
// Discovered kinds are surfaced through the `:` command palette only; the
// sidebar stays built-ins. Built-in groups are filtered out so the palette
// shows genuine custom resources, not pods/deployments/leases we already have.

import type { Kind } from "./types";
import { KINDS } from "./kinds";

// A discovered custom resource, in the shape both the palette (via `toKind`) and
// the generic fetcher need.
export interface CrdInfo {
  id: string; // `:cmd` id — the plural, deduped against collisions
  title: string; // display label (the Kind, e.g. "Certificate")
  group: string; // API group, e.g. "cert-manager.io"
  apiGroup: string; // API group for the URL/apiVersion (same as group)
  version: string; // served version to list
  plural: string; // URL path segment
  kind: string; // k8s Kind, for describe's apiVersion/kind read
  namespaced: boolean; // drives the all-namespaces toggle + NAMESPACE column
  shortNames: string[]; // `:` palette aliases (k9s muscle memory)
  singular: string; // extra `:` alias
}

// Standard Kubernetes API groups — never CRDs. Everything else discovered under
// /apis is treated as a custom resource. (The core group "" lives at /api and
// isn't returned by /apis at all, so pods/services never appear here.)
const SYSTEM_GROUPS = new Set([
  "apps",
  "batch",
  "autoscaling",
  "policy",
  "extensions",
  "networking.k8s.io",
  "storage.k8s.io",
  "rbac.authorization.k8s.io",
  "scheduling.k8s.io",
  "node.k8s.io",
  "coordination.k8s.io",
  "certificates.k8s.io",
  "admissionregistration.k8s.io",
  "apiextensions.k8s.io",
  "apiregistration.k8s.io",
  "authentication.k8s.io",
  "authorization.k8s.io",
  "events.k8s.io",
  "discovery.k8s.io",
  "flowcontrol.apiserver.k8s.io",
  "resource.k8s.io",
  "internal.apiserver.k8s.io",
  "metrics.k8s.io",
  "storagemigration.k8s.io",
]);

const BUILTIN_IDS = new Set(KINDS.map((k) => k.id));

// Parse an APIGroupDiscoveryList (aggregated discovery v2) into CrdInfos. Picks
// the first (preferred) served version of each group, skips system groups,
// subresources, and anything you can't `list`. Dedupes ids, group-qualifying on
// collision. Sorted by group then kind so the palette/menu order is stable.
export function crdsFromDiscovery(doc: any): CrdInfo[] {
  const out: CrdInfo[] = [];
  const seen = new Set<string>(BUILTIN_IDS);

  for (const group of doc?.items ?? []) {
    const apiGroup: string = group?.metadata?.name ?? "";
    if (!apiGroup || SYSTEM_GROUPS.has(apiGroup)) continue;

    const version = group.versions?.[0]; // preferred version is listed first
    if (!version?.version) continue;

    for (const r of version.resources ?? []) {
      const plural: string = r.resource;
      if (!plural || plural.includes("/")) continue; // skip subresources
      if (!(r.verbs ?? []).includes("list")) continue; // not listable
      const kind: string = r.responseKind?.kind ?? plural;

      let id = plural;
      if (seen.has(id)) id = `${plural}.${apiGroup}`; // collision → group-qualify
      if (seen.has(id)) continue; // still taken — skip the later one
      seen.add(id);

      out.push({
        id,
        title: kind,
        group: apiGroup,
        apiGroup,
        version: version.version,
        plural,
        kind,
        namespaced: r.scope === "Namespaced",
        shortNames: r.shortNames ?? [],
        singular: r.singularResource ?? kind.toLowerCase(),
      });
    }
  }

  out.sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
  return out;
}

// Project a CrdInfo onto the palette Kind shape. shortNames + singular become
// `:` aliases so e.g. `:cert` or `:certificate` resolve like in k9s.
export function crdToKind(c: CrdInfo): Kind {
  const aliases = [...c.shortNames, c.singular].filter((a) => a && a !== c.id);
  return { id: c.id, title: c.title, group: c.group, aliases: [...new Set(aliases)] };
}
