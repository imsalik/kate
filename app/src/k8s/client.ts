// Client wraps the typed kube API clients plus the view state that affects every
// fetch: which namespace we're scoped to and whether we span all of them. It
// also owns long-lived resources — log follows and port-forward TCP servers.

import * as k8s from "@kubernetes/client-node";
import { Writable, PassThrough } from "node:stream";
import * as net from "node:net";

import { DESCRIBE_META } from "./kinds";
import { FETCHERS } from "./fetchers";
import { parseCpu, parseMem } from "./quantities";
import type {
  ContainerInfo,
  ContextInfo,
  PortEntry,
  PortForwardEntry,
  Table,
} from "./types";

export class Client {
  kc: k8s.KubeConfig;
  context: string;
  namespace: string;
  allNamespaces = false;

  // Assigned via buildClients() in the constructor and on every context switch.
  log!: k8s.Log;
  objApi!: k8s.KubernetesObjectApi;
  pf!: k8s.PortForward;
  core!: k8s.CoreV1Api;
  apps!: k8s.AppsV1Api;
  batch!: k8s.BatchV1Api;
  net!: k8s.NetworkingV1Api;
  rbac!: k8s.RbacAuthorizationV1Api;
  autoscaling!: k8s.AutoscalingV2Api;
  metrics!: k8s.Metrics;

  // Active port-forwards: a local TCP server per entry, kept until stopped.
  private pfServers = new Map<string, net.Server>();
  private forwards: PortForwardEntry[] = [];

  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();

    const current = this.kc.getCurrentContext();
    this.context = current;
    const ctx = this.kc.getContextObject(current);
    this.namespace = ctx?.namespace || "default";

    this.buildClients();
  }

  // The namespace to pass to list calls. undefined means "every namespace".
  private ns(): string | undefined {
    return this.allNamespaces ? undefined : this.namespace;
  }

  // (Re)build the typed API clients from the current kubeconfig context.
  private buildClients(): void {
    this.log = new k8s.Log(this.kc);
    this.objApi = k8s.KubernetesObjectApi.makeApiClient(this.kc);
    this.pf = new k8s.PortForward(this.kc);
    this.core = this.kc.makeApiClient(k8s.CoreV1Api);
    this.apps = this.kc.makeApiClient(k8s.AppsV1Api);
    this.batch = this.kc.makeApiClient(k8s.BatchV1Api);
    this.net = this.kc.makeApiClient(k8s.NetworkingV1Api);
    this.rbac = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);
    this.autoscaling = this.kc.makeApiClient(k8s.AutoscalingV2Api);
    this.metrics = new k8s.Metrics(this.kc);
  }

  // Live CPU/MEM usage from the metrics API, summed per pod across containers.
  // Returns a map keyed "namespace/name". Empty if metrics-server is absent —
  // the pod list must still render without it.
  async podMetrics(ns?: string): Promise<Map<string, { cpuMilli: number; memMi: number }>> {
    const map = new Map<string, { cpuMilli: number; memMi: number }>();
    try {
      const res = ns ? await this.metrics.getPodMetrics(ns) : await this.metrics.getPodMetrics();
      for (const item of res.items ?? []) {
        let cpu = 0;
        let mem = 0;
        for (const cont of item.containers ?? []) {
          cpu += parseCpu((cont as any).usage?.cpu) ?? 0;
          mem += parseMem((cont as any).usage?.memory) ?? 0;
        }
        map.set(`${item.metadata?.namespace}/${item.metadata?.name}`, { cpuMilli: cpu, memMi: mem });
      }
    } catch {
      // metrics-server not installed / not reachable — leave the map empty.
    }
    return map;
  }

  // All contexts in the kubeconfig, for the Contexts view.
  contexts(): ContextInfo[] {
    const current = this.kc.getCurrentContext();
    return this.kc.getContexts().map((c) => ({
      name: c.name,
      cluster: c.cluster,
      user: c.user,
      namespace: c.namespace ?? "",
      active: c.name === current,
    }));
  }

  // Switch the active context live and rebuild clients. Resets namespace to
  // the new context's default (or "default") and clears any all-ns toggle.
  switchContext(name: string): void {
    this.kc.setCurrentContext(name);
    this.context = name;
    this.namespace = this.kc.getContextObject(name)?.namespace || "default";
    this.allNamespaces = false;
    this.buildClients();
  }

  // List all namespace names for the namespace switcher.
  async namespaces(): Promise<string[]> {
    const res = await this.core.listNamespace();
    return res.items.map((n) => n.metadata?.name ?? "").filter(Boolean).sort();
  }

  // Read pod logs (tail N lines) — one-shot, for a static snapshot.
  async podLogs(namespace: string, name: string, tail = 500): Promise<string> {
    return this.core.readNamespacedPodLog({ name, namespace, tailLines: tail });
  }

  // Containers in a pod, for the container picker. Merges spec (names/images)
  // with live status (ready/state/restarts).
  async podContainers(namespace: string, name: string): Promise<ContainerInfo[]> {
    const pod = await this.core.readNamespacedPod({ name, namespace });
    const statuses = new Map((pod.status?.containerStatuses ?? []).map((s) => [s.name, s]));
    return (pod.spec?.containers ?? []).map((c) => {
      const st = statuses.get(c.name);
      let state = "—";
      if (st?.state?.running) state = "Running";
      else if (st?.state?.waiting?.reason) state = st.state.waiting.reason;
      else if (st?.state?.terminated?.reason) state = st.state.terminated.reason;
      return {
        name: c.name,
        image: c.image ?? "",
        ready: st?.ready ?? false,
        state,
        restarts: st?.restartCount ?? 0,
      };
    });
  }

  // Describe: fetch the live object generically and render it as YAML.
  async describe(kindId: string, namespace: string, name: string): Promise<string> {
    const meta = DESCRIBE_META[kindId];
    if (!meta) throw new Error(`describe not supported for ${kindId}`);
    const obj: any = await this.objApi.read({
      apiVersion: meta.apiVersion,
      kind: meta.kind,
      metadata: { name, namespace },
    });
    // Strip server-side bookkeeping that just adds noise — kubectl hides these
    // by default too. managedFields (who-set-which-field) is the big offender.
    if (obj?.metadata) {
      delete obj.metadata.managedFields;
      delete obj.metadata.generation;
      delete obj.metadata.resourceVersion;
      delete obj.metadata.selfLink;
      if (obj.metadata.annotations) {
        delete obj.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"];
        if (Object.keys(obj.metadata.annotations).length === 0) delete obj.metadata.annotations;
      }
    }
    return k8s.dumpYaml(obj);
  }

  // Resolve what to port-forward for the selected row: a pod forwards itself;
  // a workload/service resolves to a backing pod via its label selector.
  // Returns the target pod name + its container/port pairs (k9s-style, so the
  // dialog can show "container::port").
  async resolveForwardTarget(
    kindId: string,
    namespace: string,
    name: string,
  ): Promise<{ pod: string; entries: PortEntry[] }> {
    let podName = name;
    if (kindId !== "pods") {
      let labels: Record<string, string> | undefined;
      if (kindId === "deployments") labels = (await this.apps.readNamespacedDeployment({ name, namespace })).spec?.selector?.matchLabels;
      else if (kindId === "statefulsets") labels = (await this.apps.readNamespacedStatefulSet({ name, namespace })).spec?.selector?.matchLabels;
      else if (kindId === "daemonsets") labels = (await this.apps.readNamespacedDaemonSet({ name, namespace })).spec?.selector?.matchLabels;
      else if (kindId === "replicasets") labels = (await this.apps.readNamespacedReplicaSet({ name, namespace })).spec?.selector?.matchLabels;
      else if (kindId === "services") labels = (await this.core.readNamespacedService({ name, namespace })).spec?.selector;
      else throw new Error(`port-forward not supported for ${kindId}`);

      if (!labels || Object.keys(labels).length === 0) throw new Error(`${name} has no pod selector`);
      const labelSelector = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(",");
      const { items } = await this.core.listNamespacedPod({ namespace, labelSelector });
      const pod = items.find((p) => p.status?.phase === "Running") ?? items[0];
      if (!pod?.metadata?.name) throw new Error(`no running pod found for ${name}`);
      podName = pod.metadata.name;
    }

    const pod = await this.core.readNamespacedPod({ name: podName, namespace });
    const entries: PortEntry[] = [];
    for (const c of pod.spec?.containers ?? []) {
      for (const p of c.ports ?? []) if (p.containerPort) entries.push({ container: c.name, port: p.containerPort });
    }
    return { pod: podName, entries };
  }

  listForwards(): PortForwardEntry[] {
    return [...this.forwards];
  }

  // Start a local TCP listener that forwards each connection to pod:remotePort.
  // Uses exactly the requested localPort and fails loudly if it's taken — no
  // silent fallback to another port.
  async startForward(namespace: string, pod: string, remotePort: number, localPort: number): Promise<PortForwardEntry> {
    let server: net.Server;
    try {
      server = await this.listen(namespace, pod, remotePort, localPort);
    } catch (e: any) {
      if (e?.code === "EADDRINUSE") throw new Error(`local port ${localPort} is already in use`);
      throw e;
    }
    const id = `${namespace}/${pod}:${remotePort}`;
    this.stopForward(id); // replace any existing forward for the same target
    this.pfServers.set(id, server);
    const entry = { id, namespace, pod, localPort, remotePort };
    this.forwards.push(entry);
    return entry;
  }

  private listen(namespace: string, pod: string, remotePort: number, localPort: number): Promise<net.Server> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        // Pipe the client through a PassThrough so bytes that arrive before the
        // forward's WebSocket is open are buffered (not dropped) and replayed
        // once it starts reading — otherwise the first request is lost.
        // output = socket (pod→client), err = null (mixing it in corrupts the
        // stream → blank pages), input = buffered client bytes (client→pod).
        const input = new PassThrough();
        socket.pipe(input);
        socket.on("error", () => {});
        this.pf
          .portForward(namespace, pod, [remotePort], socket, null, input)
          .catch(() => socket.destroy());
      });
      server.once("error", reject);
      server.listen(localPort, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(server);
      });
    });
  }

  stopForward(id: string): void {
    const s = this.pfServers.get(id);
    if (s) {
      s.close();
      this.pfServers.delete(id);
    }
    this.forwards = this.forwards.filter((f) => f.id !== id);
  }

  stopAllForwards(): void {
    for (const s of this.pfServers.values()) s.close();
    this.pfServers.clear();
    this.forwards = [];
  }

  // Follow pod logs in real time (k9s-style). Calls onChunk for every chunk the
  // API streams, after first replaying the last `tail` lines. Returns an
  // AbortController — call .abort() to stop following and free the connection.
  async streamPodLogs(
    namespace: string,
    name: string,
    onChunk: (text: string) => void,
    opts: { container?: string; tail?: number } = {},
  ): Promise<AbortController> {
    const sink = new Writable({
      write(chunk, _enc, cb) {
        onChunk(chunk.toString());
        cb();
      },
    });
    // Stopping the follow destroys this stream, which emits 'error'; with no
    // listener Node would throw. Swallow it — it's expected on teardown.
    sink.on("error", () => {});

    // The API 400s on an empty container name when a pod has >1 container, so
    // resolve one up front (the caller's choice, else the first container).
    let container = opts.container ?? "";
    if (!container) {
      const pod = await this.core.readNamespacedPod({ name, namespace });
      container = pod.spec?.containers?.[0]?.name ?? "";
    }
    // The done-callback overload lets us swallow the AbortError that fires when
    // the caller stops following, so it never surfaces as an unhandled rejection.
    return this.log.log(
      namespace,
      name,
      container,
      sink,
      () => {},
      { follow: true, tailLines: opts.tail ?? 200, timestamps: false },
    );
  }

  // Fetch dispatches to the right lister and shapes a Table. Errors bubble up
  // so the UI can show them in the status line.
  async fetch(kindId: string): Promise<Table> {
    const f = FETCHERS[kindId];
    if (!f) throw new Error(`unknown kind: ${kindId}`);
    return f(this, this.ns());
  }
}
