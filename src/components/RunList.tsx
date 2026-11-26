import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { isActive } from "@/lib/status";
import type { RunMeta } from "@/lib/types";

export default function RunList({ initial }: { initial: RunMeta[] }) {
  const [runs, setRuns] = useState<RunMeta[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = busy || runs.some((run) => isActive(run.status));

  useEffect(() => {
    if (!runs.some((run) => isActive(run.status))) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/sessions", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { runs: RunMeta[] };
        setRuns(data.runs);
      } catch (err) {
        console.warn("poll sessions:", err);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [runs]);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sessions", { method: "POST" });
      const data = (await response.json().catch((err) => {
        console.warn("parse sessions response:", err);
        return {};
      })) as {
        id?: string;
        error?: string;
      };
      if (response.status === 202 && data.id) {
        window.location.assign(`/sessions/${data.id}`);
        return;
      }
      setError(
        response.status === 409
          ? "A run is already active."
          : (data.error ?? `Request failed (${response.status})`),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runs</CardTitle>
        <CardDescription>
          {inFlight ? "One run is active." : "No active run."}
        </CardDescription>
        <CardAction>
          <Button onClick={start} disabled={inFlight} size="lg">
            {busy ? <Spinner /> : <Play />}
            Run
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {runs.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Play />
              </EmptyMedia>
              <EmptyTitle>No runs yet.</EmptyTitle>
              <EmptyDescription>
                Start a run to see its output here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.id}>
                <a
                  href={`/sessions/${run.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{run.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={run.status} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
