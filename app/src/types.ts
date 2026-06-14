// UI state types: the view navigation stack and ancillary status.

import type { ContainerInfo, PortEntry } from "./k8s";

export type Focus = "sidebar" | "table";

// The view navigation stack (k9s-style). The header, sidebar and footer are
// always present; the main pane shows the top of the stack. Esc pops one level.
// `list` frames are resource tables and form the drill-down spine
// (contexts → namespaces → pods); everything else is a sub-view on top.
export type View =
  | { kind: "list"; kindId: string }
  | { kind: "help" }
  // namespaces filters like the lists: `/` starts the fuzzy filter, j/k move.
  // `next` decides where Enter goes: "back" (switch ns) or "pods" (drill in).
  | { kind: "namespaces"; all: string[]; filter: string; searching: boolean; index: number; next: "back" | "pods" }
  | { kind: "containers"; pod: { namespace: string; name: string }; items: ContainerInfo[]; index: number }
  | { kind: "describe"; subtitle: string; text: string; scroll: number; loading: boolean }
  // port-forward modal: pick a container::port, edit the local port, confirm.
  // field: 0=container port, 1=local port, 2=OK, 3=Cancel (arrow-key nav).
  | { kind: "portpick"; pod: { namespace: string; name: string }; entries: PortEntry[]; index: number; local: string; field: number }
  | { kind: "forwards"; index: number; nonce: number }
  // bottomOffset: lines scrolled up from the live tail; 0 == pinned to bottom.
  // wrap: soft-wrap long lines instead of truncating (toggled with `w`).
  | { kind: "logs"; subtitle: string; text: string; bottomOffset: number; streaming: boolean; wrap: boolean };

export type Status = { kind: "info" | "error"; text: string } | null;
