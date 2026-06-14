// Print the current kubeconfig context's cluster CA as PEM to stdout.
//
// Used by bin/kate to populate NODE_EXTRA_CA_CERTS, so TLS verification stays
// ON against the cluster's own CA — the same thing client-go (k9s/kubectl) does
// automatically. Bun's fetch ignores client-node's per-request CA, but it does
// respect NODE_EXTRA_CA_CERTS, so we feed the CA in that way instead of
// disabling verification globally. Exits non-zero if no CA is available.

import { KubeConfig } from "@kubernetes/client-node";
import { readFileSync } from "node:fs";

const kc = new KubeConfig();
kc.loadFromDefault();

const cluster = kc.getCurrentCluster();
if (!cluster) process.exit(1);

let pem = "";
if (cluster.caData) pem = Buffer.from(cluster.caData, "base64").toString("utf8");
else if (cluster.caFile) pem = readFileSync(cluster.caFile, "utf8");

if (!pem.includes("BEGIN CERTIFICATE")) process.exit(1);
process.stdout.write(pem);
