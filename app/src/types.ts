// UI state types: the view navigation stack and ancillary status.

import type { ContainerInfo, PortEntry } from "./k8s";

export type Focus = "sidebar" | "table";

// The view navigation stack (k9s-style). The header, sidebar and footer are
// always present; the main pane shows the top of the stack. Esc pops one level.
// `list` frames are resource tables and form the drill-down spine
// (contexts → namespaces → pods); everything else is a sub-view on top.
export type View =
  // `nsReturn` is only set on the Namespaces list, recording where Enter should
  // go after picking a namespace: "back" pops to the resource we came from,
  // "pods" drills into pods (the contexts → namespaces → pods flow).
  | { kind: "list"; kindId: string; nsReturn?: "back" | "pods" }
  | { kind: "help" }
  // Settings. `index` walks the theme list; moving previews the theme live.
  | { kind: "config"; index: number }
  | { kind: "containers"; pod: { namespace: string; name: string }; items: ContainerInfo[]; index: number }
  // pod picker shown when a workload (job/deployment/…) has several pods; Enter
  // drills into the chosen pod's logs. `subtitle` is the parent workload name.
  | { kind: "podpick"; namespace: string; pods: string[]; index: number; subtitle: string }
  // search/searchInput/matchIdx mirror the logs view: `/` opens the entry bar,
  // typing highlights matches live, n/N walk them. "" search == off.
  | { kind: "describe"; subtitle: string; text: string; scroll: number; loading: boolean; search: string; searchInput: boolean; matchIdx: number }
  // port-forward modal: pick a container::port, edit the local port, confirm.
  // field: 0=container port, 1=local port, 2=OK, 3=Cancel (arrow-key nav).
  | { kind: "portpick"; pod: { namespace: string; name: string }; entries: PortEntry[]; index: number; local: string; field: number }
  | { kind: "forwards"; index: number; nonce: number }
  // bottomOffset: lines scrolled up from the live tail; 0 == pinned to bottom.
  // wrap: soft-wrap long lines instead of truncating (toggled with `w`).
  // search: the active highlight term ("" == off); searchInput: the `/` entry
  // bar is open and keystrokes edit the term; matchIdx: the n/N-selected match.
  | { kind: "logs"; subtitle: string; text: string; bottomOffset: number; streaming: boolean; wrap: boolean; search: string; searchInput: boolean; matchIdx: number };

export type Status = { kind: "info" | "error"; text: string } | null;
