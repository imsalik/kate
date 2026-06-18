// Public surface of the data layer. The UI imports everything kube-related
// from here so the internal module split can change without touching callers.

export { Client } from "./client";
export { KINDS, kindById, canDescribe, canPortForward, canViewLogs } from "./kinds";
export type {
  Table,
  Row,
  CellColor,
  ContainerInfo,
  ContextInfo,
  PortEntry,
  PortForwardEntry,
  Kind,
} from "./types";
