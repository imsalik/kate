// Print every kubeconfig cluster's CA as a concatenated PEM bundle to stdout.
//
// Used by bin/kate to populate NODE_EXTRA_CA_CERTS, so TLS verification stays
// ON against each cluster's own CA — the same thing client-go (k9s/kubectl)
// does automatically. Bun's fetch ignores client-node's per-request CA, but it
// does respect NODE_EXTRA_CA_CERTS, so we feed the CAs in that way instead of
// disabling verification globally.
//
// We emit *all* clusters, not just the current one: kate switches contexts live
// (Contexts view → Enter), and every target cluster has its own CA. Trusting
// only the launch context's CA is why switching to any other cluster used to
// fail TLS and silently show stale data. Exits non-zero if no CA is found.

import { KubeConfig } from "@kubernetes/client-node";
import { readFileSync } from "node:fs";

const kc = new KubeConfig();
kc.loadFromDefault();

const pems: string[] = [];
for (const cluster of kc.getClusters()) {
  try {
    let pem = "";
    if (cluster.caData) pem = Buffer.from(cluster.caData, "base64").toString("utf8");
    else if (cluster.caFile) pem = readFileSync(cluster.caFile, "utf8");
    if (pem.includes("BEGIN CERTIFICATE")) pems.push(pem.trim());
  } catch {
    // A single unreadable caFile shouldn't sink the whole bundle.
  }
}

if (pems.length === 0) process.exit(1);
// Dedupe identical CAs (clusters often share one) to keep the bundle small.
const unique = [...new Set(pems)];
process.stdout.write(unique.join("\n") + "\n");
