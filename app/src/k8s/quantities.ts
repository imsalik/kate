// Pure helpers for parsing/formatting Kubernetes quantities and mapping
// resource state to semantic colors. No dependency on the API client.

import type { CellColor } from "./types";

// Render a creation timestamp as kubectl's compact AGE column ("5d", "3h").
export function age(ts?: Date | string): string {
  if (!ts) return "<unknown>";
  const t = typeof ts === "string" ? new Date(ts) : ts;
  const sec = (Date.now() - t.getTime()) / 1000;
  if (sec >= 86400 * 2) return `${Math.floor(sec / 86400)}d`;
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec)}s`;
}

// Parse a k8s CPU quantity to millicores. Accepts "123n" (nano), "5u" (micro),
// "250m" (milli) or a bare core count like "2" / "0.5".
export function parseCpu(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(n|u|m)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  switch (m[2]) {
    case "n": return v / 1e6;
    case "u": return v / 1e3;
    case "m": return v;
    default: return v * 1000;
  }
}

// Parse a k8s memory quantity to MiB. Accepts binary (Ki/Mi/Gi/Ti), decimal
// (K/M/G/T) or bare bytes.
export function parseMem(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  const Mi = 1024 * 1024;
  switch (m[2]) {
    case "Ki": return (v * 1024) / Mi;
    case "Mi": return v;
    case "Gi": return v * 1024;
    case "Ti": return v * 1024 * 1024;
    case "K": return (v * 1e3) / Mi;
    case "M": return (v * 1e6) / Mi;
    case "G": return (v * 1e9) / Mi;
    case "T": return (v * 1e12) / Mi;
    default: return v / Mi;
  }
}

// Color a usage value by its fraction of the limit: green < 70%, yellow < 90%,
// red beyond. No limit set → dim (we can't judge how hot it is).
export function usageColor(usage: number, limit: number): CellColor {
  if (!limit) return "dim";
  const pct = usage / limit;
  if (pct >= 0.9) return "err";
  if (pct >= 0.7) return "warn";
  return "ok";
}

// Map a pod phase/container-state string to a semantic color.
export function podStatusColor(status: string): CellColor {
  if (/^(Running|Completed|Succeeded)$/.test(status)) return "ok";
  if (/(CrashLoopBackOff|Error|Failed|ImagePull|ErrImage|OOMKilled|Evicted|Unknown)/.test(status)) return "err";
  if (/(Pending|Creating|Init|Terminating|NotReady|ContainerCreating)/.test(status)) return "warn";
  return undefined;
}
