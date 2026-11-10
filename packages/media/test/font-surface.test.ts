import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import { decodeMediaFontStackSurface, decodeMediaFontSurface, mediaTypes } from "@hypit/media";

const range = { start: 0, end: 80 };

test("Font Surface turns explicit author bytes and face metadata into one exact FontArtifactRef", async () => {
  const requests: Array<{ readonly from: string; readonly mediaType: string }> = [];
  const result = await decodeMediaFontSurface({
    sourceName: "main.svml",
    element: {
      kind: "element",
      name: "media:Font",
      attributes: { id: "inter-bold", src: "./Inter-Bold.woff2", weight: "700", style: "normal" },
      children: [],
      range,
    },
    resolveReference: () => undefined,
    resolveAsset: (request) => {
      requests.push(request);
      return {
        artifact: {
          kind: "blob",
          resource: fixtureResource("font:inter-bold"),
          size: 2_048,
          mediaType: request.mediaType,
        },
      };
    },
  });

  assert.deepEqual(requests, [{ from: "./Inter-Bold.woff2", mediaType: "font/woff2", range }]);
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0]!.type, mediaTypes.fontArtifact);
  assert.deepEqual(result.records[0]!.value, {
    kind: "inline",
    value: {
      sources: [{ artifact: {
        kind: "blob",
        resource: fixtureResource("font:inter-bold"),
        size: 2_048,
        mediaType: "font/woff2",
      } }],
      weight: 700,
      style: "normal",
    },
  });
});

test("Font Surface rejects ambiguous files and invalid face metadata before accepting bytes", async () => {
  const decode = (attributes: Readonly<Record<string, string>>) => decodeMediaFontSurface({
    sourceName: "main.svml",
    element: { kind: "element", name: "media:Font", attributes, children: [], range },
    resolveReference: () => undefined,
    resolveAsset: () => {
      throw new Error("invalid Font declarations must fail before resolving bytes");
    },
  });

  await assert.rejects(async () => await decode({ id: "font", src: "./font.bin", weight: "700", style: "normal" }), /known font extension/u);
  await assert.rejects(async () => await decode({ id: "font", src: "./font.ttf", weight: "heavy", style: "normal" }), /integer/u);
  await assert.rejects(async () => await decode({ id: "font", src: "./font.ttf", weight: "700", style: "slanted" }), /normal, italic or oblique/u);
});

test("Font Surface preserves package assets and Unicode-range shards as one exact face", async () => {
  const result = await decodeMediaFontSurface({
    sourceName: "main.svml",
    element: {
      kind: "element",
      name: "media:Font",
      attributes: { id: "han", weight: "600", style: "normal" },
      children: [{
        kind: "element",
        name: "media:Source",
        attributes: {
          src: "package:@company/type/files/han-1.woff2",
          "unicode-range": "U+4E00-9FFF, U+3400-4DBF",
        },
        children: [],
        range,
      }],
      range,
    },
    resolveReference: () => undefined,
    resolveAsset: (request) => ({
      artifact: {
        kind: "blob",
        resource: fixtureResource(`font:${request.from}`),
        size: 1_024,
        mediaType: request.mediaType,
      },
    }),
  });
  assert.deepEqual(result.records[0]!.value, {
    kind: "inline",
    value: {
      sources: [{
        artifact: {
          kind: "blob",
          resource: fixtureResource("font:package:@company/type/files/han-1.woff2"),
          size: 1_024,
          mediaType: "font/woff2",
        },
        unicodeRange: "U+4E00-9FFF,U+3400-4DBF",
      }],
      weight: 600,
      style: "normal",
    },
  });
});

test("FontStack Surface orders generic FontArtifact records without knowing their source", async () => {
  const face = (id: string) => ({
    path: id,
    ref: { kind: "record" as const, id },
    type: mediaTypes.fontArtifact,
    record: {
      id,
      type: mediaTypes.fontArtifact,
      value: { kind: "inline" as const, value: {
        sources: [{ artifact: {
          kind: "blob" as const,
          resource: fixtureResource(`font:${id}`),
          size: 1_024,
          mediaType: "font/woff2",
        } }],
        weight: 600,
        style: "normal",
      } },
    },
  });
  const result = await decodeMediaFontStackSurface({
    sourceName: "main.svml",
    element: {
      kind: "element",
      name: "media:FontStack",
      attributes: { id: "caption", primary: { kind: "reference", path: "latin" } },
      children: [{
        kind: "element",
        name: "media:Fallback",
        attributes: { font: { kind: "reference", path: "han" } },
        children: [],
        range,
      }],
      range,
    },
    resolveReference: (path) => path === "latin" || path === "han" ? face(path) : undefined,
    resolveAsset: () => { throw new Error("FontStack resolves values, not assets"); },
  });
  assert.deepEqual(result.records[0]!.type, mediaTypes.fontStack);
  assert.equal((result.records[0]!.value as unknown as { value: { faces: unknown[] } }).value.faces.length, 2);
});
