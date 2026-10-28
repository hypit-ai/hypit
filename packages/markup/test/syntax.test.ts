import assert from "node:assert/strict";
import test from "node:test";

import { MarkupFrontendError } from "../src/error.js";
import { parseOpeningTag } from "../src/syntax.js";

const source = (text: string) => ({ name: "test.markup", text });

test("reference attributes use non-empty dot-separated segments", () => {
  const parsed = parseOpeningTag(source("<Item value={timeline.start} other={ns:record-1.x}/>"), 0);
  assert.deepEqual(parsed.attributes.value, { kind: "reference", path: "timeline.start" });
  for (const path of ["a.", "a..b", ".a", "a.b."]) {
    assert.throws(
      () => parseOpeningTag(source(`<Item value={${path}}/>`), 0),
      (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_REFERENCE",
    );
  }
});
