import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {entries.map((entry) => {
        if (entry.kind === "message") {
          return (
            <div
              key={entry.id}
              className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
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
            <Card key={entry.id} className="gap-0 py-0">
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="group h-auto w-full justify-start gap-2 rounded-none px-4 py-3"
                  >
                    <span className="font-mono">{entry.name}</span>
                    {entry.exit !== undefined && (
                      <Badge
                        variant={entry.exit === 0 ? "secondary" : "destructive"}
                      >
                        exit {entry.exit}
                      </Badge>
                    )}
                    <ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Separator />
                  <div className="space-y-2 px-4 py-3">
                    {entry.args && (
                      <pre className="overflow-x-auto text-xs text-muted-foreground">
                        {entry.args}
                      </pre>
                    )}
                    {entry.output && (
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                        {entry.output}
                        {entry.truncated ? "\n[truncated]" : ""}
                      </pre>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        }
        if (entry.kind === "error") {
          return (
            <Alert key={entry.id} variant="destructive">
              <AlertDescription>{entry.text}</AlertDescription>
            </Alert>
          );
        }
        return (
          <pre
            key={entry.id}
            className="overflow-x-auto text-xs text-muted-foreground/60"
          >
            {entry.text}
          </pre>
        );
      })}

      {streamError && !isTerminal(status) && (
        <Alert variant="destructive">
          <AlertDescription>{streamError}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
