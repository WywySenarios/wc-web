import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/types";

const labels: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  unknown: "Unknown",
};

const variants: Record<
  RunStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "default",
  completed: "secondary",
  failed: "destructive",
  unknown: "outline",
};

const classes: Record<RunStatus, string> = {
  pending: "",
  running: "",
  completed: "border-emerald-500/50 text-emerald-400",
  failed: "",
  unknown: "",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={variants[status]} className={classes[status]}>
      {labels[status]}
    </Badge>
  );
}
