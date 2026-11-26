import { describe, expect, it } from "vitest";

import { parseLine } from "@/lib/types";

describe("parseLine", () => {
  it("parses a typed event", () => {
    expect(parseLine('{"type":"assistant_delta","text":"ex-text"}')).toEqual({
      type: "assistant_delta",
      text: "ex-text",
    });
  });

  it("turns a non-JSON line into raw", () => {
    expect(parseLine("ex-diagnostic")).toEqual({
      type: "raw",
      text: "ex-diagnostic",
    });
  });

  it.each(["", "   "])("drops the blank line %j", (line) => {
    expect(parseLine(line)).toBeNull();
  });

  it("turns an object without a type into raw", () => {
    expect(parseLine('{"text":"ex-text"}')).toEqual({
      type: "raw",
      text: '{"text":"ex-text"}',
    });
  });
});
