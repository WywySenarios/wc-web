import { Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
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
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Runs</h2>
          <p className="text-sm text-neutral-400">
            {inFlight ? "One run is active." : "No active run."}
          </p>
        </div>
        <Button onClick={start} disabled={inFlight} size="lg">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          Run
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {runs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
          No runs yet.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
          {runs.map((run) => (
            <li key={run.id}>
              <a
                href={`/sessions/${run.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{run.id}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
