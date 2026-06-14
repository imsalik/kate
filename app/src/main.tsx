// Entry point: configure the renderer, tame opentui's error handling, and
// mount the app.

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { App } from "./App";

// Stopping a log follow aborts the underlying request; under Bun the kube
// client's abort listener throws an AbortError that can surface through THREE
// different channels — a sync throw, an unhandled rejection, or (because event
// dispatch reports listener errors out-of-band) an uncaught exception. All are
// expected and harmless on teardown, so swallow exactly AbortError on each
// channel and let everything else propagate.
function isAbort(err: any): boolean {
  return err?.name === "AbortError" || err?.code === 20;
}

process.on("unhandledRejection", (err: any) => {
  if (isAbort(err)) return;
  throw err;
});

// openConsoleOnError:false stops opentui from auto-popping its debug console
// overlay on every error — expected AbortErrors from stopping a log follow are
// routed there via console.error and would otherwise flash the overlay on esc.
const renderer = await createCliRenderer({ exitOnCtrlC: false, openConsoleOnError: false });

// opentui installs an uncaughtException handler that pops its debug console on
// ANY error. Stopping a log follow throws an expected AbortError through that
// channel, so wrap opentui's handlers: drop AbortErrors, forward the rest.
{
  const captured = process.listeners("uncaughtException");
  process.removeAllListeners("uncaughtException");
  process.on("uncaughtException", (err: any, origin) => {
    if (isAbort(err)) return;
    for (const h of captured) (h as (...a: any[]) => void)(err, origin);
  });
}

createRoot(renderer).render(<App />);
