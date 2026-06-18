import { useRenderer, useTerminalDimensions, useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Client, kindById, canDescribe, canPortForward, canViewLogs } from "./k8s";
import type { Table } from "./k8s";
import type { Focus, Status, View } from "./types";
import { fuzzyScore } from "./lib/fuzzy";
import { copyToClipboard as clipboardCopy } from "./lib/clipboard";
import { saveConfig, rememberNamespace } from "./config";

import { C, applyTheme, THEME_NAMES, currentThemeName } from "./ui/theme";
import { findMatches } from "./ui/highlight";
import { SIDEBAR, POD_INDEX } from "./ui/nav";
import { matchCommands, type Candidate } from "./commands";

import { Sidebar } from "./ui/components/Sidebar";
import { CommandPalette } from "./ui/components/CommandPalette";
import { FilterBar } from "./ui/components/FilterBar";
import { LogSearchBar } from "./ui/components/LogSearchBar";
import { ConfigView } from "./ui/components/ConfigView";
import { Header } from "./ui/components/Header";
import { PodPickView } from "./ui/components/PodPickView";
import { TableView } from "./ui/components/TableView";
import { LogsView } from "./ui/components/LogsView";
import { DescribeView } from "./ui/components/DescribeView";
import { ContainersView } from "./ui/components/ContainersView";
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

  // Refresh plumbing: `loadKeyRef` is the current selector (kind/ns/ctx) so we
  // can tell a real navigation from a silent background poll; `tableSigRef` is a
  // signature of the rendered table so a poll that returns identical data is a
  // no-op (no setState → no redraw → no flicker). k9s polls too — the trick is
  // diffing, not redrawing.
  const loadKeyRef = useRef<string>("");
  const tableSigRef = useRef<string>("");

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
  const [cmdSel, setCmdSel] = useState(0); // highlighted palette candidate
  // Namespace names for the current context, cached for `:ns` completion.
  const [nsCache, setNsCache] = useState<string[]>([]);
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

  // Clear the table the instant we change *what* we're looking at (kind /
  // namespace / context), so a slow or failing fetch can never leave another
  // kind's rows showing under the new title. (Plain `tick` refreshes don't
  // clear — they'd flash empty every interval.)
  useEffect(() => {
    setTable({ headers: [], rows: [] });
    setRowIndex(0);
    tableSigRef.current = ""; // force the next fetch to render
  }, [kindId, allNs, namespace, ctxName]);

  // ----- data fetch -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    client.allNamespaces = allNs;
    client.namespace = namespace;

    // Loading indicator only for an actual navigation, not background polls —
    // flashing "…" every interval is half the flicker.
    const key = `${kindId}|${allNs}|${namespace}|${ctxName}`;
    const navigated = key !== loadKeyRef.current;
    loadKeyRef.current = key;
    if (navigated) setLoading(true);

    client
      .fetch(kindId)
      .then((t) => {
        if (cancelled) return;
        // Skip the state update (and thus the redraw) when nothing changed.
        const sig = JSON.stringify(t);
        if (sig !== tableSigRef.current) {
          tableSigRef.current = sig;
          setTable(t);
        }
        setLoading(false);
        setStatus(null);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setTable({ headers: [], rows: [] }); // don't keep stale rows on error
        tableSigRef.current = "";
        setLoading(false);
        setStatus({ kind: "error", text: e?.message ?? String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [kindId, allNs, namespace, ctxName, tick]);

  // Transient status: clear it after a moment so the footer reverts to hints.
  // Errors linger a little longer than info confirmations.
  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), status.kind === "error" ? 6000 : 2500);
    return () => clearTimeout(id);
  }, [status]);

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
    const countLines = (s: string) => (s === "" ? 0 : s.replace(/\n$/, "").split("\n").length);
    const flush = () =>
      setView((v) => {
        if (v.kind !== "logs") return v;
        const text = logBufRef.current;
        // bottomOffset === 0 means "follow the live tail" → always show the end.
        if (v.bottomOffset === 0) return { ...v, text };
        // Scrolled up (paused): incoming lines must not yank what you're reading.
        // bottomOffset counts lines up from the bottom, so grow it by the number
        // of newly appended lines to keep the same absolute lines on screen.
        const added = Math.max(0, countLines(text) - countLines(v.text));
        return { ...v, text, bottomOffset: Math.min(logMaxOffset(text), v.bottomOffset + added) };
      });
    flush();
    const id = setInterval(flush, 250);
    return () => clearInterval(id);
  }, [streamingLogs]);

  // Copy-on-selection: when a mouse selection finishes, push it to the system
  // clipboard via OSC 52 (works over SSH/tmux). Log & describe lines are marked
  // `selectable`, so this covers the read-only text views.
  useEffect(() => {
    const onSelection = (sel: { getSelectedText?: () => string } | null) => {
      const text = sel?.getSelectedText?.() ?? "";
      if (!text) return;
      clipboardCopy(text);
      setStatus({ kind: "info", text: `copied ${text.split("\n").length} line(s) to clipboard` });
    };
    renderer.on("selection", onSelection);
    return () => {
      renderer.off("selection", onSelection);
    };
  }, [renderer]);

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

  // Cache namespace names per context so the `:ns` palette can complete them.
  useEffect(() => {
    let cancelled = false;
    client
      .namespaces()
      .then((ns) => !cancelled && setNsCache(ns))
      .catch(() => !cancelled && setNsCache([]));
    return () => {
      cancelled = true;
    };
  }, [ctxName]);

  // Live command-palette candidates: fuzzy-ranked verbs/resources, with dynamic
  // arg completion against real context + namespace names.
  const cmdCandidates = useMemo<Candidate[]>(
    () =>
      cmdMode
        ? matchCommands(cmd, {
            contexts: client.contexts().map((c) => c.name),
            namespaces: nsCache,
          })
        : [],
    [cmdMode, cmd, nsCache, ctxName],
  );
  // Keep the highlight in range as candidates shrink.
  useEffect(() => {
    if (cmdSel >= cmdCandidates.length) setCmdSel(Math.max(0, cmdCandidates.length - 1));
  }, [cmdCandidates.length]);

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

  // Jump the list to a resource kind and sync the sidebar selection.
  function jumpToKind(id: string) {
    gotoList(id);
    const idx = SIDEBAR.findIndex((e) => e.type === "kind" && e.id === id);
    if (idx >= 0) setSideIndex(idx);
    setRowIndex(0);
    setQuery("");
  }

  // Switch namespace by name directly (`:ns <name>`), persisting the choice.
  function applyNamespaceByName(ns: string) {
    setAllNs(false);
    setNamespace(ns);
    setRowIndex(0);
    rememberNamespace(ctxName, ns);
    setStatus({ kind: "info", text: `namespace: ${ns}` });
  }

  // Switch context by name directly (`:ctx <name>`).
  function applyContextByName(name: string) {
    if (!client.contexts().some((c) => c.name === name)) {
      setStatus({ kind: "error", text: `no context "${name}"` });
      return;
    }
    if (name !== ctxName) {
      client.switchContext(name);
      setCtxName(client.context);
      setNamespace(client.namespace);
      setAllNs(false);
      saveConfig({ lastContext: client.context });
      setStatus({ kind: "info", text: `switched to ${name}` });
    }
    jumpToKind("pods");
  }

  function doApplyTheme(name: string) {
    if (applyTheme(name)) setStatus({ kind: "info", text: `theme: ${name}` });
    else setStatus({ kind: "error", text: `no theme "${name}"` });
  }

  // Execute a chosen palette candidate. Every branch is read-only.
  function runCandidate(c: Candidate) {
    const { name } = c.command;
    switch (name) {
      case "contexts":
        return c.arg ? applyContextByName(c.arg) : jumpToKind("contexts");
      case "namespace":
        return c.arg ? applyNamespaceByName(c.arg) : openNamespaces();
      case "forwards":
        return openForwards();
      case "theme":
        return c.arg ? doApplyTheme(c.arg) : openConfig();
      case "config":
        return openConfig();
      case "all":
        setAllNs((v) => !v);
        setRowIndex(0);
        return;
      case "help":
        return pushView({ kind: "help" });
      case "quit":
        return renderer.destroy();
      default:
        return jumpToKind(name); // a resource kind
    }
  }

  // Enter on a context (even the current one): switch to it, then drill into a
  // namespace picker → pods, so Esc walks back contexts ← namespaces ← pods.
  function switchToSelectedContext(idx = rowIndex) {
    const r = rows[idx];
    if (!r) return;
    if (r.name !== ctxName) {
      client.switchContext(r.name);
      setCtxName(client.context);
      setNamespace(client.namespace);
      setAllNs(false);
      saveConfig({ lastContext: client.context }); // reopen here next launch
      setStatus({ kind: "info", text: `switched to ${r.name}` });
    }
    setRowIndex(0);
    setQuery("");
    openNamespaces("pods");
  }

  // Open logs for a specific pod: pick the container first (k9s-style) when
  // there's more than one — streaming the wrong container is why "no logs"
  // showed for sidecars.
  function logsForPod(namespace: string, name: string) {
    client
      .podContainers(namespace, name)
      .then((cs) => {
        if (cs.length <= 1) startLogs({ namespace, name }, cs[0]?.name ?? "");
        else pushView({ kind: "containers", pod: { namespace, name }, items: cs, index: 0 });
      })
      .catch((e: any) => setStatus({ kind: "error", text: e?.message ?? String(e) }));
  }

  // Enter on a logs-capable row: pods go straight to logs; workloads/jobs
  // resolve their backing pods first — one pod tails directly, several open a
  // pod picker.
  function openLogsForSelected(idx = rowIndex) {
    const r = rows[idx];
    if (!r) return;
    if (kindId === "pods") return logsForPod(r.namespace, r.name);
    client
      .podsFor(kindId, r.namespace, r.name)
      .then((pods) => {
        if (pods.length === 0) setStatus({ kind: "error", text: `no pods found for ${r.name}` });
        else if (pods.length === 1) logsForPod(r.namespace, pods[0]!);
        else pushView({ kind: "podpick", namespace: r.namespace, pods, index: 0, subtitle: r.name });
      })
      .catch((e: any) => setStatus({ kind: "error", text: e?.message ?? String(e) }));
  }

  function startLogs(pod: { namespace: string; name: string }, container: string) {
    stopLogStream();
    logBufRef.current = "";
    const label = container ? `${pod.namespace}/${pod.name} · ${container}` : `${pod.namespace}/${pod.name}`;
    pushView({ kind: "logs", subtitle: label, text: "", bottomOffset: 0, streaming: true, wrap: false, search: "", searchInput: false, matchIdx: 0 });
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

  // Open the Namespaces list (a real resource list now, so it shows in the
  // sidebar and the table fetch loads it). `next` records where Enter on a
  // namespace should go afterwards: "back" to the resource we came from (the
  // `n` quick-switch) or "pods" (the contexts → namespaces → pods drill).
  function openNamespaces(next: "back" | "pods" = "back") {
    const idx = SIDEBAR.findIndex((e) => e.type === "kind" && e.id === "namespaces");
    if (idx >= 0) setSideIndex(idx);
    setRowIndex(0);
    setQuery("");
    pushView({ kind: "list", kindId: "namespaces", nsReturn: next });
  }

  // Enter on a namespace row: switch the active namespace, persist it, then go
  // where this list said to (pods, or back to the prior resource).
  function switchToSelectedNamespace(idx = rowIndex) {
    const r = rows[idx];
    if (!r) return;
    const nsReturn = view.kind === "list" ? view.nsReturn : undefined;
    setAllNs(false);
    setNamespace(r.name);
    rememberNamespace(ctxName, r.name);
    setRowIndex(0);
    setQuery("");
    if (nsReturn === "back") {
      popView(); // back to the resource we were viewing, now in the new ns
    } else {
      setSideIndex(POD_INDEX);
      pushView({ kind: "list", kindId: "pods" });
    }
  }

  function describeSelected() {
    const r = rows[rowIndex];
    if (!r || !canDescribe(kindId)) return;
    // Cluster-scoped resources (e.g. namespaces) have no namespace to show.
    const target = r.namespace ? `${r.namespace}/${r.name}` : r.name;
    pushView({ kind: "describe", subtitle: `${kindId} ${target}`, text: "", scroll: 0, loading: true });
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

  function openConfig() {
    const idx = Math.max(0, THEME_NAMES.indexOf(currentThemeName));
    pushView({ kind: "config", index: idx });
  }

  function closeCmd() {
    setCmdMode(false);
    setCmd("");
    setCmdSel(0);
  }

  // Max scroll-up for the logs view, in lines (0 == live tail). Clamps
  // bottomOffset so paging/scrolling up can't overshoot the top — overshooting
  // is what left the view "stuck" until you scrolled all the way back down.
  function logMaxOffset(text: string): number {
    const n = text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
    return Math.max(0, n - Math.max(1, paneInnerH - 1));
  }
  // Same idea for the describe view's top-down scroll offset.
  function describeMaxScroll(text: string, loading: boolean): number {
    const n = loading ? 1 : text.split("\n").length;
    return Math.max(0, n - Math.max(1, paneInnerH - 1));
  }

  // ----- logs search (highlight + jump) -----------------------------------
  // Split a log buffer into lines the same way LogsView does, so match line
  // numbers line up with what's drawn.
  function logLines(text: string): string[] {
    return text === "" ? [] : text.replace(/\n$/, "").split("\n");
  }
  // The visible row count LogsView uses (its height is paneInnerH, minus the
  // status row). Matters because we scroll a match toward the middle of it, and
  // it must match logMaxOffset's clamp so a jump can't overshoot the top.
  function logsViewH(): number {
    return Math.max(1, paneInnerH - 1);
  }
  // bottomOffset (lines up from the live tail) that brings source line `line`
  // roughly to the middle of the pane, clamped so it can't overshoot the top.
  function offsetForLine(line: number, total: number, viewH: number): number {
    const endLine = Math.min(total, line + 1 + Math.floor(viewH / 2));
    return Math.max(0, Math.min(Math.max(0, total - viewH), total - endLine));
  }
  // Apply a new search term: recompute matches, pick the one nearest the current
  // viewport (incremental-search feel), and scroll it into view. The term is
  // derived inside the state updater (not from the render closure) so fast typing
  // can't drop characters — same trick as the table filter's functional setQuery.
  function applyLogSearch(edit: (prev: string) => string) {
    setView((v) => {
      if (v.kind !== "logs") return v;
      const term = edit(v.search);
      if (!term) return { ...v, search: "", matchIdx: 0 };
      const lines = logLines(v.text);
      const ms = findMatches(lines, term);
      if (ms.length === 0) return { ...v, search: term, matchIdx: 0 };
      const viewH = logsViewH();
      const center = Math.max(0, lines.length - v.bottomOffset - Math.floor(viewH / 2));
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < ms.length; i++) {
        const d = Math.abs(ms[i]!.line - center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { ...v, search: term, matchIdx: best, bottomOffset: offsetForLine(ms[best]!.line, lines.length, viewH) };
    });
  }
  // Step n/N through the matches, wrapping around, scrolling each into view.
  function jumpMatch(dir: 1 | -1) {
    setView((v) => {
      if (v.kind !== "logs" || !v.search) return v;
      const lines = logLines(v.text);
      const ms = findMatches(lines, v.search);
      if (ms.length === 0) return v;
      const next = (v.matchIdx + dir + ms.length) % ms.length;
      return { ...v, matchIdx: next, bottomOffset: offsetForLine(ms[next]!.line, lines.length, logsViewH()) };
    });
  }

  // Copy text to the system clipboard (native helper, OSC 52 fallback) and
  // report the outcome in the footer.
  function copyToClipboard(text: string, label: string) {
    if (!text) return setStatus({ kind: "info", text: "nothing to copy" });
    const ok = clipboardCopy(text);
    setStatus(
      ok
        ? { kind: "info", text: `copied ${label} to clipboard` }
        : { kind: "error", text: "could not copy to clipboard" },
    );
  }

  // ----- mouse (basics: scroll + click) -----------------------------------
  // The Enter action for a row, but driven by an explicit index (a click need
  // not match the keyboard selection).
  function activateRowAt(idx: number) {
    if (kindId === "contexts") switchToSelectedContext(idx);
    else if (kindId === "namespaces") switchToSelectedNamespace(idx);
    else if (canViewLogs(kindId)) openLogsForSelected(idx);
  }

  // Single click selects the row; a second click on the same row (within
  // 400ms) opens it — so a stray click never streams logs by surprise.
  const lastClickRef = useRef<{ idx: number; t: number }>({ idx: -1, t: 0 });
  function onRowClick(idx: number) {
    if (inputMode) return;
    setFocus("table");
    setRowIndex(idx);
    const now = Date.now();
    const prev = lastClickRef.current;
    if (prev.idx === idx && now - prev.t < 400) {
      lastClickRef.current = { idx: -1, t: 0 };
      activateRowAt(idx);
    } else {
      lastClickRef.current = { idx, t: now };
    }
  }

  // Wheel scroll: move the selection in lists, scroll text in logs/describe,
  // move the cursor in the menu-like views.
  function onPaneScroll(dir: "up" | "down" | "left" | "right") {
    if (inputMode || dir === "left" || dir === "right") return;
    const d = dir === "down" ? 1 : -1;
    const STEP = 3;
    if (view.kind === "logs")
      return setView((v) =>
        v.kind === "logs"
          ? {
              ...v,
              bottomOffset:
                dir === "up"
                  ? Math.min(logMaxOffset(v.text), v.bottomOffset + STEP)
                  : Math.max(0, v.bottomOffset - STEP),
            }
          : v,
      );
    if (view.kind === "describe")
      return setView((v) =>
        v.kind === "describe"
          ? { ...v, scroll: Math.max(0, Math.min(describeMaxScroll(v.text, v.loading), v.scroll + d * STEP)) }
          : v,
      );
    if (view.kind === "containers")
      return setView((v) =>
        v.kind === "containers" ? { ...v, index: Math.min(v.items.length - 1, Math.max(0, v.index + d)) } : v,
      );
    if (view.kind === "podpick")
      return setView((v) =>
        v.kind === "podpick" ? { ...v, index: Math.min(v.pods.length - 1, Math.max(0, v.index + d)) } : v,
      );
    if (view.kind === "forwards") {
      const n = client.listForwards().length;
      return setView((v) => (v.kind === "forwards" ? { ...v, index: Math.min(n - 1, Math.max(0, v.index + d)) } : v));
    }
    if (view.kind === "config") {
      const i = Math.min(THEME_NAMES.length - 1, Math.max(0, view.index + d));
      applyTheme(THEME_NAMES[i]!); // live preview, mirrors the keyboard picker
      return setView({ ...view, index: i });
    }
    // list view
    const last = Math.max(0, rows.length - 1);
    setFocus("table");
    setRowIndex((i) => Math.min(last, Math.max(0, i + d * STEP)));
  }

  // Click a sidebar entry → jump to that kind; wheel over it → walk kinds.
  function onSidebarSelect(id: string) {
    if (inputMode) return;
    jumpToKind(id);
    setFocus("table");
  }
  function onSidebarScroll(dir: "up" | "down" | "left" | "right") {
    if (inputMode) return;
    if (dir === "down") moveSidebar(1);
    else if (dir === "up") moveSidebar(-1);
  }

  // ----- keyboard ---------------------------------------------------------
  useKeyboard((key) => {
    // Command palette (`:`) — its own modal with a candidate list.
    if (cmdMode) {
      if (key.name === "escape") return closeCmd();
      if (key.name === "up") return setCmdSel((i) => Math.max(0, i - 1));
      if (key.name === "down") return setCmdSel((i) => Math.min(cmdCandidates.length - 1, i + 1));
      if (key.name === "tab") {
        const c = cmdCandidates[cmdSel];
        if (c) {
          setCmd(c.complete);
          setCmdSel(0);
        }
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const c = cmdCandidates[cmdSel];
        closeCmd();
        if (c) runCandidate(c);
        return;
      }
      if (key.name === "backspace") {
        setCmd((s) => s.slice(0, -1));
        setCmdSel(0);
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setCmd((s) => s + key.sequence);
        setCmdSel(0);
      }
      return;
    }

    // Search (`/`) text entry — wins over view keys.
    if (searchMode) {
      if (key.name === "escape") {
        setQuery("");
        setSearchMode(false);
      } else if (key.name === "return" || key.name === "enter") {
        setSearchMode(false);
      } else if (key.name === "backspace") {
        setQuery((q) => q.slice(0, -1));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setQuery((q) => q + key.sequence);
      }
      return;
    }

    // Logs `/` search text entry — incremental highlight as you type. Esc clears
    // the term and closes; Enter keeps the highlight and hands keys back so n/N
    // can walk the matches.
    if (view.kind === "logs" && view.searchInput) {
      if (key.name === "escape") return setView({ ...view, searchInput: false, search: "", matchIdx: 0 });
      if (key.name === "return" || key.name === "enter") return setView({ ...view, searchInput: false });
      if (key.name === "backspace") return applyLogSearch((s) => s.slice(0, -1));
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) return applyLogSearch((s) => s + key.sequence);
      return;
    }

    if (key.ctrl && key.name === "c") {
      // ctrl+shift+c → copy (the selection if any, else the current text view)
      // instead of quitting, so the muscle-memory copy chord doesn't kill kate.
      if (key.shift) {
        const sel = renderer.getSelection()?.getSelectedText() ?? "";
        if (sel) return copyToClipboard(sel, `${sel.split("\n").length} line(s)`);
        if (view.kind === "logs") return copyToClipboard(view.text, "log buffer");
        if (view.kind === "describe") return copyToClipboard(view.text, "describe output");
        return;
      }
      return renderer.destroy();
    }

    // Universal jump to the resource sidebar. Tab works from anywhere; h / ←
    // also work from the menu-like views. From a sub-view this collapses the
    // stack back to the list spine first — the sidebar only highlights over a
    // list, so otherwise focusing it would do nothing visible. The portpick
    // modal owns these keys for its own fields, and a live ns-filter is text.
    // h / ← bail to the sidebar from list + the menu-like pickers, but NOT from
    // logs/describe (a reader pressing h by habit shouldn't get yanked out —
    // Tab still works there).
    const hOk =
      view.kind === "list" ||
      view.kind === "containers" ||
      view.kind === "podpick" ||
      view.kind === "config";
    if (view.kind !== "portpick") {
      const wantsSidebar = key.name === "tab" || ((key.name === "h" || key.name === "left") && hOk);
      if (wantsSidebar) {
        if (view.kind === "list") {
          // On a list, Tab toggles focus; h / ← go straight to the sidebar.
          if (key.name === "tab") setFocus((f) => (f === "sidebar" ? "table" : "sidebar"));
          else setFocus("sidebar");
        } else {
          if (view.kind === "logs") stopLogStream();
          setStack((s) => {
            const lists = s.filter((f) => f.kind === "list");
            return lists.length ? lists : [{ kind: "list", kindId: "pods" }];
          });
          setFocus("sidebar");
        }
        return;
      }
    }

    // Command palette opens from anywhere (except the port-forward form, which
    // owns its own keys) — so you can jump to any resource without backing out.
    if (key.sequence === ":" && view.kind !== "portpick") {
      setCmd("");
      setCmdSel(0);
      return setCmdMode(true);
    }

    // ----- logs view -----
    if (view.kind === "logs") {
      // Esc clears an active highlight first (so it doesn't close the view out
      // from under a search); a second Esc — or q — backs out.
      if (key.name === "escape" && view.search) return setView({ ...view, search: "", matchIdx: 0 });
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.sequence === "/") return setView({ ...view, searchInput: true, search: "", matchIdx: 0 });
      if (view.search && key.name === "n") return jumpMatch(key.shift ? -1 : 1);
      if (key.name === "c" || key.name === "y") return copyToClipboard(view.text, "log buffer");
      if (key.name === "w") return setView({ ...view, wrap: !view.wrap });
      // bottomOffset counts lines scrolled UP from the live tail (0 == pinned),
      // clamped to the top so scrolling up can't overshoot and get stuck.
      const lmax = logMaxOffset(view.text);
      if ((key.ctrl && key.name === "u") || key.name === "pageup") return setView({ ...view, bottomOffset: Math.min(lmax, view.bottomOffset + 10) });
      if ((key.ctrl && key.name === "d") || key.name === "pagedown") return setView({ ...view, bottomOffset: Math.max(0, view.bottomOffset - 10) });
      if (key.name === "k" || key.name === "up") return setView({ ...view, bottomOffset: Math.min(lmax, view.bottomOffset + 1) });
      if (key.name === "j" || key.name === "down")
        return setView({ ...view, bottomOffset: Math.max(0, view.bottomOffset - 1) });
      if ((key.shift && key.name === "g") || key.name === "end") return setView({ ...view, bottomOffset: 0 });
      if (key.name === "g" || key.name === "home") return setView({ ...view, bottomOffset: lmax });
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

    // ----- pod picker (a workload's pods → logs) -----
    if (view.kind === "podpick") {
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.name === "j" || key.name === "down")
        return setView({ ...view, index: Math.min(view.pods.length - 1, view.index + 1) });
      if (key.name === "k" || key.name === "up")
        return setView({ ...view, index: Math.max(0, view.index - 1) });
      if (key.name === "return" || key.name === "enter" || key.name === "l") {
        const p = view.pods[view.index];
        if (p) logsForPod(view.namespace, p);
        return;
      }
      return;
    }

    // (Namespaces is now a normal resource list — handled by the list view
    // section below, with Enter routed to switchToSelectedNamespace.)

    // ----- describe view (scrollable YAML) -----
    if (view.kind === "describe") {
      if (key.name === "escape" || key.name === "q") return goBack();
      if (key.name === "c" || key.name === "y") return copyToClipboard(view.text, "describe output");
      const dmax = describeMaxScroll(view.text, view.loading);
      if (key.name === "j" || key.name === "down") return setView({ ...view, scroll: Math.min(dmax, view.scroll + 1) });
      if (key.name === "k" || key.name === "up") return setView({ ...view, scroll: Math.max(0, view.scroll - 1) });
      if ((key.ctrl && key.name === "d") || key.name === "pagedown") return setView({ ...view, scroll: Math.min(dmax, view.scroll + 10) });
      if ((key.ctrl && key.name === "u") || key.name === "pageup") return setView({ ...view, scroll: Math.max(0, view.scroll - 10) });
      if (key.name === "g" || key.name === "home") return setView({ ...view, scroll: 0 });
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

    // ----- config / settings (live theme picker) -----
    if (view.kind === "config") {
      if (key.name === "escape" || key.name === "q" || key.name === "return" || key.name === "enter") return goBack();
      const move = (d: 1 | -1) => {
        const i = Math.min(THEME_NAMES.length - 1, Math.max(0, view.index + d));
        applyTheme(THEME_NAMES[i]!); // live preview + persist as you browse
        setView({ ...view, index: i });
      };
      if (key.name === "j" || key.name === "down") return move(1);
      if (key.name === "k" || key.name === "up") return move(-1);
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

    if (focus === "sidebar") {
      if (key.name === "j" || key.name === "down") return moveSidebar(1);
      if (key.name === "k" || key.name === "up") return moveSidebar(-1);
      if (key.name === "l" || key.name === "right" || key.name === "return" || key.name === "enter") return setFocus("table");
      return;
    }

    // focus === table. A page == one visible screen of rows. (h / ← / tab are
    // handled by the universal sidebar jump above.)
    const page = Math.max(1, tableViewH - 1);
    const last = Math.max(0, rows.length - 1);
    if (key.name === "j" || key.name === "down") return setRowIndex((i) => Math.min(last, i + 1));
    if (key.name === "k" || key.name === "up") return setRowIndex((i) => Math.max(0, i - 1));
    if (key.name === "g" || key.name === "home") return setRowIndex(0);
    if ((key.shift && key.name === "g") || key.name === "end") return setRowIndex(last);
    if ((key.ctrl && key.name === "d") || key.name === "pagedown") return setRowIndex((i) => Math.min(last, i + page));
    if ((key.ctrl && key.name === "u") || key.name === "pageup") return setRowIndex((i) => Math.max(0, i - page));
    if (key.name === "return" || key.name === "enter" || key.name === "l") {
      if (kindId === "contexts") switchToSelectedContext();
      else if (kindId === "namespaces") switchToSelectedNamespace();
      else if (canViewLogs(kindId)) openLogsForSelected();
    }
  });

  // ----- layout math ------------------------------------------------------
  const HEADER_H = 4; // bordered header: 2 content rows + top/bottom border
  const SIDEBAR_W = 22;
  // Pane inner content width = terminal − body padding(2) − sidebar − gap(1) −
  // pane border(2). Used to spread the table columns; recomputed on resize.
  const paneContentW = Math.max(20, dims.width - SIDEBAR_W - 7);
  const bodyH = Math.max(3, dims.height - HEADER_H - 3); // minus header + footer(2) + margin
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
  const forwardsCount = useMemo(() => client.listForwards().length, [stack, tick, status]);
  // Cluster/user for the active context, for the header (memoized on ctxName).
  const activeCtx = useMemo(() => client.contexts().find((c) => c.active), [ctxName]);

  // Search hits for the logs view, recomputed when the buffer or term changes.
  // LogsView paints these; the keyboard handler recomputes its own for jumps.
  const logMatches = useMemo(
    () => (view.kind === "logs" && view.search ? findMatches(logLines(view.text), view.search) : []),
    [view],
  );

  const kind = kindById(kindId);
  const paneTitle =
    view.kind === "logs"
      ? `Logs · ${view.subtitle}`
      : view.kind === "describe"
        ? `Describe · ${view.subtitle}`
        : view.kind === "containers"
          ? `Containers · ${view.pod.namespace}/${view.pod.name}`
          : view.kind === "podpick"
          ? `Pods · ${view.subtitle}`
          : view.kind === "forwards"
            ? "Port Forwards"
            : view.kind === "help"
              ? "Help"
              : view.kind === "config"
                ? "Settings"
                : stack.length > 1
                    ? `${kind?.title ?? kindId}  ‹ ${namespace}`
                    : kind?.title ?? kindId;

  return (
    <box flexDirection="column" width={dims.width} height={dims.height} backgroundColor={C.bg}>
      {/* Header */}
      <Header
        ctxName={ctxName}
        cluster={activeCtx?.cluster ?? ctxName}
        user={activeCtx?.user ?? ""}
        namespace={namespace}
        allNs={allNs}
        kindTitle={kind?.title ?? kindId}
        count={rows.length}
        loading={loading}
        forwards={forwardsCount}
        refreshSecs={Math.round(REFRESH_MS / 1000)}
      />

      {/* Body: sidebar + main pane */}
      <box flexDirection="row" flexGrow={1} gap={1} paddingX={1}>
        <Sidebar
          sideIndex={sideIndex}
          focus={focus}
          activeId={kindId}
          inList={inList}
          onSelect={onSidebarSelect}
          onScroll={onSidebarScroll}
        />
        <box
          flexGrow={1}
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor={!inList ? C.accent : focus === "table" ? C.accent : C.border}
          title={` ${paneTitle} `}
          titleAlignment="left"
          onMouseScroll={(e) => e.scroll && onPaneScroll(e.scroll.direction)}
        >
          {(view.kind === "list" || view.kind === "portpick") && (
            <TableView
              table={table}
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
              width={paneContentW}
              onRowClick={onRowClick}
            />
          )}
          {view.kind === "logs" && <LogsView view={view} height={paneInnerH} width={dims.width - 30} matches={logMatches} />}
          {view.kind === "describe" && <DescribeView view={view} height={paneInnerH} width={dims.width - 30} />}
          {view.kind === "containers" && <ContainersView view={view} height={paneInnerH} />}
          {view.kind === "podpick" && <PodPickView view={view} height={paneInnerH} />}
          {view.kind === "forwards" && <ForwardsView forwards={client.listForwards()} index={view.index} height={paneInnerH} />}
          {view.kind === "help" && <HelpView />}
          {view.kind === "config" && <ConfigView view={view} />}
        </box>
      </box>

      {/* Command palette / filter — float just below the header */}
      {cmdMode && <CommandPalette input={cmd} candidates={cmdCandidates} sel={cmdSel} dims={dims} top={HEADER_H} />}
      {searchMode && <FilterBar query={query} count={rows.length} dims={dims} top={HEADER_H} />}
      {view.kind === "logs" && view.searchInput && (
        <LogSearchBar
          term={view.search}
          count={logMatches.length}
          pos={logMatches.length ? view.matchIdx : -1}
          dims={dims}
          top={HEADER_H}
        />
      )}

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
