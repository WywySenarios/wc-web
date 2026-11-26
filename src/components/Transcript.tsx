import { useEffect, useMemo, useRef, useState } from "react";

import { isTerminal } from "@/lib/status";
import { buildEntries } from "@/lib/transcript";
import type { HarnessEvent, RunStatus } from "@/lib/types";

export default function Transcript({
  id,
  initialStatus,
}: {
  id: string;
  initialStatus: RunStatus;
}) {
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>(initialStatus);
  const [streamError, setStreamError] = useState<string | null>(null);
  const source = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/sessions/${id}/events`);
    source.current = es;
    let firstOpen = true;

    es.onopen = () => {
      if (firstOpen) {
        firstOpen = false;
        return;
      }
      // A reconnect replays the transcript from the start.
      setEvents([]);
    };

    es.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as HarnessEvent;
        setEvents((current) => [...current, event]);
        if (event.type === "session_end") {
          setStatus(event.ok ? "completed" : "failed");
          es.close();
        }
        if (event.type === "error") setStreamError(event.message);
      } catch (err) {
        console.warn("malformed event frame:", err);
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !isTerminal(status)) {
        setStreamError("Stream closed");
      }
    };

    return () => es.close();
    // initialStatus and status are read only for the error branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const entries = useMemo(() => buildEntries(events), [events]);
  const waiting = entries.length === 0 && !isTerminal(status);

  return (
    <section className="space-y-3">
      {waiting && (
        <p className="text-sm text-neutral-500">Waiting for output…</p>
      )}

      {entries.map((entry) => {
        if (entry.kind === "message") {
          return (
            <div
              key={entry.id}
              className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100"
            >
              {entry.text}
              {entry.streaming && (
                <span className="ml-0.5 animate-pulse">▍</span>
              )}
            </div>
          );
        }
        if (entry.kind === "tool") {
          return (
            <details
              key={entry.id}
              className="rounded-md border border-neutral-800 bg-neutral-900/40"
            >
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono">{entry.name}</span>
                {entry.exit !== undefined && (
                  <span
                    className={
                      entry.exit === 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    exit {entry.exit}
                  </span>
                )}
              </summary>
              <div className="space-y-2 border-t border-neutral-800 px-3 py-2">
                {entry.args && (
                  <pre className="overflow-x-auto text-xs text-neutral-400">
                    {entry.args}
                  </pre>
                )}
                {entry.output && (
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-300">
                    {entry.output}
                    {entry.truncated ? "\n[truncated]" : ""}
                  </pre>
                )}
              </div>
            </details>
          );
        }
        if (entry.kind === "error") {
          return (
            <p
              key={entry.id}
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {entry.text}
            </p>
          );
        }
        return (
          <pre
            key={entry.id}
            className="overflow-x-auto text-xs text-neutral-600"
          >
            {entry.text}
          </pre>
        );
      })}

      {streamError && !isTerminal(status) && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {streamError}
        </p>
      )}
    </section>
  );
}
