import assert from "node:assert/strict";
import test from "node:test";

import {
  maskSourceHeader,
  parseSourceHeader,
  SourceHeaderError,
} from "@hypit/generation-authoring/source/text";

test("Source Header explicitly selects one Frontend and masking preserves offsets", () => {
  const text = '<?svml using="@hypit/markup"?>\n\n<svml/>\n';
  const header = parseSourceHeader("main.svml", text);
  assert.equal(header.using, "@hypit/markup");
  const masked = maskSourceHeader(text, header);
  assert.equal(masked.length, text.length);
  assert.equal(masked.indexOf("<svml/>"), text.indexOf("<svml/>"));
  assert.equal(masked.slice(0, header.end).trim(), "");
});

test("Header masking preserves UTF-16 offsets for a non-BMP Frontend request", () => {
  const text = '<?svml using="project.𠮷"?>\r\n<body/>\r\n';
  const header = parseSourceHeader("project.svml", text);
  const masked = maskSourceHeader(text, header);
  assert.equal(masked.length, text.length);
  assert.equal(masked.slice(header.end), '\r\n<body/>\r\n');
  assert.equal(masked.indexOf('<body/>'), text.indexOf('<body/>'));
});

test("Source Header accepts a UTF-8 BOM but no implicit or duplicate Frontend", () => {
  assert.equal(
    parseSourceHeader("bom.svs", '\ufeff<?svml using="@hypit/recipe"?>\n<sheet/>').using,
    "@hypit/recipe",
  );
  assert.throws(
    () => parseSourceHeader("missing.svml", "<svml/>"),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_MISSING",
  );
  assert.throws(
    () => parseSourceHeader("duplicate.svml", '<?svml using="a"?>\n<?svml using="b"?>'),
    (error: unknown) => error instanceof SourceHeaderError
      && error.code === "SOURCE_HEADER_DUPLICATE"
      && error.message.startsWith("duplicate.svml:2:1:"),
  );
  assert.throws(
    () => parseSourceHeader("padded.svml", '<?svml using=" a"?>\n<body/>'),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_FRONTEND",
  );
});
