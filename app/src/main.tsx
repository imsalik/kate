// Entry point: configure the renderer, tame opentui's error handling, and
// mount the app.

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { App } from "./App";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";

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
const renderer = await createCliRenderer({ exitOnCtrlC: false, openConsoleOnError: false });

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
