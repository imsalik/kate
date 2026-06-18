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

export function kindById(id: string): Kind | undefined {
  return KINDS.find((k) => k.id === id);
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

export function canDescribe(kindId: string): boolean {
  return kindId in DESCRIBE_META;
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
