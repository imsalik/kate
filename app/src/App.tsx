import { useRenderer, useTerminalDimensions, useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Client, kindById, canDescribe, canPortForward } from "./k8s";
import type { Table } from "./k8s";
import type { Focus, Status, View } from "./types";
import { fuzzyScore } from "./lib/fuzzy";

import { C } from "./ui/theme";
import { colWidths } from "./ui/format";
import { SIDEBAR, POD_INDEX, filterNamespaces } from "./ui/nav";

import { Sidebar } from "./ui/components/Sidebar";
import { TableView } from "./ui/components/TableView";
import { LogsView } from "./ui/components/LogsView";
import { DescribeView } from "./ui/components/DescribeView";
import { ContainersView } from "./ui/components/ContainersView";
import { NamespacesView } from "./ui/components/NamespacesView";
import { ForwardsView } from "./ui/components/ForwardsView";
import { PortForwardModal } from "./ui/components/PortForwardModal";
import { HelpView } from "./ui/components/HelpView";
import { Footer } from "./ui/components/Footer";

// How often the active view silently re-fetches, in ms. Paused while a
// non-table view is open or while typing, so we don't yank the user's context.
const REFRESH_MS = 5000;

export function App() {
  const renderer = useRenderer();
  const dims = useTerminalDimensions();
  const clientRef = useRef<Client | null>(null);
  if (!clientRef.current) clientRef.current = new Client();
  const client = clientRef.current;

  // Live-log plumbing: the stream writes into a ref buffer (cheap, high-freq),
  // and a timer flushes it into view state a few times a second.
  const logAbortRef = useRef<AbortController | null>(null);
  const logBufRef = useRef<string>("");

  const [sideIndex, setSideIndex] = useState(POD_INDEX);
  const [focus, setFocus] = useState<Focus>("table");

  const [table, setTable] = useState<Table>({ headers: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [rowIndex, setRowIndex] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const [tick, setTick] = useState(0);

  const [allNs, setAllNs] = useState(false);
  const [namespace, setNamespace] = useState(client.namespace);
  const [ctxName, setCtxName] = useState(client.context);

  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [cmdMode, setCmdMode] = useState(false);
  const [cmd, setCmd] = useState("");
  // View navigation stack. A `list` frame is always at the bottom; drilling in
  // pushes more frames (contexts → namespaces → pods → containers → logs) and
  // Esc pops one level. The drill-down spine is the chain of `list` frames.
  const [stack, setStack] = useState<View[]>([{ kind: "list", kindId: "pods" }]);
  const view: View = stack[stack.length - 1]!;

  // The active resource kind = the top-most `list` frame on the stack.
  const kindId = useMemo(() => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i]!;
      if (f.kind === "list") return f.kindId;
    }
    return "pods";
  }, [stack]);

  function pushView(v: View) {
    setStack((s) => [...s, v]);
  }
  function popView() {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); // never pop the root list
  }
  // Replace the whole stack with a single fresh list at `id` (sidebar / :cmd).
  function gotoList(id: string) {
    setStack([{ kind: "list", kindId: id }]);
  }
  // Update the view currently on top of the stack (scroll, filter, flush, …).
  function setView(updater: View | ((v: View) => View)) {
    setStack((s) => {
      if (!s.length) return s;
      const top = s[s.length - 1]!;
      const next = typeof updater === "function" ? (updater as (v: View) => View)(top) : updater;
      return [...s.slice(0, -1), next];
    });
  }

  const inputMode = searchMode || cmdMode;
  const inList = view.kind === "list";

  // ----- data fetch -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    client.allNamespaces = allNs;
    client.namespace = namespace;
    setLoading(true);
    client
      .fetch(kindId)
      .then((t) => {
        if (cancelled) return;
        setTable(t);
        setLoading(false);
        setStatus(null);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setLoading(false);
        setStatus({ kind: "error", text: e?.message ?? String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [kindId, allNs, namespace, tick]);

  // Auto-refresh, paused while typing or away from the table view.
  useEffect(() => {
    if (inputMode || !inList) return;
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, [inputMode, inList]);

  // Flush the live-log buffer into the view while a logs stream is open.
  const streamingLogs = view.kind === "logs" && view.streaming;
  useEffect(() => {
    if (!streamingLogs) return;
    const flush = () =>
      setView((v) => (v.kind === "logs" ? { ...v, text: logBufRef.current } : v));
    flush();
    const id = setInterval(flush, 250);
    return () => clearInterval(id);
  }, [streamingLogs]);

  // Tear the stream down if the app exits while it's open.
  useEffect(
    () => () => {
      try {
        logAbortRef.current?.abort();
      } catch {
        /* expected on teardown */
      }
      client.stopAllForwards();
    },
    [],
  );

  // ----- derived rows (filter) -------------------------------------------
  const rows = useMemo(() => {
    if (!query) return table.rows;
    return table.rows
      .map((r) => ({ r, score: fuzzyScore(query, r.cells.join(" ")) }))
      .filter((x): x is { r: (typeof table.rows)[number]; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);
  }, [table, query]);

  useEffect(() => {
    if (rowIndex >= rows.length) setRowIndex(Math.max(0, rows.length - 1));
  }, [rows.length]);

  const widths = useMemo(() => colWidths(table), [table]);

  // ----- actions ----------------------------------------------------------
  // Aborting the follow stream can throw synchronously under Bun (not just as a
  // rejection), so always go through this guarded stopper.
  function stopLogStream() {
    try {
      logAbortRef.current?.abort();
    } catch {
      /* expected on teardown */
    }
    logAbortRef.current = null;
  }

  function goBack() {
    if (view.kind === "logs") stopLogStream();
    popView();
  }

  function moveSidebar(dir: 1 | -1) {
    let i = sideIndex;
    do {
      i += dir;
      if (i < 0 || i >= SIDEBAR.length) return; // edge, no wrap
    } while (SIDEBAR[i]!.type !== "kind");
    setSideIndex(i);
    const e = SIDEBAR[i]!;
    if (e.type === "kind") {
      gotoList(e.id); // fresh navigation — resets any drill-down
      setRowIndex(0);
      setQuery("");
    }
  }

  function runCommand(text: string) {
    const q = text.trim().toLowerCase();
    if (!q) return;
    // Aliases that open a view rather than a resource kind.
    if (["pf", "portforward", "portforwards", "forwards"].includes(q)) return openForwards();
    let best: { id: string; idx: number; score: number } | null = null;
    for (let idx = 0; idx < SIDEBAR.length; idx++) {
      const e = SIDEBAR[idx]!;
      if (e.type !== "kind") continue;
      const s = Math.max(fuzzyScore(q, e.id) ?? -Infinity, fuzzyScore(q, e.label.toLowerCase()) ?? -Infinity);
      if (s > -Infinity && (best === null || s > best.score)) best = { id: e.id, idx, score: s };
    }
    if (best) {
      gotoList(best.id);
      setSideIndex(best.idx);
      setRowIndex(0);
      setQuery("");
    } else {
      setStatus({ kind: "error", text: `no resource matches "${text}"` });
    }
  }

  // Enter on a context (even the current one): switch to it, then drill into a
  // namespace picker → pods, so Esc walks back contexts ← namespaces ← pods.
  function switchToSelectedContext() {
    const r = rows[rowIndex];
    if (!r) return;
    if (r.name !== ctxName) {
      client.switchContext(r.name);
      setCtxName(client.context);
      setNamespace(client.namespace);
      setAllNs(false);
      setStatus({ kind: "info", text: `switched to ${r.name}` });
    }
    setRowIndex(0);
    setQuery("");
    openNamespaces("pods");
  }

  // Enter on a pod: pick the container first (k9s-style) when there's more than
  // one — streaming the wrong container is why "no logs" showed for sidecars.
  function openPodLogs() {
    const r = rows[rowIndex];
    if (!r) return;
    client
      .podContainers(r.namespace, r.name)
      .then((cs) => {
        if (cs.length <= 1) startLogs({ namespace: r.namespace, name: r.name }, cs[0]?.name ?? "");
        else pushView({ kind: "containers", pod: { namespace: r.namespace, name: r.name }, items: cs, index: 0 });
      })
      .catch((e: any) => setStatus({ kind: "error", text: e?.message ?? String(e) }));
  }

  function startLogs(pod: { namespace: string; name: string }, container: string) {
    stopLogStream();
    logBufRef.current = "";
    const label = container ? `${pod.namespace}/${pod.name} · ${container}` : `${pod.namespace}/${pod.name}`;
    pushView({ kind: "logs", subtitle: label, text: "", bottomOffset: 0, streaming: true, wrap: false });
    client
      .streamPodLogs(pod.namespace, pod.name, (chunk) => {
        logBufRef.current += chunk;
      }, { container: container || undefined })
      .then((ac) => {
        logAbortRef.current = ac;
      })
      .catch((e: any) => {
        logBufRef.current = `error: ${e?.message ?? e}`;
        setView((v) => (v.kind === "logs" ? { ...v, text: logBufRef.current, streaming: false } : v));
      });
  }

  function openNamespaces(next: "back" | "pods" = "back") {
    client
      .namespaces()
      .then((all) => pushView({ kind: "namespaces", all, filter: "", searching: false, index: 0, next }))
      .catch((e: any) => setStatus({ kind: "error", text: e?.message ?? String(e) }));
  }

  function describeSelected() {
    const r = rows[rowIndex];
    if (!r || !canDescribe(kindId)) return;
    pushView({ kind: "describe", subtitle: `${kindId} ${r.namespace}/${r.name}`, text: "", scroll: 0, loading: true });
    client
      .describe(kindId, r.namespace, r.name)
      .then((text) =>
        setView((v) => (v.kind === "describe" ? { ...v, text, loading: false } : v)),
      )
      .catch((e: any) =>
        setView((v) => (v.kind === "describe" ? { ...v, text: `error: ${e?.message ?? e}`, loading: false } : v)),
      );
  }

  // Port-forward the selected row. Pods forward directly; deployments, services,
  // etc. resolve to a backing pod. Always opens the dialog (container::port +
  // editable local port + confirm), never auto-starts.
  function portForwardSelected() {
    const r = rows[rowIndex];
    if (!r || !canPortForward(kindId)) return;
    client
      .resolveForwardTarget(kindId, r.namespace, r.name)
      .then(({ pod, entries }) => {
        if (entries.length === 0) {
          setStatus({ kind: "error", text: `${pod} declares no container ports` });
          return;
        }
        pushView({
          kind: "portpick",
          pod: { namespace: r.namespace, name: pod },
          entries,
          index: 0,
          local: String(entries[0]!.port),
          field: 0,
        });
      })
      .catch((e: any) => setStatus({ kind: "error", text: e?.message ?? String(e) }));
  }

  function startForward(pod: { namespace: string; name: string }, remotePort: number, localPort: number) {
    client
      .startForward(pod.namespace, pod.name, remotePort, localPort)
      .then((entry) => {
        setStatus({ kind: "info", text: `forwarding localhost:${entry.localPort} → ${pod.name}:${entry.remotePort}` });
        popView(); // close the dialog, back to the list
      })
      .catch((e: any) => setStatus({ kind: "error", text: `port-forward failed: ${e?.message ?? e}` }));
  }

  function openForwards() {
    pushView({ kind: "forwards", index: 0, nonce: 0 });
  }

  // ----- keyboard ---------------------------------------------------------
  useKeyboard((key) => {
    // Text-entry modes (search `/` and command `:`) win over everything.
    if (inputMode) {
      const buf = searchMode ? query : cmd;
      const set = searchMode ? setQuery : setCmd;
      if (key.name === "escape") {
        if (searchMode) setQuery("");
        setSearchMode(false);
        setCmdMode(false);
        setCmd("");
      } else if (key.name === "return" || key.name === "enter") {
        if (cmdMode) runCommand(cmd);
        setSearchMode(false);
        setCmdMode(false);
        setCmd("");
      } else if (key.name === "backspace") {
        set(buf.slice(0, -1));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        set(buf + key.sequence);
      }
      return;
    }

    if (key.ctrl && key.name === "c") return renderer.destroy();

    // ----- logs view -----
    if (view.kind === "logs") {
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.name === "w") return setView({ ...view, wrap: !view.wrap });
      if (key.ctrl && key.name === "u") return setView({ ...view, bottomOffset: view.bottomOffset + 10 });
      if (key.ctrl && key.name === "d") return setView({ ...view, bottomOffset: Math.max(0, view.bottomOffset - 10) });
      if (key.name === "k" || key.name === "up") return setView({ ...view, bottomOffset: view.bottomOffset + 1 });
      if (key.name === "j" || key.name === "down")
        return setView({ ...view, bottomOffset: Math.max(0, view.bottomOffset - 1) });
      if (key.shift && key.name === "g") return setView({ ...view, bottomOffset: 0 });
      if (key.name === "g") return setView({ ...view, bottomOffset: Number.MAX_SAFE_INTEGER });
      return;
    }

    // ----- containers view (pick a container to tail) -----
    if (view.kind === "containers") {
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.name === "j" || key.name === "down")
        return setView({ ...view, index: Math.min(view.items.length - 1, view.index + 1) });
      if (key.name === "k" || key.name === "up")
        return setView({ ...view, index: Math.max(0, view.index - 1) });
      if (key.name === "return" || key.name === "enter" || key.name === "l") {
        const c = view.items[view.index];
        if (c) startLogs(view.pod, c.name);
        return;
      }
      return;
    }

    // ----- namespaces view (filters like the lists: `/` then type) -----
    if (view.kind === "namespaces") {
      const filtered = filterNamespaces(view.all, view.filter);
      // While typing the filter (after `/`): same semantics as list search —
      // enter keeps the filter, esc clears it; both leave typing mode.
      if (view.searching) {
        if (key.name === "escape") return setView({ ...view, filter: "", searching: false, index: 0 });
        if (key.name === "return" || key.name === "enter") return setView({ ...view, searching: false });
        if (key.name === "backspace") return setView({ ...view, filter: view.filter.slice(0, -1), index: 0 });
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta)
          return setView({ ...view, filter: view.filter + key.sequence, index: 0 });
        return;
      }
      if (key.sequence === "/") return setView({ ...view, searching: true });
      if (key.name === "escape") {
        if (view.filter) return setView({ ...view, filter: "", index: 0 }); // clear filter first
        return goBack();
      }
      if (key.name === "j" || key.name === "down") return setView({ ...view, index: Math.min(filtered.length - 1, view.index + 1) });
      if (key.name === "k" || key.name === "up") return setView({ ...view, index: Math.max(0, view.index - 1) });
      if (key.name === "return" || key.name === "enter") {
        const ns = filtered[view.index];
        if (ns) {
          setAllNs(false);
          setNamespace(ns);
          setRowIndex(0);
        }
        // "pods" drills deeper (keeps namespaces in the stack for Esc-back);
        // "back" just applied the namespace to the current list.
        if (view.next === "pods") {
          setSideIndex(POD_INDEX);
          pushView({ kind: "list", kindId: "pods" });
        } else {
          popView();
        }
        return;
      }
      return;
    }

    // ----- describe view (scrollable YAML) -----
    if (view.kind === "describe") {
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.name === "j" || key.name === "down") return setView({ ...view, scroll: view.scroll + 1 });
      if (key.name === "k" || key.name === "up") return setView({ ...view, scroll: Math.max(0, view.scroll - 1) });
      if (key.ctrl && key.name === "d") return setView({ ...view, scroll: view.scroll + 10 });
      if (key.ctrl && key.name === "u") return setView({ ...view, scroll: Math.max(0, view.scroll - 10) });
      if (key.name === "g") return setView({ ...view, scroll: 0 });
      return;
    }

    // ----- port-forward modal: arrow keys (or hjkl) move between fields -----
    //   field 0 = Container Port (←/→ cycles), 1 = Local Port (type digits),
    //   2 = OK, 3 = Cancel. enter on OK/elsewhere starts; Cancel/esc closes.
    //   The Local Port field only accepts digits, so vim hjkl never clash with
    //   typing — j/k still walk fields, h/l still move left/right there.
    if (view.kind === "portpick") {
      const confirm = () => {
        const e = view.entries[view.index];
        const local = Number(view.local);
        if (!e) return;
        if (!local || local < 1 || local > 65535) {
          setStatus({ kind: "error", text: `invalid local port "${view.local}"` });
          return;
        }
        startForward(view.pod, e.port, local);
      };
      const down = key.name === "down" || key.name === "tab" || key.name === "j";
      const up = key.name === "up" || key.name === "k";
      const left = key.name === "left" || key.name === "h";
      const right = key.name === "right" || key.name === "l";
      if (key.name === "escape") return goBack();
      if (down) return setView({ ...view, field: (view.field + 1) % 4 });
      if (up) return setView({ ...view, field: (view.field + 3) % 4 });
      if (view.field === 0 && (left || right)) {
        const d = right ? 1 : -1;
        const i = (view.index + d + view.entries.length) % view.entries.length;
        return setView({ ...view, index: i, local: String(view.entries[i]!.port) });
      }
      if (view.field === 3 && (left || right)) return setView({ ...view, field: 2 });
      if (view.field === 2 && (left || right)) return setView({ ...view, field: 3 });
      if (view.field === 1 && key.name === "backspace") return setView({ ...view, local: view.local.slice(0, -1) });
      if (view.field === 1 && key.sequence && /^[0-9]$/.test(key.sequence) && view.local.length < 5)
        return setView({ ...view, local: view.local + key.sequence });
      if (key.name === "return" || key.name === "enter") {
        if (view.field === 3) return goBack(); // Cancel
        return confirm();
      }
      return;
    }

    // ----- active port-forwards -----
    if (view.kind === "forwards") {
      const fws = client.listForwards();
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.name === "j" || key.name === "down") return setView({ ...view, index: Math.min(fws.length - 1, view.index + 1) });
      if (key.name === "k" || key.name === "up") return setView({ ...view, index: Math.max(0, view.index - 1) });
      if (key.name === "d" || (key.ctrl && key.name === "d") || key.name === "delete") {
        const f = fws[view.index];
        if (f) {
          client.stopForward(f.id);
          setStatus({ kind: "info", text: `stopped forward ${f.pod}:${f.remotePort}` });
          setView({ ...view, index: Math.max(0, view.index - 1), nonce: view.nonce + 1 });
        }
        return;
      }
      return;
    }

    // ----- help view -----
    if (view.kind === "help") {
      if (key.name === "escape" || key.name === "q" || key.sequence === "?") return goBack();
      return;
    }

    // ----- list view -----
    if (key.name === "escape") {
      if (query) {
        setQuery(""); // a `/` filter is active → clear it first
        return;
      }
      if (stack.length > 1) return goBack(); // else step back up the drill-down
      return;
    }
    if (key.name === "q") return renderer.destroy();
    if (key.sequence === "?") return pushView({ kind: "help" });
    if (key.sequence === "/") return setSearchMode(true);
    if (key.sequence === ":") {
      setCmd("");
      return setCmdMode(true);
    }
    if (key.name === "r") return setTick((t) => t + 1);
    if (key.name === "a") {
      setAllNs((v) => !v);
      setRowIndex(0);
      return;
    }
    if (key.name === "n") return openNamespaces();
    if (key.shift && key.name === "f") return openForwards();
    if (key.name === "d") return describeSelected();
    if (key.name === "f") return portForwardSelected();
    if (key.name === "tab") return setFocus((f) => (f === "sidebar" ? "table" : "sidebar"));

    if (focus === "sidebar") {
      if (key.name === "j" || key.name === "down") return moveSidebar(1);
      if (key.name === "k" || key.name === "up") return moveSidebar(-1);
      if (key.name === "l" || key.name === "return" || key.name === "enter") return setFocus("table");
      return;
    }

    // focus === table
    if (key.name === "h") return setFocus("sidebar");
    if (key.name === "j" || key.name === "down") return setRowIndex((i) => Math.min(rows.length - 1, i + 1));
    if (key.name === "k" || key.name === "up") return setRowIndex((i) => Math.max(0, i - 1));
    if (key.name === "g") return setRowIndex(0);
    if (key.shift && key.name === "g") return setRowIndex(Math.max(0, rows.length - 1));
    if (key.ctrl && key.name === "d") return setRowIndex((i) => Math.min(rows.length - 1, i + 10));
    if (key.ctrl && key.name === "u") return setRowIndex((i) => Math.max(0, i - 10));
    if (key.name === "return" || key.name === "enter" || key.name === "l") {
      if (kindId === "contexts") switchToSelectedContext();
      else if (kindId === "pods") openPodLogs();
    }
  });

  // ----- layout math ------------------------------------------------------
  const bodyH = Math.max(3, dims.height - 4); // minus header(1) + footer(2) + margins
  const paneInnerH = Math.max(1, bodyH - 2); // minus pane border top/bottom
  const tableViewH = Math.max(1, paneInnerH - 1); // minus column-header row
  const start = Math.min(
    Math.max(0, rowIndex - Math.floor(tableViewH / 2)),
    Math.max(0, rows.length - tableViewH),
  );
  const visible = rows.slice(start, start + tableViewH);

  // Pods with an active port-forward, for the PF column marker.
  const forwardedPods = useMemo(
    () => new Set(client.listForwards().map((f) => f.pod)),
    [stack, tick],
  );

  const kind = kindById(kindId);
  const paneTitle =
    view.kind === "logs"
      ? `Logs · ${view.subtitle}`
      : view.kind === "describe"
        ? `Describe · ${view.subtitle}`
        : view.kind === "containers"
          ? `Containers · ${view.pod.namespace}/${view.pod.name}`
          : view.kind === "forwards"
            ? "Port Forwards"
            : view.kind === "namespaces"
              ? "Namespaces"
              : view.kind === "help"
                ? "Help"
                : stack.length > 1
                    ? `${kind?.title ?? kindId}  ‹ ${namespace}`
                    : kind?.title ?? kindId;

  return (
    <box flexDirection="column" width={dims.width} height={dims.height} backgroundColor={C.bg}>
      {/* Header */}
      <box flexDirection="row" paddingX={1} backgroundColor={C.surface}>
        <text fg={C.accentLight}>kate </text>
        <text fg={C.textDim}>ctx </text>
        <text fg={C.text}>{ctxName} </text>
        <text fg={C.textDim}>ns </text>
        <text fg={C.accent}>{allNs ? "<all>" : namespace} </text>
        <box flexGrow={1} />
        <text fg={C.textDim}>{kind?.title ?? kindId} </text>
        <text fg={C.accent}>[{rows.length}]</text>
        {loading && <text fg={C.textDim}> …</text>}
      </box>

      {/* Body: sidebar + main pane */}
      <box flexDirection="row" flexGrow={1} gap={1} paddingX={1}>
        <Sidebar sideIndex={sideIndex} focus={focus} activeId={kindId} inList={inList} />
        <box
          flexGrow={1}
          flexDirection="column"
          border
          borderColor={!inList ? C.accent : focus === "table" ? C.accent : C.border}
          title={paneTitle}
          titleAlignment="left"
        >
          {(view.kind === "list" || view.kind === "portpick") && (
            <TableView
              table={table}
              widths={widths}
              visible={visible}
              start={start}
              tableViewH={tableViewH}
              rowIndex={rowIndex}
              focus={focus}
              loading={loading}
              query={query}
              kindId={kindId}
              ctxName={ctxName}
              total={rows.length}
              forwardedPods={forwardedPods}
            />
          )}
          {view.kind === "logs" && <LogsView view={view} height={paneInnerH} width={dims.width - 30} />}
          {view.kind === "describe" && <DescribeView view={view} height={paneInnerH} width={dims.width - 30} />}
          {view.kind === "containers" && <ContainersView view={view} height={paneInnerH} />}
          {view.kind === "forwards" && <ForwardsView forwards={client.listForwards()} index={view.index} height={paneInnerH} />}
          {view.kind === "namespaces" && <NamespacesView view={view} height={paneInnerH} current={namespace} />}
          {view.kind === "help" && <HelpView />}
        </box>
      </box>

      {/* Port-forward modal — floats centered over the list */}
      {view.kind === "portpick" && <PortForwardModal view={view} dims={dims} />}

      {/* Footer */}
      <Footer
        searchMode={searchMode}
        cmdMode={cmdMode}
        query={query}
        cmd={cmd}
        status={status}
        view={view}
        kindId={kindId}
      />
    </box>
  );
}
