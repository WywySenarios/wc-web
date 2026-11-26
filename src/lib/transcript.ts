import type { HarnessEvent } from "@/lib/types";

export interface MessageEntry {
  kind: "message";
  id: string;
  text: string;
  streaming: boolean;
}

export interface ToolEntry {
  kind: "tool";
  id: string;
  name: string;
  args?: string;
  output?: string;
  exit?: number;
  truncated?: boolean;
}

export interface RawEntry {
  kind: "raw";
  id: string;
  text: string;
}

export interface ErrorEntry {
  kind: "error";
  id: string;
  text: string;
}

export type Entry = MessageEntry | ToolEntry | RawEntry | ErrorEntry;

/** Fold the event stream into renderable blocks. */
export function buildEntries(events: HarnessEvent[]): Entry[] {
  const entries: Entry[] = [];
  let current: MessageEntry | null = null;

  for (const event of events) {
    switch (event.type) {
      case "assistant_delta": {
        if (!current) {
          current = {
            kind: "message",
            id: `m${entries.length}`,
            text: "",
            streaming: true,
          };
          entries.push(current);
        }
        current.text += event.text;
        break;
      }
      case "assistant_message": {
        if (!current) {
          current = {
            kind: "message",
            id: `m${entries.length}`,
            text: "",
            streaming: false,
          };
          entries.push(current);
        }
        current.text = event.text;
        current.streaming = false;
        current = null;
        break;
      }
      case "tool_call": {
        entries.push({
          kind: "tool",
          id: event.id ?? `t${entries.length}`,
          name: event.name,
          args: event.args,
        });
        current = null;
        break;
      }
      case "tool_result": {
        const id = event.id ?? `t${entries.length}`;
        const tool = [...entries]
          .reverse()
          .find(
            (entry): entry is ToolEntry =>
              entry.kind === "tool" && entry.id === id,
          );
        if (tool) {
          tool.output = event.output;
          tool.exit = event.exit;
          tool.truncated = event.truncated;
        } else {
          entries.push({
            kind: "tool",
            id,
            name: event.name,
            output: event.output,
            exit: event.exit,
            truncated: event.truncated,
          });
        }
        current = null;
        break;
      }
      case "error": {
        entries.push({
          kind: "error",
          id: `e${entries.length}`,
          text: event.message,
        });
        current = null;
        break;
      }
      case "raw": {
        if (event.text.trim() !== "") {
          entries.push({
            kind: "raw",
            id: `r${entries.length}`,
            text: event.text,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return entries;
}
