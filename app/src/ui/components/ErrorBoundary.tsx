import { Component, type ReactNode } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";

import { C } from "../theme";

// Fallback shown when a render throws. The key point: it keeps the terminal in
// a controlled state (no frozen alt-screen) and lets the user quit cleanly,
// instead of a crash leaving the terminal unusable.
function ErrorScreen({ error }: { error: unknown }) {
  const renderer = useRenderer();
  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) renderer.destroy();
  });
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "").split("\n").slice(1, 8) : [];
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={C.bg} padding={2}>
      <text fg={C.danger}><b>✗ kate hit an unexpected error</b></text>
      <box height={1} />
      <text fg={C.text}>{msg}</text>
      <box height={1} />
      {stack.map((l, i) => (
        <text key={i} fg={C.textDim}>{l}</text>
      ))}
      <box height={1} />
      <text fg={C.accentLight}>press q or ctrl-c to quit</text>
    </box>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error != null) return <ErrorScreen error={this.state.error} />;
    return this.props.children;
  }
}
