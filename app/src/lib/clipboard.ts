import { spawnSync } from "node:child_process";

// Copy text to the system clipboard. Prefers a native clipboard helper (the
// most reliable path on a local desktop), and falls back to an OSC 52 escape
// sequence for remote/SSH sessions on terminals that honor it.
//
// OSC 52 alone is unreliable here: tmux + many terminals don't forward it to
// the OS clipboard, so a copy would silently do nothing. Shelling out to the
// platform tool avoids that.

function trySpawn(cmd: string, args: string[], input: string): boolean {
  try {
    const r = spawnSync(cmd, args, {
      input,
      stdio: ["pipe", "ignore", "ignore"],
      timeout: 1500,
    });
    return r.status === 0 || (r.status == null && !r.error);
  } catch {
    return false;
  }
}

// OSC 52 — base64 the text into the clipboard write sequence. Works over SSH on
// capable terminals; used when no native helper is available.
export function copyOSC52(text: string): boolean {
  try {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    process.stdout.write(`\x1b]52;c;${b64}\x07`);
    return true;
  } catch {
    return false;
  }
}

export function copyToClipboard(text: string): boolean {
  if (!text) return false;
  // macOS
  if (process.platform === "darwin" && trySpawn("pbcopy", [], text)) return true;
  // Wayland
  if (process.env.WAYLAND_DISPLAY && trySpawn("wl-copy", [], text)) return true;
  // X11
  if (process.env.DISPLAY) {
    if (trySpawn("xclip", ["-selection", "clipboard"], text)) return true;
    if (trySpawn("xsel", ["--clipboard", "--input"], text)) return true;
  }
  // WSL / Windows
  if (trySpawn("clip.exe", [], text)) return true;
  // Last resort: OSC 52 (e.g. SSH into a capable terminal).
  return copyOSC52(text);
}
