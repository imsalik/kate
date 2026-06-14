# kate

A [k9s](https://k9scli.io/)-inspired Kubernetes TUI, built on [OpenTUI](https://github.com/anomalyco/opentui) (TypeScript + React, running on [Bun](https://bun.sh)).

kate talks to your cluster **directly** through `@kubernetes/client-node` — no `kubectl` or `helm` shell-outs. It's a read-only browser with live log following, describe, and port-forwarding, with vim-style navigation throughout.

![kate browsing pods with live CPU/MEM](docs/pods-view.png)

## Features

- **Resource browser** — Pods, Deployments, ReplicaSets, StatefulSets, DaemonSets, Jobs, CronJobs, Services, Ingresses, ConfigMaps, Secrets, HPA, ServiceAccounts, Roles, RoleBindings, and Helm releases, grouped in a sidebar.
- **Live CPU / MEM** for pods (via the metrics API), with `%CPU`/`%MEM` against limits/requests, color-coded green → yellow → red.
- **Live log following** with container picker for multi-container pods, JSON syntax highlighting, log-level coloring, and a `w` wrap toggle.
- **Describe** (`d`) — the live object as YAML, with `managedFields` and other server noise stripped, lightly syntax-colored.
- **Port-forward** (`f`) — a centered dialog to pick `container::port`, edit the local port, and confirm. Forwarded pods are marked in the list; `shift-f` lists/stops active forwards.
- **Context switching** as a full Contexts view, drilling into namespaces → pods.
- **Consistent `/` fuzzy filter** everywhere, and a `:` command palette to jump to any resource (`:deploy`, `:ctx`, `:sa`, `:pf`).
- **Themes** — mustard (default), dracula, gruvbox, catppuccin, nord, mono.

## Requirements

- [Bun](https://bun.sh)
- A working `kubeconfig` (kate uses your current context; switch contexts in-app)

## Install & run

```bash
cd app
bun install
```

Then launch with the wrapper script (recommended — it kills any stale instance and sets up TLS for private CAs like GKE):

```bash
./bin/kate
```

Or directly:

```bash
cd app && bun run start
```

> **Note on TLS:** Bun's `fetch` ignores the per-cluster CA that `client-node` reads from kubeconfig, so verification fails against private CAs (e.g. GKE) out of the box. Rather than disable TLS verification globally, `bin/kate` does what `client-go` (k9s/kubectl) does: it extracts the current context's cluster CA and trusts *that* via `NODE_EXTRA_CA_CERTS` — so verification stays **on**. If no CA can be extracted it falls back to disabling verification with a warning. Set `KATE_INSECURE_TLS=1` to force the old blanket-disable behavior.

## Keybindings

| Key | Action |
|-----|--------|
| `j` / `k` | move down / up |
| `g` / `G` | top / bottom (logs: top / live tail) |
| `ctrl-d` / `ctrl-u` | half-page down / up |
| `h` / `l`, `tab` | focus sidebar / table / toggle |
| `enter` / `l` | pods → logs · contexts → switch · else focus |
| `d` | describe (YAML) |
| `f` | port-forward (pick a port if several) |
| `shift-f` | list / stop active port-forwards (also `:pf`) |
| `w` | toggle line wrap (in logs) |
| `:` `<name>` | jump to a resource (e.g. `:deploy`, `:ctx`) |
| `/` `<text>` | fuzzy filter |
| `a` | toggle all-namespaces |
| `n` | switch namespace (type to filter) |
| `r` | refresh now (auto every 5s) |
| `esc` | back one step |
| `q` | quit (from the table) |

## Themes

Pick a theme via env var or, if you run inside tmux, a tmux option (which takes priority):

```bash
KATE_THEME=catppuccin ./bin/kate
# or
tmux set-option -g @kate-theme nord
```

Resolution order: `@kate-theme` (tmux) → `KATE_THEME` (env) → `mustard`.

## Status

Personal learning project. Read-only for now.
