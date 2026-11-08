import assert from "node:assert/strict";
import test from "node:test";

import { htmlTextFragment, htmlVisual } from "../src/index.js";

const font = {
  faces: [{
    sources: [{
      artifact: { kind: "blob" as const, resource: "res_font_cjk" as const, size: 123, mediaType: "font/woff2" },
      unicodeRange: "U+3000-9FFF",
    }],
    weight: 700,
    style: "normal" as const,
  }],
};

test("HTML Text closes exact fonts, authored spacing and ordered glyph Paint into one fragment", () => {
  const fragment = htmlTextFragment({
    id: "caption-line",
    typography: {
      fonts: font,
      fontFamily: "sans-serif",
      fontSizePx: 52,
      fontWeight: 700,
      lineHeight: 1.1,
      language: "zh",
    },
    paints: [
      { kind: "shadow", color: "#00000099", offsetX: 3, offsetY: 4, blurPx: 8 },
      { kind: "stroke", paint: { kind: "solid", color: "#000000" }, widthPx: 2, placement: "outside" },
      { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
    ],
    children: [{ kind: "group", id: "unit-one", children: [
      { kind: "text", id: "word-one", text: "你好" },
      { kind: "text", id: "word-two", text: " world", style: {
        typography: { fontFamily: "Georgia, serif", fontStyle: "italic" },
      } },
    ] }],
  });

  assert.deepEqual(fragment.dependencies, [{ kind: "data", artifact: font.faces[0]!.sources[0]!.artifact }]);
  assert.match(fragment.html, /@font-face/u);
  assert.match(fragment.html, /hypit-artifact:\/\/res_font_cjk/u);
  assert.match(fragment.html, /font-family:&quot;hypit-text-caption-line-0-0&quot;,sans-serif/u);
  assert.match(fragment.html, /lang="zh"/u);
  assert.match(fragment.html, /你好/u);
  assert.match(fragment.html, / world/u);
  assert.ok(fragment.html.indexOf('data-hypit-text-paint="shadow"')
    < fragment.html.indexOf('data-hypit-text-paint="stroke"'));
  assert.ok(fragment.html.indexOf('data-hypit-text-paint="stroke"')
    < fragment.html.indexOf('data-hypit-text-paint="fill"'));
  assert.match(fragment.html, /-webkit-text-stroke:4px #000000/u);
  assert.doesNotThrow(() => htmlVisual({ html: fragment.html, dependencies: fragment.dependencies }));
});

test("HTML Text rejects CSS injection and repeated node identities", () => {
  assert.throws(() => htmlTextFragment({
    id: "bad-family",
    typography: { fontFamily: "sans-serif;position:fixed" },
    paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
    children: [{ kind: "text", id: "word", text: "Hello" }],
  }), /font family is invalid/u);
  assert.throws(() => htmlTextFragment({
    id: "duplicate",
    typography: {},
    paints: [],
    children: [
      { kind: "text", id: "same", text: "One" },
      { kind: "text", id: "same", text: "Two" },
    ],
  }), /repeats node same/u);
});
