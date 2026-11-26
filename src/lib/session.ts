const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Job names and URL ids share this DNS-1123-like grammar. */
export function isValidRunId(id: string): boolean {
  return id.length > 0 && id.length <= 63 && ID_RE.test(id);
}

/**
 * Build a run id from an explicit clock and random source so tests and callers never depend on ambient time or entropy.
 */
export function newRunId(
  now: Date = new Date(),
  bytes: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(2)),
): string {
  if (bytes.length < 2) {
    throw new Error("newRunId: two random bytes are required");
  }
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "-");
  const suffix = Array.from(bytes.slice(0, 2), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `wc-harness-${stamp}-${suffix}`;
}
