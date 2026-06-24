import type { View } from "../../types";
import { C } from "../theme";
import { fit } from "../format";

// A centered confirmation modal for destructive actions (e.g. deleting a pod).
// Cancel is the safe default (highlighted when view.confirm is false); the
// destructive button is highlighted when view.confirm is true. Keyboard
// handling lives in App; this is presentation only.
export function ConfirmModal({
  view,
  dims,
}: {
  view: Extract<View, { kind: "confirm" }>;
  dims: { width: number; height: number };
}) {
  const W = 56;
  const H = 9;
  const left = Math.max(0, Math.floor((dims.width - W) / 2));
  const top = Math.max(0, Math.floor((dims.height - H) / 2));

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={W}
      height={H}
      border
      borderColor={C.danger}
      backgroundColor={C.bg}
      title="Confirm"
      titleAlignment="center"
      flexDirection="column"
      padding={1}
    >
      <text fg={C.text}>{fit(`${view.verb} ${view.target}?`, W - 4)}</text>
      <text fg={C.textDim}>This cannot be undone.</text>
      <text> </text>
      <text> </text>

      {/* Cancel (safe, left) / Delete (destructive, right) buttons */}
      <box flexDirection="row" justifyContent="center" gap={4}>
        <text fg={view.confirm === false ? C.bg : C.text} bg={view.confirm === false ? C.accent : undefined}>
          {" Cancel "}
        </text>
        <text fg={view.confirm === true ? C.bg : C.danger} bg={view.confirm === true ? C.danger : undefined}>
          {`  ${view.verb}  `}
        </text>
      </box>
    </box>
  );
}
