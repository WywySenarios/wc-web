export type RunStatus =
  "pending" | "running" | "completed" | "failed" | "unknown";

export interface RunMeta {
  id: string;
  createdAt: string;
  status: RunStatus;
  finishedAt?: string;
}

export type HarnessEvent =
  | { type: "session_start"; session_id?: string; model?: string }
  | { type: "assistant_delta"; text: string }
  | { type: "assistant_message"; text: string }
  | { type: "tool_call"; id?: string; name: string; args?: string }
  | {
      type: "tool_result";
      id?: string;
      name: string;
      exit?: number;
      duration_ms?: number;
      output?: string;
      truncated?: boolean;
    }
  | { type: "error"; message: string }
  | { type: "session_end"; ok: boolean }
  | { type: "raw"; text: string };

/** Parse one pod-log line into an event. Non-JSON lines become raw events. */
export function parseLine(line: string): HarnessEvent | null {
  if (line.trim() === "") return null;
  try {
    const value: unknown = JSON.parse(line);
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { type?: unknown }).type === "string"
    ) {
      return value as HarnessEvent;
    }
  } catch {
    // The harness writes diagnostics to stderr. We shouldn't fail because they exist.
    // @TODO remove this bad design.
  }
  return { type: "raw", text: line };
}
