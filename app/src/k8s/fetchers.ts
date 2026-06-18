// Per-kind listers. Each fetcher pulls a resource list and shapes it into a
// Table (headers + string rows). Adding a kind means adding an entry here and
// to the KINDS registry — render code never changes.

import * as k8s from "@kubernetes/client-node";

import type { Client } from "./client";
import type { CellColor, Table } from "./types";
import { age, parseCpu, parseMem, podStatusColor, usageColor } from "./quantities";

type Fetcher = (c: Client, ns?: string) => Promise<Table>;

// nsCols prepend a NAMESPACE column only when spanning all namespaces, so
// single-namespace views stay narrow.
function nsHeaders(all: boolean, ...rest: string[]): string[] {
  return all ? ["NAMESPACE", ...rest] : rest;
}
function nsCells(all: boolean, ns: string, ...rest: string[]): string[] {
  return all ? [ns, ...rest] : rest;
}
function nsColors(all: boolean, ...rest: CellColor[]): CellColor[] {
  return all ? [undefined, ...rest] : rest;
}

// Helper so the Apps* fetchers can share the namespaced/all-namespaces branch.
function listApps(
  c: Client,
  ns: string | undefined,
  fn: (api: k8s.AppsV1Api, ns?: string) => Promise<{ items: any[] }>,
): Promise<{ items: any[] }> {
  return fn(c.apps, ns);
}

export const FETCHERS: Record<string, Fetcher> = {
  // Not a real API call — lists kubeconfig contexts. Enter switches live.
  contexts: async (c) => ({
    headers: ["NAME", "CLUSTER", "AUTHINFO", "NAMESPACE"],
    rows: c.contexts().map((ctx) => ({
      name: ctx.name,
      namespace: ctx.namespace,
      cells: [ctx.active ? `${ctx.name} (*)` : ctx.name, ctx.cluster, ctx.user, ctx.namespace],
    })),
  }),

  // Cluster-scoped: lists namespaces. Enter switches the active namespace. The
  // current one is marked. Not affected by the all-namespaces toggle.
  namespaces: async (c) => {
    const { items } = await c.core.listNamespace();
    const sorted = items.sort((a, b) => (a.metadata?.name ?? "").localeCompare(b.metadata?.name ?? ""));
    return {
      headers: ["NAME", "STATUS", "AGE"],
      rows: sorted.map((n) => {
        const name = n.metadata?.name ?? "";
        const active = name === c.namespace;
        const status = n.status?.phase ?? "";
        const statusColor: CellColor = status === "Active" ? "ok" : status === "Terminating" ? "warn" : undefined;
        return {
          name,
          namespace: "",
          cells: [active ? `${name} (*)` : name, status, age(n.metadata?.creationTimestamp)],
          colors: [active ? "info" : undefined, statusColor, undefined],
        };
      }),
    };
  },

  pods: async (c, ns) => {
    const [{ items }, metrics] = await Promise.all([
      ns ? c.core.listNamespacedPod({ namespace: ns }) : c.core.listPodForAllNamespaces(),
      c.podMetrics(ns),
    ]);
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "READY", "STATUS", "RESTARTS", "CPU", "MEM", "%CPU", "%MEM", "AGE"),
      rows: items.map((p) => {
        const css = p.status?.containerStatuses ?? [];
        const total = p.spec?.containers?.length ?? 0;
        const ready = css.filter((s) => s.ready).length;
        const restarts = css.reduce((n, s) => n + (s.restartCount ?? 0), 0);
        let status = p.status?.phase ?? "";
        if (p.metadata?.deletionTimestamp) status = "Terminating";
        for (const s of css) {
          const w = s.state?.waiting?.reason;
          const t = s.state?.terminated?.reason;
          if (w) { status = w; break; }
          if (t) { status = t; break; }
        }
        const name = p.metadata?.name ?? "";
        const podNs = p.metadata?.namespace ?? "";

        // Sum container limits and requests; usage % is taken against the limit
        // when set, otherwise the request (k9s shows "n/a" when neither exists).
        let cpuLim = 0, memLim = 0, cpuReq = 0, memReq = 0;
        for (const cont of p.spec?.containers ?? []) {
          cpuLim += parseCpu(cont.resources?.limits?.cpu) ?? 0;
          memLim += parseMem(cont.resources?.limits?.memory) ?? 0;
          cpuReq += parseCpu(cont.resources?.requests?.cpu) ?? 0;
          memReq += parseMem(cont.resources?.requests?.memory) ?? 0;
        }
        const m = metrics.get(`${podNs}/${name}`);
        const cpuCell = m ? `${Math.round(m.cpuMilli)}m` : "-";
        const memCell = m ? `${Math.round(m.memMi)}Mi` : "-";

        const cpuBase = cpuLim || cpuReq;
        const memBase = memLim || memReq;
        const cpuPct = m && cpuBase ? `${Math.round((m.cpuMilli / cpuBase) * 100)}%` : "-";
        const memPct = m && memBase ? `${Math.round((m.memMi / memBase) * 100)}%` : "-";

        // A finished pod (Completed/Succeeded) legitimately reports 0/N ready —
        // grey it out instead of red, so it doesn't read as "failed / never ran".
        const done = /^(Completed|Succeeded)$/.test(status);
        const readyColor: CellColor = done
          ? "dim"
          : total > 0 && ready === total
            ? "ok"
            : ready === 0
              ? "err"
              : "warn";
        const restartColor: CellColor = restarts === 0 ? undefined : restarts > 5 ? "err" : "warn";
        const cpuColor: CellColor = m && cpuBase ? usageColor(m.cpuMilli, cpuBase) : "dim";
        const memColor: CellColor = m && memBase ? usageColor(m.memMi, memBase) : "dim";

        return {
          name,
          namespace: podNs,
          cells: nsCells(all, podNs, name,
            `${ready}/${total}`, status, String(restarts),
            cpuCell, memCell, cpuPct, memPct, age(p.metadata?.creationTimestamp)),
          colors: nsColors(all, undefined, readyColor, podStatusColor(status),
            restartColor, "dim", "dim", cpuColor, memColor, undefined),
        };
      }),
    };
  },

  deployments: async (c, ns) => {
    const { items } = await (ns
      ? c.apps.listNamespacedDeployment({ namespace: ns })
      : c.apps.listDeploymentForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"),
      rows: items.map((d) => {
        const name = d.metadata?.name ?? "";
        const s = d.status ?? {};
        return {
          name, namespace: d.metadata?.namespace ?? "",
          cells: nsCells(all, d.metadata?.namespace ?? "", name,
            `${s.readyReplicas ?? 0}/${s.replicas ?? 0}`,
            String(s.updatedReplicas ?? 0), String(s.availableReplicas ?? 0),
            age(d.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  replicasets: async (c, ns) => {
    const { items } = await listApps(c, ns, (api, n) =>
      n ? api.listNamespacedReplicaSet({ namespace: n }) : api.listReplicaSetForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "DESIRED", "CURRENT", "READY", "AGE"),
      rows: items.map((r: any) => {
        const name = r.metadata?.name ?? "";
        const s = r.status ?? {};
        return {
          name, namespace: r.metadata?.namespace ?? "",
          cells: nsCells(all, r.metadata?.namespace ?? "", name,
            String(s.replicas ?? 0), String(s.availableReplicas ?? 0),
            String(s.readyReplicas ?? 0), age(r.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  statefulsets: async (c, ns) => {
    const { items } = await listApps(c, ns, (api, n) =>
      n ? api.listNamespacedStatefulSet({ namespace: n }) : api.listStatefulSetForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "READY", "AGE"),
      rows: items.map((s: any) => {
        const name = s.metadata?.name ?? "";
        return {
          name, namespace: s.metadata?.namespace ?? "",
          cells: nsCells(all, s.metadata?.namespace ?? "", name,
            `${s.status?.readyReplicas ?? 0}/${s.status?.replicas ?? 0}`,
            age(s.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  daemonsets: async (c, ns) => {
    const { items } = await listApps(c, ns, (api, n) =>
      n ? api.listNamespacedDaemonSet({ namespace: n }) : api.listDaemonSetForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "DESIRED", "READY", "AVAILABLE", "AGE"),
      rows: items.map((d: any) => {
        const name = d.metadata?.name ?? "";
        const s = d.status ?? {};
        return {
          name, namespace: d.metadata?.namespace ?? "",
          cells: nsCells(all, d.metadata?.namespace ?? "", name,
            String(s.desiredNumberScheduled ?? 0), String(s.numberReady ?? 0),
            String(s.numberAvailable ?? 0), age(d.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  jobs: async (c, ns) => {
    const { items } = await (ns
      ? c.batch.listNamespacedJob({ namespace: ns })
      : c.batch.listJobForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "COMPLETIONS", "AGE"),
      rows: items.map((j) => {
        const name = j.metadata?.name ?? "";
        const want = j.spec?.completions ?? 1;
        return {
          name, namespace: j.metadata?.namespace ?? "",
          cells: nsCells(all, j.metadata?.namespace ?? "", name,
            `${j.status?.succeeded ?? 0}/${want}`, age(j.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  cronjobs: async (c, ns) => {
    const { items } = await (ns
      ? c.batch.listNamespacedCronJob({ namespace: ns })
      : c.batch.listCronJobForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "SCHEDULE", "SUSPEND", "ACTIVE", "AGE"),
      rows: items.map((cj) => {
        const name = cj.metadata?.name ?? "";
        return {
          name, namespace: cj.metadata?.namespace ?? "",
          cells: nsCells(all, cj.metadata?.namespace ?? "", name,
            cj.spec?.schedule ?? "", String(cj.spec?.suspend ?? false),
            String(cj.status?.active?.length ?? 0), age(cj.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  services: async (c, ns) => {
    const { items } = await (ns
      ? c.core.listNamespacedService({ namespace: ns })
      : c.core.listServiceForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "TYPE", "CLUSTER-IP", "PORTS", "AGE"),
      rows: items.map((s) => {
        const name = s.metadata?.name ?? "";
        const ports = (s.spec?.ports ?? []).map((p) => `${p.port}/${p.protocol}`).join(",");
        return {
          name, namespace: s.metadata?.namespace ?? "",
          cells: nsCells(all, s.metadata?.namespace ?? "", name,
            s.spec?.type ?? "", s.spec?.clusterIP ?? "", ports,
            age(s.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  ingresses: async (c, ns) => {
    const { items } = await (ns
      ? c.net.listNamespacedIngress({ namespace: ns })
      : c.net.listIngressForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "CLASS", "HOSTS", "AGE"),
      rows: items.map((i) => {
        const name = i.metadata?.name ?? "";
        const hosts = (i.spec?.rules ?? []).map((r) => r.host).filter(Boolean).join(",");
        return {
          name, namespace: i.metadata?.namespace ?? "",
          cells: nsCells(all, i.metadata?.namespace ?? "", name,
            i.spec?.ingressClassName ?? "", hosts, age(i.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  configmaps: async (c, ns) => {
    const { items } = await (ns
      ? c.core.listNamespacedConfigMap({ namespace: ns })
      : c.core.listConfigMapForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "DATA", "AGE"),
      rows: items.map((cm) => {
        const name = cm.metadata?.name ?? "";
        return {
          name, namespace: cm.metadata?.namespace ?? "",
          cells: nsCells(all, cm.metadata?.namespace ?? "", name,
            String(Object.keys(cm.data ?? {}).length), age(cm.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  secrets: async (c, ns) => {
    const { items } = await (ns
      ? c.core.listNamespacedSecret({ namespace: ns })
      : c.core.listSecretForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "TYPE", "DATA", "AGE"),
      rows: items.map((s) => {
        const name = s.metadata?.name ?? "";
        return {
          name, namespace: s.metadata?.namespace ?? "",
          cells: nsCells(all, s.metadata?.namespace ?? "", name,
            s.type ?? "", String(Object.keys(s.data ?? {}).length),
            age(s.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  hpa: async (c, ns) => {
    const { items } = await (ns
      ? c.autoscaling.listNamespacedHorizontalPodAutoscaler({ namespace: ns })
      : c.autoscaling.listHorizontalPodAutoscalerForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "REFERENCE", "MIN", "MAX", "REPLICAS", "AGE"),
      rows: items.map((h) => {
        const name = h.metadata?.name ?? "";
        const ref = `${h.spec?.scaleTargetRef?.kind}/${h.spec?.scaleTargetRef?.name}`;
        return {
          name, namespace: h.metadata?.namespace ?? "",
          cells: nsCells(all, h.metadata?.namespace ?? "", name, ref,
            String(h.spec?.minReplicas ?? 0), String(h.spec?.maxReplicas ?? 0),
            String(h.status?.currentReplicas ?? 0), age(h.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  serviceaccounts: async (c, ns) => {
    const { items } = await (ns
      ? c.core.listNamespacedServiceAccount({ namespace: ns })
      : c.core.listServiceAccountForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "SECRETS", "GCP-SA", "AGE"),
      rows: items.map((sa) => {
        const name = sa.metadata?.name ?? "";
        // Workload Identity binds a KSA to a GCP SA via this annotation —
        // surface it directly, it's usually the thing you want to verify.
        const gcp = sa.metadata?.annotations?.["iam.gke.io/gcp-service-account"] ?? "";
        return {
          name, namespace: sa.metadata?.namespace ?? "",
          cells: nsCells(all, sa.metadata?.namespace ?? "", name,
            String(sa.secrets?.length ?? 0), gcp, age(sa.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  roles: async (c, ns) => {
    const { items } = await (ns
      ? c.rbac.listNamespacedRole({ namespace: ns })
      : c.rbac.listRoleForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "RULES", "AGE"),
      rows: items.map((r) => {
        const name = r.metadata?.name ?? "";
        return {
          name, namespace: r.metadata?.namespace ?? "",
          cells: nsCells(all, r.metadata?.namespace ?? "", name,
            String(r.rules?.length ?? 0), age(r.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  rolebindings: async (c, ns) => {
    const { items } = await (ns
      ? c.rbac.listNamespacedRoleBinding({ namespace: ns })
      : c.rbac.listRoleBindingForAllNamespaces());
    const all = c.allNamespaces;
    return {
      headers: nsHeaders(all, "NAME", "ROLE", "SUBJECTS", "AGE"),
      rows: items.map((rb) => {
        const name = rb.metadata?.name ?? "";
        const role = `${rb.roleRef?.kind}/${rb.roleRef?.name}`;
        const subs = (rb.subjects ?? []).map((s) => s.name).join(",");
        return {
          name, namespace: rb.metadata?.namespace ?? "",
          cells: nsCells(all, rb.metadata?.namespace ?? "", name, role, subs,
            age(rb.metadata?.creationTimestamp)),
        };
      }),
    };
  },

  // Helm v3 stores each release revision as a Secret of type
  // helm.sh/release.v1 with owner=helm labels. We read those labels directly
  // through the k8s API — same direct-access approach k9s uses, no helm shell.
  helm: async (c, ns) => {
    const all = c.allNamespaces;
    const { items } = await (ns
      ? c.core.listNamespacedSecret({ namespace: ns, labelSelector: "owner=helm" })
      : c.core.listSecretForAllNamespaces({ labelSelector: "owner=helm" }));

    // Keep only the latest revision per release name+namespace.
    const latest = new Map<string, (typeof items)[number]>();
    for (const s of items) {
      const l = s.metadata?.labels ?? {};
      const key = `${s.metadata?.namespace}/${l["name"]}`;
      const ver = Number(l["version"] ?? 0);
      const prev = latest.get(key);
      const prevVer = Number(prev?.metadata?.labels?.["version"] ?? -1);
      if (!prev || ver > prevVer) latest.set(key, s);
    }

    return {
      headers: nsHeaders(all, "NAME", "REVISION", "STATUS", "UPDATED"),
      rows: [...latest.values()].map((s) => {
        const l = s.metadata?.labels ?? {};
        const name = l["name"] ?? "";
        return {
          name, namespace: s.metadata?.namespace ?? "",
          cells: nsCells(all, s.metadata?.namespace ?? "", name,
            l["version"] ?? "", l["status"] ?? "", age(s.metadata?.creationTimestamp)),
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
};
