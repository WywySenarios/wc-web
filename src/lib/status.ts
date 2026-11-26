import type { RunStatus } from "@/lib/types";

export function isActive(status: RunStatus): boolean {
  return status === "pending" || status === "running";
}

export function isTerminal(status: RunStatus): boolean {
  return !isActive(status);
}
