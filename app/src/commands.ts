// The command registry + matcher behind the `:` palette.
//
// Pure data + ranking: this module knows nothing about how a command runs. It
// turns the text the user is typing into a ranked list of candidates (with the
// text Tab would complete to); App interprets the chosen command's `name`/`arg`
// and performs the (always read-only) action.
//
// k9s-style: every command is `verb [arg]`. A verb is a resource kind (pods,
// deploy, svc, …) or an action (ctx, ns, theme, config, …). Verbs that take an
// arg complete it live against real data — context names, namespace names, or
// the theme registry — and run directly when given (`:ctx foo`, `:ns kube-system`).

import { KINDS, dynamicKinds } from "./k8s";
import { THEME_NAMES } from "./ui/theme";
import { fuzzyScore } from "./lib/fuzzy";

// What kind of argument a verb accepts after a space, if any.
//   "theme"     → completes against the theme registry (static)
//   "context"   → completes against kubeconfig context names (dynamic)
//   "namespace" → completes against namespace names (dynamic)
//   undefined   → no argument
export type ArgKind = "theme" | "context" | "namespace" | undefined;

export interface Command {
  name: string; // canonical id App switches on
  aliases: string[]; // extra strings that match this command
  title: string; // what shows in the palette
  hint: string; // one-line description (the compact right column)
  detail?: string; // fuller description for the selected-item line (untruncated)
  arg?: ArgKind;
  crd?: boolean; // a discovered custom resource — the palette tags these
}

// Live data the matcher needs to complete dynamic args. App supplies whatever it
// has loaded; missing lists just fall back to free-text (still runnable).
export interface CommandContext {
  contexts?: string[];
  namespaces?: string[];
}

// Non-resource commands. Resource kinds are appended from the KINDS registry.
const VERBS: Command[] = [
  { name: "contexts", aliases: ["ctx", "context"], title: "context", hint: "switch cluster / context (arg or list)", arg: "context" },
  { name: "namespace", aliases: ["ns"], title: "namespace", hint: "switch namespace (arg or picker)", arg: "namespace" },
  { name: "forwards", aliases: ["pf", "portforward", "portforwards"], title: "port-forwards", hint: "list / stop active forwards" },
  { name: "theme", aliases: ["themes"], title: "theme", hint: "change theme (live)", arg: "theme" },
  { name: "config", aliases: ["cfg", "settings", "set"], title: "config", hint: "settings (theme, …)" },
  { name: "all", aliases: ["all-ns", "allns"], title: "all-namespaces", hint: "toggle all-namespaces" },
  { name: "help", aliases: ["?"], title: "help", hint: "keybindings" },
  { name: "quit", aliases: ["q", "exit"], title: "quit", hint: "exit kate" },
];

// Short aliases for the busier resource kinds (k9s muscle memory).
const KIND_ALIASES: Record<string, string[]> = {
  pods: ["po"],
  deployments: ["deploy", "dep"],
  replicasets: ["rs"],
  statefulsets: ["sts"],
  daemonsets: ["ds"],
  jobs: ["job"],
  cronjobs: ["cj"],
  services: ["svc"],
  ingresses: ["ing"],
  configmaps: ["cm"],
  secrets: ["sec"],
  serviceaccounts: ["sa"],
  rolebindings: ["rb"],
};

const VERB_NAMES = new Set(VERBS.map((v) => v.name));

// The command list is rebuilt from the live registry on each call so discovered
// CRDs appear in the palette the moment discovery finishes. It's a small array
// and matching is only on keystrokes, so rebuilding is cheap.
//
// Order = kate-native first (built-in kinds, then verbs), CRDs grouped at the
// bottom — never interleaved. rankCommands preserves that native-before-CRD
// grouping when filtering by a query.
function buildCommands(): Command[] {
  const toCmd = (k: { id: string; title: string; group: string; aliases?: string[] }, crd: boolean): Command => ({
    name: k.id,
    aliases: k.aliases ?? KIND_ALIASES[k.id] ?? [],
    title: k.title.toLowerCase(),
    // Just the group — it categorizes built-ins (Workloads, Cluster, …) and
    // distinguishes CRDs by their API group (cert-manager.io, …). The old
    // "· view <Title>" was redundant with the label and forced line wraps.
    hint: k.group,
    // Full description for the selected-item line — the Kind (untruncated,
    // original case) plus its group. For CRDs this is the readable name the
    // compact label can't fully show (e.g. "AccessContextManagerAccessLevel").
    detail: `${k.title} · ${k.group}`,
    crd,
  });
  // Built-in kinds, except any whose id is already a richer verb (e.g.
  // "contexts" is the ctx verb with an arg, not a plain list jump).
  const builtin = KINDS.filter((k) => !VERB_NAMES.has(k.id)).map((k) => toCmd(k, false));
  const crds = dynamicKinds().map((k) => toCmd(k, true));
  return [...builtin, ...VERBS, ...crds];
}

// Static built-in commands, handy for callers that don't need CRDs (and back-
// compat for anything importing the old constant).
export const COMMANDS: Command[] = buildCommands();

function commandByHead(commands: Command[], head: string): Command | undefined {
  const h = head.toLowerCase();
  const exact = commands.find((c) => c.name === h || c.aliases.includes(h));
  if (exact) return exact;
  return rankCommands(commands, head)[0]?.command;
}

export interface Candidate {
  command: Command;
  arg?: string; // resolved argument (for arg candidates)
  complete: string; // full text Tab fills / Enter runs
  label: string; // left column
  hint: string; // right column
}

function rankCommands(commands: Command[], query: string): { command: Command; score: number }[] {
  const q = query.toLowerCase();
  return commands.map((c) => {
    const keys = [c.name, c.title, ...c.aliases];
    let score = Math.max(...keys.map((k) => fuzzyScore(query, k) ?? -Infinity));
    // Exact and prefix matches must beat a longer fuzzy match: typing "config"
    // should land on the `config` verb, not "configmaps"; "po" → pods, not just
    // any p…o. An exact name/alias hit wins outright.
    const exact = keys.some((k) => k.toLowerCase() === q);
    if (exact) score += 10_000;
    else if (keys.some((k) => k.toLowerCase().startsWith(q))) score += 1_000;
    return { command: c, score, exact };
  })
    .filter((x) => x.score > -Infinity)
    // Group kate-native commands above CRDs (CRDs sink to the bottom), but let an
    // exact match float to the very top so typing a CRD's full name still lands
    // it. Within a tier, higher fuzzy score wins.
    .sort((a, b) => {
      const tier = (x: { command: Command; exact: boolean }) =>
        x.exact ? 0 : x.command.crd ? 2 : 1;
      return tier(a) - tier(b) || b.score - a.score;
    });
}

// The completion list for a verb's arg, or null if it's free-text.
function argOptions(arg: ArgKind, ctx: CommandContext): string[] | null {
  if (arg === "theme") return THEME_NAMES;
  if (arg === "context") return ctx.contexts ?? null;
  if (arg === "namespace") return ctx.namespaces ?? null;
  return null;
}

// Turn the current palette input into ranked candidates.
export function matchCommands(input: string, ctx: CommandContext = {}): Candidate[] {
  const commands = buildCommands();
  const trimmed = input.replace(/^\s+/, "");
  const spaceIdx = trimmed.indexOf(" ");

  // --- argument phase: "verb <arg>" ---
  if (spaceIdx !== -1) {
    const head = trimmed.slice(0, spaceIdx);
    const arg = trimmed.slice(spaceIdx + 1).trimStart();
    const cmd = commandByHead(commands, head);
    if (cmd?.arg) {
      const opts = argOptions(cmd.arg, ctx);
      if (opts) {
        const ranked = opts
          .map((v) => ({ v, score: arg ? fuzzyScore(arg, v) ?? -Infinity : 0 }))
          .filter((x) => x.score > -Infinity)
          .sort((a, b) => b.score - a.score)
          .slice(0, 50);
        const out: Candidate[] = ranked.map(({ v }) => ({
          command: cmd,
          arg: v,
          complete: `${cmd.name} ${v}`,
          label: `${cmd.title} ${v}`,
          hint: `apply ${cmd.arg}`,
        }));
        // If the typed arg isn't (yet) one of the options, still let them run it
        // verbatim — names can be valid before our cached list catches up.
        if (arg && !opts.some((o) => o.toLowerCase() === arg.toLowerCase())) {
          out.unshift({ command: cmd, arg, complete: `${cmd.name} ${arg}`, label: `${cmd.title} ${arg}`, hint: `apply ${cmd.arg} (verbatim)` });
        }
        return out;
      }
      // Free-text arg (no list available).
      return [{ command: cmd, arg, complete: `${cmd.name} ${arg}`, label: `${cmd.title} ${arg || "…"}`, hint: arg ? `apply ${cmd.arg}` : "open picker" }];
    }
    // Verb takes no arg — rank on the head alone.
    return rankCommands(commands, head || trimmed).map(toCommandCandidate);
  }

  // --- verb phase ---
  if (!trimmed) return commands.map((c) => toCommandCandidate({ command: c, score: 0 }));
  return rankCommands(commands, trimmed).map(toCommandCandidate);
}

function toCommandCandidate({ command }: { command: Command; score: number }): Candidate {
  return {
    command,
    complete: command.arg ? `${command.name} ` : command.name,
    label: command.title,
    hint: command.hint,
  };
}
