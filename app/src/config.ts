// Persistent user config + remembered state, stored as JSON.
//
// kate remembers what you were doing (last context, the namespace you were in
// per context, your theme) so a relaunch drops you back where you left off —
// k9s-style. Reads/writes are synchronous: the file is tiny and only touched on
// startup and on a few discrete user actions (switch context/namespace/theme).
//
// Location — a single XDG dir, ghostty-style, so everything kate lives together:
//   $KATE_CONFIG                      explicit override (full path to a .json)
//   $XDG_CONFIG_HOME/kate/config.json (default: ~/.config/kate/config.json)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface KateConfig {
  // The remembered theme name (themes registry key). In-app theme changes
  // write here so the choice sticks across launches.
  theme?: string;
  // The context kate was last using — restored on startup when it still exists.
  lastContext?: string;
  // Namespace last selected per context name, so each cluster reopens where you
  // left it instead of snapping back to "default".
  namespaceByContext?: Record<string, string>;
}

function resolvePath(): string {
  if (process.env.KATE_CONFIG) return process.env.KATE_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "kate", "config.json");
}

// The XDG config directory — all kate state (config + anything future) lives
// under here, like ghostty's ~/.config/ghostty.
export const CONFIG_DIR = dirname(resolvePath());
export const CONFIG_PATH = resolvePath();

let cache: KateConfig | null = null;

export function loadConfig(): KateConfig {
  if (cache) return cache;
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw);
      cache = parsed && typeof parsed === "object" ? parsed : {};
    } else {
      cache = {};
    }
  } catch {
    // A corrupt config shouldn't stop kate from starting — start fresh.
    cache = {};
  }
  return cache!;
}

// Merge a partial update into the config and persist it. Best-effort: a write
// failure (read-only fs, etc.) is swallowed so it never crashes the UI.
export function saveConfig(patch: Partial<KateConfig>): void {
  const next = { ...loadConfig(), ...patch };
  cache = next;
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort persistence */
  }
}

// Record the namespace chosen for a given context (merging into the map).
export function rememberNamespace(context: string, namespace: string): void {
  const cfg = loadConfig();
  const map = { ...(cfg.namespaceByContext ?? {}), [context]: namespace };
  saveConfig({ namespaceByContext: map });
}
