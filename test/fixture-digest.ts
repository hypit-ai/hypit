import type { Digest } from "@narratage/protocol";

/** Test-only Blob address. It encodes fixture text; it does not hash program meaning. */
export function fixtureDigest(value: unknown): Digest {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex.slice(0, 64).padEnd(64, "0")}`;
}
