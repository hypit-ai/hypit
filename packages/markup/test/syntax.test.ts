import assert from "node:assert/strict";
import test from "node:test";

import { MarkupFrontendError } from "../src/error.js";
import { parseOpeningTag } from "../src/syntax.js";

const source = (text: string) => ({ name: "test.markup", text });

test("reference attributes accept dotted segment paths", () => {
  const parsed = parseOpeningTag(source(`<Item value={timeline.start} other={ns:record-1.x}/>`), 0);
  assert.deepEqual(parsed.attributes["value"], { kind: "reference", path: "timeline.start" });
  assert.deepEqual(parsed.attributes["other"], { kind: "reference", path: "ns:record-1.x" });
});

test("reference attributes reject empty or trailing segments", () => {
  for (const path of ["a.", "a..b", ".a", "a.b."]) {
    assert.throws(
      () => parseOpeningTag(source(`<Item value={${path}}/>`), 0),
      (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_REFERENCE",
    );
  }
});

test("a long malformed reference rejects without exponential backtracking", () => {
  const path = `a${".b".repeat(40)}!`;
  const startedAt = Date.now();
  assert.throws(
    () => parseOpeningTag(source(`<Item value={${path}}/>`), 0),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_REFERENCE",
  );
  assert(Date.now() - startedAt < 1000, "malformed reference validation took too long");
});
