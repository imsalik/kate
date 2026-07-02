// Framework-agnostic shapes shared across the data layer and the UI.

// A rendered view of a resource list. The UI only ever sees headers + string
// rows, so adding a new kind never touches render code.
export interface Table {
  headers: string[];
  rows: Row[];
}

// Semantic per-cell color. The UI maps these to theme hex, so the data layer
// stays theme-agnostic. undefined = default foreground.
export type CellColor = "ok" | "warn" | "err" | "info" | "dim" | undefined;

// Each row carries its raw identity alongside the display cells so actions
// (describe, logs, yaml) can target the real object without re-parsing cells.
// `colors`, when present, is parallel to `cells` (same length/order).
export interface Row {
  name: string;
  namespace: string;
  cells: string[];
  colors?: CellColor[];
}

export interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  state: string;
  restarts: number;
  // Live usage from the metrics API; undefined when metrics-server is absent.
  cpuMilli?: number;
  memMi?: number;
  // Base for usage % = the container's CPU/mem limit, else its request; undefined
  // when neither is set (we can't judge how hot it is → shown as "-"/dim).
  cpuBase?: number;
  memBase?: number;
  // When the container started running, for the AGE column; undefined if it has
  // no running/terminated state yet.
  startedAt?: string;
}

export interface PortForwardEntry {
  id: string;
  namespace: string;
  pod: string;
  localPort: number;
  remotePort: number;
}

// A container/port pair a pod exposes, for the port-forward dialog.
export interface PortEntry {
  container: string;
  port: number;
}

// A kubeconfig context row, for the Contexts view.
export interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  active: boolean;
}

// A resource kind in the sidebar registry.
export interface Kind {
  id: string; // stable id, also what `:cmd` matches
  title: string; // sidebar label
  group: string; // sidebar section header
  aliases?: string[]; // extra `:cmd` matches (CRD shortNames/singular)
}
