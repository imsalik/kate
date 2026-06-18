import { C } from "../theme";

// Parse a GKE context name (`gke_<project>_<location>_<cluster>`) into its
// parts so the header can show clean project / region / cluster fields instead
// of three copies of one long string. Returns null for non-GKE contexts.
function parseGke(name: string): { project: string; location: string; cluster: string } | null {
  const m = name.match(/^gke_([^_]+)_([^_]+)_(.+)$/);
  return m ? { project: m[1]!, location: m[2]!, cluster: m[3]! } : null;
}

function Dot() {
  return <text fg={C.textDim}>{"  ·  "}</text>;
}

// The top info panel: a rounded, bordered bar. Identity on the left (cluster +
// where it lives), live status on the right (resource count, namespace, theme,
// refresh). Read-only — it only reflects state.
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
  refreshSecs: number;
}) {
  // Parse from the cluster reference (what we actually talk to), not the context
  // label — so the cluster/project/region are accurate even if a context is
  // renamed. For standard GKE entries the two strings are identical anyway.
  const gke = parseGke(cluster) ?? parseGke(ctxName);

  const primary = gke ? gke.cluster : ctxName;
  // [value, color] pairs for the secondary line. GKE → project / region; other
  // clusters → cluster / user. A bit of hue makes the bar read at a glance.
  const sub: [string, string][] = gke
    ? [[gke.project, C.ok], [gke.location, C.warn]]
    : [[cluster, C.text], [user, C.textDim]].filter(([s]) => s) as [string, string][];

  return (
    <box
      borderStyle="rounded"
      border
      borderColor={C.border}
      backgroundColor={C.surface}
      paddingX={1}
      flexDirection="row"
      title=" ⎈ kate ▌"
      titleAlignment="left"
    >
      {/* left: identity + namespace */}
      <box flexDirection="column">
        <box flexDirection="row">
          <text fg={C.accent}>{"⎈ "}</text>
          <text fg={C.accentLight}><b>{primary}</b></text>
        </box>
        <box flexDirection="row">
          {sub.map(([s, fg], i) => (
            <box key={i} flexDirection="row">
              {i > 0 && <Dot />}
              <text fg={fg}>{s}</text>
            </box>
          ))}
          <Dot />
          <text fg={C.textDim}>ns </text>
          <text fg={C.accent}><b>{allNs ? "all" : namespace}</b></text>
        </box>
      </box>

      {/* right: live status, pushed to the edge */}
      <box flexGrow={1} />
      <box flexDirection="column" alignItems="flex-end">
        <box flexDirection="row">
          <text fg={C.text}>{kindTitle}</text>
          <text fg={C.accentLight}><b>{`  ${count}`}</b></text>
          {loading && <text fg={C.textDim}>{"  ⋯"}</text>}
          {forwards > 0 && <text fg={C.ok}>{`   ⇄ ${forwards}`}</text>}
        </box>
        <box flexDirection="row">
          <text fg={C.textDim}>{`⟳ ${refreshSecs}s`}</text>
        </box>
      </box>
    </box>
  );
}
