import assert from "node:assert/strict";
import test from "node:test";

import {
  maskSourceHeader,
  parseSourceHeader,
  SourceHeaderError,
} from "@narratage/source";

test("Source Header explicitly selects one Frontend and masking preserves offsets", () => {
  const text = '<?svml using="@narratage/markup@1"?>\n\n<svml/>\n';
  const header = parseSourceHeader("main.svml", text);
  assert.equal(header.using, "@narratage/markup@1");
  const masked = maskSourceHeader(text, header);
  assert.equal(masked.length, text.length);
  assert.equal(masked.indexOf("<svml/>"), text.indexOf("<svml/>"));
  assert.equal(masked.slice(0, header.end).trim(), "");
});

test("Source Header accepts a UTF-8 BOM but no implicit or duplicate Frontend", () => {
  assert.equal(
    parseSourceHeader("bom.svs", '\ufeff<?svml using="@narratage/svs@1"?>\n<sheet/>').using,
    "@narratage/svs@1",
  );
  assert.throws(
    () => parseSourceHeader("missing.svml", "<svml/>"),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_MISSING",
  );
  assert.throws(
    () => parseSourceHeader("duplicate.svml", '<?svml using="a@1"?>\n<?svml using="b@1"?>'),
    (error: unknown) => error instanceof SourceHeaderError
      && error.code === "SOURCE_HEADER_DUPLICATE"
      && error.message.startsWith("duplicate.svml:2:1:"),
  );
  assert.throws(
    () => parseSourceHeader("padded.svml", '<?svml using=" a@1"?>\n<body/>'),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_FRONTEND",
  );
  assert.throws(
    () => parseSourceHeader("oversized.svml", `<?svml using="${"界".repeat(1_500)}"?>\n<body/>`),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_UNCLOSED",
  );
});
