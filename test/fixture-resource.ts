import type { ResourceId } from "@hypit/protocol";

/** Test-only resource identity. It is readable and intentionally unrelated to byte content. */
export function fixtureResource(value: unknown): ResourceId {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const safe = text.replace(/[^a-zA-Z0-9._:-]+/gu, "_").replace(/^_+|_+$/gu, "");
  return `res_fixture:${safe.length === 0 ? "value" : safe}`;
}
