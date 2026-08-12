import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import {
  decodeOpenFontFaceSurface,
  decodeOpenFontStackSurface,
  openFontFamilies,
  openFontFamiliesByCategory,
  openFontFamilyNames,
} from "@narratage/fonts-open";
import type { FontArtifactRef, FontStackRef } from "@narratage/media";
import type { StructuredElement, StructuredSurfaceHandler } from "@narratage/markup";

const require = createRequire(import.meta.url);
const range = { start: 0, end: 80 };

async function decode(
  handler: StructuredSurfaceHandler,
  element: StructuredElement,
) {
  const requests: { readonly from: string; readonly bytes: Uint8Array }[] = [];
  const output = await handler({
    sourceName: "main.svml",
    element,
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
  return { value: stored.kind === "inline" ? stored.value : undefined!, requests, output };
}

async function decodeFace(family: string, weight: string, style: string) {
  const result = await decode(decodeOpenFontFaceSurface, {
    kind: "element",
    name: "fonts:Face",
    attributes: { id: "selected", family, weight, style },
    children: [],
    range,
  });
  return { ...result, font: result.value as unknown as FontArtifactRef };
}

test("the catalog exposes 109 publishable open families with frontend metadata", () => {
  assert.equal(openFontFamilyNames.length, 109);
  assert.equal(Object.values(openFontFamiliesByCategory).flat().length, 109);
  for (const family of Object.values(openFontFamilies)) {
    assert.ok(family.label);
    assert.ok(family.intendedUse);
    assert.ok(["OFL-1.1", "Apache-2.0"].includes(family.license));
  }
});

test("catalog license metadata matches every installed Fontsource package", () => {
  for (const [name, family] of Object.entries(openFontFamilies)) {
    const packagePath = require.resolve(`${family.packageName}/package.json`);
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { readonly license: string };
    assert.equal(packageJson.license, family.license, name);
  }
});

test("every declared family, static weight and style can materialize exact bytes", async () => {
  for (const name of openFontFamilyNames) {
    const family = openFontFamilies[name];
    const weights = family.kind === "static" || family.kind === "static-split" || family.kind === "external-split"
      ? family.weights
      : [family.minimumWeight];
    for (const weight of weights) {
      for (const style of family.styles) {
        const { font, requests } = await decodeFace(name, String(weight), style);
        assert.ok(font.sources.length > 0, `${name} ${weight} ${style}`);
        const uniqueBytes = new Set(requests.map(
          (request) => createHash("sha256").update(request.bytes).digest("hex"),
        ));
        assert.equal(uniqueBytes.size, font.sources.length, `${name} ${weight} ${style}`);
        assert.equal(new Set(requests.map((request) => request.from)).size, requests.length, name);
      }
    }
  }
});

test("one Latin variable face contributes one exact installed source", async () => {
  const { font, requests } = await decodeFace("inter", "700", "italic");
  assert.equal(font.weight, 700);
  assert.equal(font.style, "italic");
  assert.equal(font.sources.length, 1);
  assert.equal(requests[0]!.from.endsWith("/inter-latin-wght-italic.woff2"), true);
  assert.ok(requests[0]!.bytes.byteLength > 10_000);
});

test("one CJK face preserves every Fontsource Unicode-range source", async () => {
  const { font, requests } = await decodeFace("noto-sans-sc", "700", "normal");
  assert.equal(font.sources.length, 101);
  assert.equal(requests.length, 101);
  assert.equal(font.sources.every((source) => source.unicodeRange?.startsWith("U+") === true), true);
  assert.ok(requests.reduce((total, request) => total + request.bytes.byteLength, 0) > 4_000_000);
});

test("static split CJK and color emoji faces retain their complete installed shards", async () => {
  const cjk = await decodeFace("zcool-kuaile", "400", "normal");
  assert.ok(cjk.font.sources.length > 10);
  const color = await decodeFace("noto-color-emoji", "400", "normal");
  assert.equal(color.font.sources.length, 11);
  assert.ok(color.requests.reduce((total, request) => total + request.bytes.byteLength, 0) > 1_500_000);
});

test("Stack makes exact CJK and emoji fallback a single reusable author edge", async () => {
  const result = await decode(decodeOpenFontStackSurface, {
    kind: "element",
    name: "fonts:Stack",
    attributes: { id: "caption-fonts", family: "inter", weight: "700", style: "normal", emoji: "color" },
    children: [{
      kind: "element",
      name: "fonts:Fallback",
      attributes: { family: "noto-sans-sc", weight: "700", style: "normal" },
      children: [],
      range,
    }],
    range,
  });
  const stack = result.value as unknown as FontStackRef;
  assert.equal(stack.contract, "svml.font-stack@1");
  assert.equal(stack.faces.length, 3);
  assert.equal(stack.faces[0]!.weight, 700);
  assert.equal(stack.faces[1]!.sources.length, 101);
  assert.equal(stack.faces[2]!.sources.length, 11);
  assert.equal(stack.faces[2]!.weight, 400);
});

test("unavailable family, weight, style and emoji combinations fail before reading bytes", async () => {
  await assert.rejects(async () => await decodeFace("comic-sans", "700", "normal"), /family must be one of/u);
  await assert.rejects(async () => await decodeFace("bebas-neue", "700", "normal"), /weight is unavailable/u);
  await assert.rejects(async () => await decodeFace("manrope", "700", "italic"), /style is unavailable/u);
  await assert.rejects(async () => await decode(decodeOpenFontStackSurface, {
    kind: "element", name: "fonts:Stack",
    attributes: { id: "bad", family: "inter", weight: "700", style: "normal", emoji: "surprise" },
    children: [], range,
  }), /emoji must be color or mono/u);
});
