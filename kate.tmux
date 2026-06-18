#!/usr/bin/env bash
# tmux plugin entrypoint for kate.
# Sourced once at tmux startup (by TPM, or directly via run-shell).

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$CURRENT_DIR/bin/kate"

# User-tunable options (set in .tmux.conf):
#   set -g @kate-key "k"             # default key (prefix + k)
#   set -g @kate-no-prefix "off"     # set "on" to bind without prefix
#   set -g @kate-popup-width "95%"
#   set -g @kate-popup-height "90%"
#   set -g @kate-theme "mustard"     # mustard | dracula | gruvbox | nord | catppuccin | mono
#                                    # (in-app `:config` / `:theme` overrides this and persists)
get_opt() {
  local val
  val=$(tmux show-option -gqv "$1")
  echo "${val:-$2}"
}

key=$(get_opt "@kate-key" "k")
no_prefix=$(get_opt "@kate-no-prefix" "off")
width=$(get_opt "@kate-popup-width" "95%")
height=$(get_opt "@kate-popup-height" "90%")

popup_cmd="display-popup -E -w '$width' -h '$height' -T ' kate ' '$LAUNCHER'"

if [[ "$no_prefix" == "on" ]]; then
  tmux bind-key -n "$key" "$popup_cmd"
else
  tmux bind-key "$key" "$popup_cmd"
fi
