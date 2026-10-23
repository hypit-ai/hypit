import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { fixtureResource } from "../../../test/fixture-resource.js";
import { mediaTypes } from "@hypit/media";
import { decodeFontsourceFaceSurface } from "../src/index.js";

const range = { start: 0, end: 120 };

test("Fontsource Face reads an installed package as data and preserves every Unicode shard", async () => {
  const requests: string[] = [];
  const result = await decodeFontsourceFaceSurface({
    sourceName: "fontsource.test.ts",
    sourceId: fileURLToPath(import.meta.url),
    element: {
      kind: "element",
      name: "fontsource:Face",
      attributes: {
        id: "inter",
        package: "@fontsource-variable/inter",
        weight: "700",
        style: "normal",
      },
      children: [],
      range,
    },
    resolveReference: () => undefined,
    resolveAsset: (request) => {
      requests.push(request.from);
      return {
        kind: "blob",
        resource: fixtureResource(`fontsource:${request.from}`),
        size: 2_048,
        mediaType: request.mediaType,
      };
    },
  });
  assert.deepEqual(result.records[0]!.type, mediaTypes.fontArtifact);
  assert.equal(requests.length, 7);
  assert.ok(requests.every((request) => request.startsWith("package:@fontsource-variable/inter/files/")));
  const value = result.records[0]!.value as unknown as { sources: unknown[]; weight: number };
  assert.equal(value.sources.length, 7);
  assert.equal(value.weight, 700);
});

test("Fontsource Face rejects a package prefix instead of treating npm as a global catalog", async () => {
  await assert.rejects(async () => await decodeFontsourceFaceSurface({
    sourceName: "fontsource.test.ts",
    sourceId: fileURLToPath(import.meta.url),
    element: {
      kind: "element",
      name: "fontsource:Face",
      attributes: { id: "bad", package: "some-font", weight: "400", style: "normal" },
      children: [],
      range,
    },
    resolveReference: () => undefined,
    resolveAsset: () => { throw new Error("invalid package must fail before assets"); },
  }), /must name one @fontsource/u);
});
