// Entry point: configure the renderer, tame opentui's error handling, and
// mount the app.

import {
  buildKittyKeyboardFlags,
  CliRenderer,
  createCliRenderer,
  resolveRenderLib,
  type CliRendererConfig,
} from "@opentui/core";
import { createRoot } from "@opentui/react";

import { App } from "./App";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";

const ESC = "\x1b";

// Ghostty behind tmux can crash OpenTUI's native startup capability handshake
// when tmux extended-keys/passthrough are enabled. In that narrow environment,
// construct the renderer directly to skip setupTerminal(), then apply only the
// terminal modes kate needs. Direct terminals keep OpenTUI's full setup.
function shouldUseManualTerminalSetup(): boolean {
  if (process.env.KATE_TERMINAL_SETUP === "native") return false;
  if (process.env.KATE_TERMINAL_SETUP === "manual") return true;

  return Boolean(process.env.TMUX) && process.env.TERM === "xterm-ghostty";
}

function enterManualTerminal() {
  process.stdout.write(
    [
      `${ESC}[?1049h`, // alternate screen
      `${ESC}[2J${ESC}[H`, // clear + home
      `${ESC}[?25l`, // hide cursor
      `${ESC}[?1000h`, // mouse button events
      `${ESC}[?1002h`, // mouse drag events
      `${ESC}[?1006h`, // SGR mouse coordinates
      `${ESC}[?2004h`, // bracketed paste
    ].join(""),
  );
}

function leaveManualTerminal() {
  process.stdout.write(
    [
      `${ESC}[?2026l`,
      `${ESC}[?2004l`,
      `${ESC}[?1006l`,
      `${ESC}[?1003l`,
      `${ESC}[?1002l`,
      `${ESC}[?1000l`,
      `${ESC}[?25h`,
      `${ESC}[0 q`,
      `${ESC}[?1049l`,
    ].join(""),
  );
}

async function createCliRendererWithoutSetup(config: CliRendererConfig): Promise<CliRenderer> {
  const stdin = config.stdin || process.stdin;
  const stdout = config.stdout || process.stdout;
  const width = stdout.columns || 80;
  const height = stdout.rows || 24;
  const ziglib = resolveRenderLib();
  const rendererPtr = ziglib.createRenderer(width, height, {
    remote: config.remote ?? false,
    testing: false,
  });

  if (!rendererPtr) {
    throw new Error("Failed to create renderer");
  }

  if (config.useThread === undefined) {
    config.useThread = true;
  }
  if (process.platform === "linux") {
    config.useThread = false;
  }

  ziglib.setUseThread(rendererPtr, config.useThread);
  ziglib.setKittyKeyboardFlags(rendererPtr, buildKittyKeyboardFlags(config.useKittyKeyboard));

  return new CliRenderer(ziglib, rendererPtr, stdin, stdout, width, height, config);
}

// Stopping a log follow aborts the underlying request; under Bun the kube
// client's abort listener throws an AbortError that can surface through THREE
// different channels — a sync throw, an unhandled rejection, or (because event
// dispatch reports listener errors out-of-band) an uncaught exception. All are
// expected and harmless on teardown, so swallow exactly AbortError on each
// channel and let everything else propagate.
function isAbort(err: any): boolean {
  return err?.name === "AbortError" || err?.code === 20;
}

// openConsoleOnError:false stops opentui from auto-popping its debug console
// overlay on every error — expected AbortErrors from stopping a log follow are
// routed there via console.error and would otherwise flash the overlay on esc.
const manualTerminalSetup = shouldUseManualTerminalSetup();
let manualTerminalActive = false;

function restoreManualTerminal() {
  if (!manualTerminalActive) return;
  manualTerminalActive = false;
  leaveManualTerminal();
}

let renderer: Awaited<ReturnType<typeof createCliRenderer>>;
try {
  if (manualTerminalSetup) {
    enterManualTerminal();
    manualTerminalActive = true;
  }

  const rendererConfig: CliRendererConfig = {
    exitOnCtrlC: false,
    openConsoleOnError: false,
    useKittyKeyboard: manualTerminalSetup ? null : undefined,
    onDestroy: restoreManualTerminal,
  };

  renderer = manualTerminalSetup
    ? await createCliRendererWithoutSetup(rendererConfig)
    : await createCliRenderer(rendererConfig);
} catch (err) {
  restoreManualTerminal();
  throw err;
}

// A fatal, unexpected error must NEVER leave the terminal frozen in alt-screen.
// Always restore it via renderer.destroy() (exits the alternate screen, shows
// the cursor) and exit — rather than hanging inside opentui's own handlers.
let exiting = false;
function fatal(err: any) {
  if (exiting) return;
  exiting = true;
  try {
    renderer.destroy();
  } catch {
    /* best effort — we're tearing down anyway */
  }
  console.error("kate: fatal error\n", err?.stack ?? err);
  process.exit(1);
}

process.on("unhandledRejection", (err: any) => {
  if (isAbort(err)) return;
  fatal(err);
});

// opentui installs an uncaughtException handler that pops its debug console on
// ANY error and keeps the process alive — which is exactly what leaves the
// terminal stuck. Replace it: drop expected AbortErrors, restore the terminal
// on anything else.
process.removeAllListeners("uncaughtException");
process.on("uncaughtException", (err: any) => {
  if (isAbort(err)) return;
  fatal(err);
});

// The ErrorBoundary catches render-time errors and shows a quit-able fallback,
// so a UI bug degrades to a message instead of a frozen terminal.
createRoot(renderer).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
