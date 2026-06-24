// The resource-kind registry: what shows in the sidebar, plus per-kind
// capability metadata (describe target, port-forwardability).

import type { Kind } from "./types";

// Drives the sidebar order and grouping.
export const KINDS: Kind[] = [
  { id: "contexts", title: "Contexts", group: "Cluster" },
  { id: "namespaces", title: "Namespaces", group: "Cluster" },

  { id: "pods", title: "Pods", group: "Workloads" },
  { id: "deployments", title: "Deployments", group: "Workloads" },
  { id: "replicasets", title: "ReplicaSets", group: "Workloads" },
  { id: "statefulsets", title: "StatefulSets", group: "Workloads" },
  { id: "daemonsets", title: "DaemonSets", group: "Workloads" },
  { id: "jobs", title: "Jobs", group: "Workloads" },
  { id: "cronjobs", title: "CronJobs", group: "Workloads" },

  { id: "services", title: "Services", group: "Network/Config" },
  { id: "ingresses", title: "Ingresses", group: "Network/Config" },
  { id: "configmaps", title: "ConfigMaps", group: "Network/Config" },
  { id: "secrets", title: "Secrets", group: "Network/Config" },
  { id: "hpa", title: "HPA", group: "Network/Config" },

  { id: "serviceaccounts", title: "ServiceAccounts", group: "RBAC" },
  { id: "roles", title: "Roles", group: "RBAC" },
  { id: "rolebindings", title: "RoleBindings", group: "RBAC" },

  { id: "helm", title: "Helm Releases", group: "Helm" },
];

// Dynamic kinds discovered at runtime (CRDs), appended after the built-ins.
// Kept in a module-level store so kindById/allKinds resolve them everywhere; the
// UI re-renders by bumping a version (see App) whenever this is replaced. CRDs
// always append — never reorder — so built-in sidebar indices stay stable.
let DYNAMIC_KINDS: Kind[] = [];
export function setDynamicKinds(kinds: Kind[]): void {
  DYNAMIC_KINDS = kinds;
}
export function dynamicKinds(): Kind[] {
  return DYNAMIC_KINDS;
}
// Built-ins first, then discovered CRDs.
export function allKinds(): Kind[] {
  return DYNAMIC_KINDS.length ? [...KINDS, ...DYNAMIC_KINDS] : KINDS;
}
function isDynamic(id: string): boolean {
  return DYNAMIC_KINDS.some((k) => k.id === id);
}
// Public: is this kind a discovered CRD (present in the current cluster)?
export function isDynamicKind(id: string): boolean {
  return isDynamic(id);
}

export function kindById(id: string): Kind | undefined {
  return KINDS.find((k) => k.id === id) ?? DYNAMIC_KINDS.find((k) => k.id === id);
}

// apiVersion/kind per resource, for the generic read used by `describe`.
export const DESCRIBE_META: Record<string, { apiVersion: string; kind: string }> = {
  namespaces: { apiVersion: "v1", kind: "Namespace" },
  pods: { apiVersion: "v1", kind: "Pod" },
  deployments: { apiVersion: "apps/v1", kind: "Deployment" },
  replicasets: { apiVersion: "apps/v1", kind: "ReplicaSet" },
  statefulsets: { apiVersion: "apps/v1", kind: "StatefulSet" },
  daemonsets: { apiVersion: "apps/v1", kind: "DaemonSet" },
  jobs: { apiVersion: "batch/v1", kind: "Job" },
  cronjobs: { apiVersion: "batch/v1", kind: "CronJob" },
  services: { apiVersion: "v1", kind: "Service" },
  ingresses: { apiVersion: "networking.k8s.io/v1", kind: "Ingress" },
  configmaps: { apiVersion: "v1", kind: "ConfigMap" },
  secrets: { apiVersion: "v1", kind: "Secret" },
  hpa: { apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler" },
  serviceaccounts: { apiVersion: "v1", kind: "ServiceAccount" },
  roles: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
  rolebindings: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
};

// Built-ins via the static table; CRDs are always describable (the read is
// generic — apiVersion/kind come from discovery). Helm is handled specially:
// describe decodes the release Secret rather than reading a live object.
export function canDescribe(kindId: string): boolean {
  return kindId === "helm" || kindId in DESCRIBE_META || isDynamic(kindId);
}

// Kinds whose ports can be forwarded: pods directly, plus workloads/services
// that resolve to a backing pod via their label selector.
const PF_KINDS = new Set(["pods", "deployments", "statefulsets", "daemonsets", "replicasets", "services"]);
export function canPortForward(kindId: string): boolean {
  return PF_KINDS.has(kindId);
}

// Kinds whose Enter drills into pod logs: pods directly, plus workloads/jobs
// that resolve to backing pods. (cronjobs spawn jobs, so they're indirect —
// drill cronjob → jobs → logs.)
const LOG_KINDS = new Set(["pods", "deployments", "statefulsets", "daemonsets", "replicasets", "jobs"]);
export function canViewLogs(kindId: string): boolean {
  return LOG_KINDS.has(kindId);
}

// Kinds whose Enter drills into their backing pods: the log kinds above, plus
// services (which resolve pods via their spec.selector). Everything else has no
// pods to drill into, so Enter falls back to describe instead.
const DRILL_KINDS = new Set([...LOG_KINDS, "services"]);
export function canDrillToPods(kindId: string): boolean {
  return DRILL_KINDS.has(kindId);
}

// Kinds the UI lets you delete (behind a confirm dialog, and only when edit
// mode is enabled in Settings). Deleting a pod restarts it (its controller
// recreates it); deleting a service is NOT self-healing, so edit mode gates it.
const DELETE_KINDS = new Set(["pods", "services", "helm"]);
export function canDelete(kindId: string): boolean {
  return DELETE_KINDS.has(kindId);
}
