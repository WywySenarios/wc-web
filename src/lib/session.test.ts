import { describe, expect, it } from "vitest";

import { isValidRunId, newRunId } from "@/lib/session";

describe("isValidRunId", () => {
  it("accepts an id in the run grammar", () => {
    expect(isValidRunId("ex-session")).toBe(true);
  });

  // The empty string and a leading hyphen cannot carry the ex- prefix; they are
  // the grammar boundaries themselves.
  it.each([
    ["empty", ""],
    ["dot segments", "ex-.."],
    ["slash", "ex-a/b"],
    ["traversal", "ex-../etc"],
    ["uppercase", "ex-A"],
    ["underscore", "ex-a_b"],
    ["leading hyphen", "-ex-a"],
    ["trailing hyphen", "ex-a-"],
    [
      "too long",
      "ex-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ],
  ])("rejects %s", (_name, id) => {
    expect(isValidRunId(id)).toBe(false);
  });
});

describe("newRunId", () => {
  it("uses the injected clock and random bytes", () => {
    const id = newRunId(
      new Date("2026-11-25T13:20:00.000Z"),
      new Uint8Array([0x00, 0x01]),
    );
    expect(id).toBe("wc-harness-20261125-132000-0001");
  });
});
