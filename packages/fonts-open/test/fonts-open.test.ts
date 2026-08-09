import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  decodeOpenFontFaceSurface,
  openFontFamilyNames,
} from "@narratage/fonts-open";
import type { FontArtifactRef } from "@narratage/media";

const range = { start: 0, end: 80 };

async function decode(family: string, weight: string, style: string) {
  const requests: { readonly from: string; readonly bytes: Uint8Array }[] = [];
  const output = await decodeOpenFontFaceSurface({
    sourceName: "main.svml",
    element: {
      kind: "element",
      name: "fonts:Face",
      attributes: { id: "selected", family, weight, style },
      children: [],
      range,
    },
    resolveReference: () => undefined,
    resolveAsset(request) {
      assert.ok(request.bytes);
      const bytes = Uint8Array.from(request.bytes);
      requests.push({ from: request.from, bytes });
      return {
        artifact: {
          kind: "blob",
          digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          size: bytes.byteLength,
          mediaType: request.mediaType,
        },
      };
    },
  });
  const stored = output.records[0]!.value;
  assert.equal(stored.kind, "inline");
  return { font: stored.kind === "inline" ? stored.value as unknown as FontArtifactRef : undefined!, requests };
}

test("the open catalog covers eleven useful OFL families", () => {
  assert.deepEqual(openFontFamilyNames, [
    "bebas-neue", "dm-sans", "inter", "manrope", "montserrat", "noto-emoji",
    "noto-sans-sc", "noto-serif-sc", "playfair-display", "poppins", "source-serif-4",
  ]);
});

test("one Latin variable face contributes one exact installed source", async () => {
  const { font, requests } = await decode("inter", "700", "italic");
  assert.equal(font.weight, 700);
  assert.equal(font.style, "italic");
  assert.equal(font.sources.length, 1);
  assert.equal(requests[0]!.from.endsWith("/inter-latin-wght-italic.woff2"), true);
  assert.ok(requests[0]!.bytes.byteLength > 10_000);
});

test("one CJK face preserves every Fontsource Unicode-range source", async () => {
  const { font, requests } = await decode("noto-sans-sc", "700", "normal");
  assert.equal(font.sources.length, 101);
  assert.equal(requests.length, 101);
  assert.equal(font.sources.every((source) => source.unicodeRange?.startsWith("U+") === true), true);
  assert.ok(requests.reduce((total, request) => total + request.bytes.byteLength, 0) > 4_000_000);
});

test("emoji remains one logical fallback face over its installed Unicode slices", async () => {
  const { font } = await decode("noto-emoji", "700", "normal");
  assert.equal(font.sources.length, 10);
  assert.equal(font.weight, 700);
});

test("unavailable family, weight and style combinations fail before reading bytes", async () => {
  await assert.rejects(async () => await decode("comic-sans", "700", "normal"), /family must be one of/u);
  await assert.rejects(async () => await decode("bebas-neue", "700", "normal"), /weight is unavailable/u);
  await assert.rejects(async () => await decode("manrope", "700", "italic"), /style is unavailable/u);
});
