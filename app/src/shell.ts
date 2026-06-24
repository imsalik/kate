// Interactive pod shell: hand the real terminal from the TUI to a kube exec
// session, then take it back. The hard part isn't the exec — @kubernetes/client
// streams it over a websocket — it's the terminal hand-off. OpenTUI owns stdin
// (raw mode) and the alternate screen; we suspend it, drive a raw exec session,
// and resume it on exit.

import type { CliRenderer } from "@opentui/core";
import { PassThrough } from "node:stream";
import type { Client } from "./k8s/client";

const ESC = "\x1b";

export type ShellResult = { ok: boolean; message?: string };

// Run a blocking interactive shell into pod/container. Resolves when the remote
// process exits (or the connection fails), after the TUI has been restored.
export async function runPodShell(
  renderer: CliRenderer,
  client: Client,
  target: { namespace: string; pod: string; container: string },
): Promise<ShellResult> {
  const { namespace, pod, container } = target;

  // renderer.suspend() pauses rendering, drops OpenTUI's stdin listener, turns
  // raw mode off and pauses stdin. We then re-claim the terminal for the shell.
  renderer.suspend();
  process.stdout.write(`${ESC}[2J${ESC}[H`); // clear kate's frame
  process.stdout.write(
    `\x1b[1mkate\x1b[0m → ${namespace}/${pod} [${container}] · type \x1b[1mexit\x1b[0m or Ctrl-D to return\r\n\r\n`,
  );

  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();

  // The exec handler attaches a persistent `data` listener to whatever stdin we
  // pass and never removes it — so we feed it a PassThrough we own and forward
  // process.stdin into it ourselves. On teardown we detach cleanly, leaving
  // process.stdin's listener list exactly as OpenTUI expects on resume.
  const inProxy = new PassThrough();
  const forward = (chunk: Buffer) => inProxy.write(chunk);
  process.stdin.on("data", forward);

  // The handler also adds a `resize` listener to stdout (for TTY size updates)
  // that it never removes; snapshot the current ones so we can strip the new one.
  const resizeBefore = new Set(process.stdout.listeners("resize"));

  return await new Promise<ShellResult>((resolve) => {
    let settled = false;
    let status: { status?: string; message?: string } | undefined;

    const finish = (result: ShellResult) => {
      if (settled) return;
      settled = true;
      process.stdin.removeListener("data", forward);
      for (const l of process.stdout.listeners("resize")) {
        if (!resizeBefore.has(l)) process.stdout.removeListener("resize", l as () => void);
      }
      inProxy.end();
      process.stdout.write(`${ESC}[2J${ESC}[H`);
      renderer.resume(); // re-enable raw mode, re-add OpenTUI's stdin listener, repaint
      resolve(result);
    };

    client
      .shellExec(namespace, pod, container, inProxy, process.stdout, process.stderr, (s) => {
        status = s;
      })
      .then((ws) => {
        ws.on("close", () =>
          finish({ ok: status?.status !== "Failure", message: status?.message }),
        );
        ws.on("error", (err: any) => finish({ ok: false, message: err?.message ?? String(err) }));
      })
      .catch((err: any) => finish({ ok: false, message: err?.message ?? String(err) }));
  });
}
