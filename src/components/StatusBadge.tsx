import type { RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<RunStatus, string> = {
  pending: "border-neutral-700 text-neutral-300",
  running: "border-blue-500/50 bg-blue-500/10 text-blue-300",
  completed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/50 bg-red-500/10 text-red-300",
  unknown: "border-neutral-700 text-neutral-500",
};

const labels: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  unknown: "Unknown",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}
