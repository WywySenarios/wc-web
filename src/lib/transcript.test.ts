import { describe, expect, it } from "vitest";

import { buildEntries } from "@/lib/transcript";
import type { HarnessEvent } from "@/lib/types";

describe("buildEntries", () => {
  it("accumulates assistant deltas", () => {
    const events: HarnessEvent[] = [
      { type: "assistant_delta", text: "ex-he" },
      { type: "assistant_delta", text: "ex-llo" },
    ];
    expect(buildEntries(events)).toEqual([
      { kind: "message", id: "m0", text: "ex-heex-llo", streaming: true },
    ]);
  });

  it("finalizes on assistant_message", () => {
    const events: HarnessEvent[] = [
      { type: "assistant_delta", text: "ex-he" },
      { type: "assistant_message", text: "ex-final" },
    ];
    expect(buildEntries(events)).toEqual([
      { kind: "message", id: "m0", text: "ex-final", streaming: false },
    ]);
  });

  it("attaches tool results to their call", () => {
    const events: HarnessEvent[] = [
      {
        type: "tool_call",
        id: "ex_tool_call",
        name: "ex-tool",
        args: '{"cmd":"ex-args"}',
      },
      {
        type: "tool_result",
        id: "ex_tool_call",
        name: "ex-tool",
        exit: 0,
        output: "ex-output",
      },
    ];
    expect(buildEntries(events)).toEqual([
      {
        kind: "tool",
        id: "ex_tool_call",
        name: "ex-tool",
        args: '{"cmd":"ex-args"}',
        output: "ex-output",
        exit: 0,
      },
    ]);
  });

  it("skips blank raw lines", () => {
    expect(buildEntries([{ type: "raw", text: "   " }])).toEqual([]);
  });

  it("keeps errors", () => {
    expect(buildEntries([{ type: "error", message: "ex-error" }])).toEqual([
      { kind: "error", id: "e0", text: "ex-error" },
    ]);
  });
});
