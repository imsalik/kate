// Bridge the data layer's semantic cell colors to the active theme's hex.

import type { CellColor } from "../k8s";
import { C } from "./theme";

// Map a semantic cell color to a theme hex. undefined → no override.
export function cellColor(c: CellColor): string | undefined {
  switch (c) {
    case "ok": return C.ok;
    case "warn": return C.warn;
    case "err": return C.danger;
    case "info": return C.accent;
    case "dim": return C.textDim;
    default: return undefined;
  }
}
