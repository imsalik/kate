import { C } from "../theme";
import { fit } from "../format";

// Parse a GKE context name (`gke_<project>_<location>_<cluster>`) into its
// parts so the header can show clean project / region / cluster fields instead
// of three copies of one long string. Returns null for non-GKE contexts.
function parseGke(name: string): { project: string; location: string; cluster: string } | null {
  const m = name.match(/^gke_([^_]+)_([^_]+)_(.+)$/);
  return m ? { project: m[1]!, location: m[2]!, cluster: m[3]! } : null;
}

const LABEL_W = 10;
function Field({ label, value, valueFg }: { label: string; value: string; valueFg?: string }) {
  return (
    <box flexDirection="row">
      <text fg={C.textDim}>{fit(label, LABEL_W)}</text>
      <text fg={valueFg ?? C.text}>{value}</text>
    </box>
  );
}

// The top info panel. Multi-line and aligned (k9s-style): identity on the left,
// live status on the right. Read-only — it only reflects state.
export function Header({
  ctxName,
  cluster,
  user,
  namespace,
  allNs,
  kindTitle,
  count,
  loading,
  forwards,
  theme,
  refreshSecs,
}: {
  ctxName: string;
  cluster: string;
  user: string;
  namespace: string;
  allNs: boolean;
  kindTitle: string;
  count: number;
  loading: boolean;
  forwards: number;
  theme: string;
  refreshSecs: number;
}) {
  // Parse from the cluster reference (what we actually talk to), not the context
  // label — so the cluster/project/region are accurate even if a context is
  // renamed. For standard GKE entries the two strings are identical anyway.
  const gke = parseGke(cluster) ?? parseGke(ctxName);

  return (
    <box flexDirection="row" backgroundColor={C.surface} paddingX={1} gap={3}>
      {/* left column: identity */}
      <box flexDirection="column">
        <box flexDirection="row">
          <text fg={C.accentLight}>kate</text>
          <text fg={C.textDim}> · kubernetes</text>
        </box>
        <Field label="context" value={ctxName} />
        {gke ? (
          <Field label="cluster" value={gke.cluster} />
        ) : (
          <Field label="cluster" value={cluster} />
        )}
      </box>

      {/* middle column: location / scope */}
      <box flexDirection="column">
        <text fg={C.textDim}>{fit("", 1)}</text>
        {gke ? <Field label="project" value={gke.project} /> : <Field label="user" value={user} />}
        {gke ? <Field label="region" value={gke.location} /> : <box />}
      </box>

      {/* right column: live status, pushed to the edge */}
      <box flexGrow={1} />
      <box flexDirection="column" alignItems="flex-end">
        <box flexDirection="row">
          <text fg={C.textDim}>{`⟳ ${refreshSecs}s · `}</text>
          <text fg={C.accent}>{`◆ ${theme}`}</text>
        </box>
        <box flexDirection="row">
          <text fg={C.textDim}>ns </text>
          <text fg={C.accent}>{allNs ? "<all>" : namespace}</text>
        </box>
        <box flexDirection="row">
          <text fg={C.text}>{kindTitle} </text>
          <text fg={C.accent}>{`[${count}]`}</text>
          {loading && <text fg={C.textDim}> …</text>}
          {forwards > 0 && <text fg={C.ok}>{`  ⇄ ${forwards}`}</text>}
        </box>
      </box>
    </box>
  );
}
