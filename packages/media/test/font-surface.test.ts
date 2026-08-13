import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeMediaFontSurface,
  mediaSurfaceImplementationDigests,
  mediaTypes,
} from "@narratage/media";
import { digestOf } from "@narratage/protocol";

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
          digest: digestOf("font:inter-bold"),
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
        digest: digestOf("font:inter-bold"),
        size: 2_048,
        mediaType: "font/woff2",
      } }],
      weight: 700,
      style: "normal",
    },
  });
  assert.ok(mediaSurfaceImplementationDigests.font.startsWith("sha256:"));
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
