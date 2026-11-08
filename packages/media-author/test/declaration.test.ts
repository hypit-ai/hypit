import assert from "node:assert/strict";
import test from "node:test";

import { fixtureResource } from "../../../test/fixture-resource.js";
import { compileSvmlDeclaration } from "../../../test/compile-svml-declaration.js";
import { blobTypes } from "@hypit/blob";

import { mediaProducers, mediaTypes, type FontArtifactRef } from "@hypit/media";
import {
  mediaAuthorDeclarations,
  mediaAuthorModuleRef,
  mediaImageAuthorDeclaration,
  mediaVideoAuthorDeclaration,
} from "../src/index.js";

test("Media declarations resolve assets and authored font references independently of source order", async () => {
  const requests: Array<{ readonly from: string; readonly mediaType: string }> = [];

  const result = await compileSvmlDeclaration({
    source: `media.font-stack { id: caption primary: @latin Fallback { font: @han } }
media.video { id: reference src: "./reference.mp4" }
media.font {
  id: han weight: 600 style: normal
  Source { src: "./han.woff2" unicode-range: "U+4E00-9FFF, U+3400-4DBF" }
}
media.font { id: latin src: "./latin.woff2" weight: 600 style: normal }`,
    module: mediaAuthorModuleRef,
    alias: "media",
    compilers: mediaAuthorDeclarations,
    resolveAsset(from, mediaType) {
      requests.push({ from, mediaType: mediaType! });
      return {
        kind: "blob",
        resource: fixtureResource(`media-declaration:${from}`),
        size: 1_024,
        mediaType: mediaType!,
      };
    },
  });

  assert.deepEqual(result.exports.map((item) => item.name),
    ["caption", "han", "latin", "reference", "reference.domain", "reference.extent", "reference.resource", "reference.source"]);
  const reference = result.components.find((component) => component.id === "reference");
  assert.deepEqual(reference?.outputs, {
    default: "reference",
    resource: "reference.resource",
    source: "reference.source",
    domain: "reference.domain",
    extent: "reference.extent",
  });
  assert.equal(reference?.fragment.operations.find((operation) => operation.id === "resource")?.producer.name,
    mediaProducers.resource.name);
  assert.equal(reference?.fragment.operations.find((operation) => operation.id === "inspect")?.producer.name,
    mediaProducers.inspect.name);
  const selection = result.records.find((record) => record.id === "reference.request")?.value as {
    readonly video?: { readonly mode?: string };
    readonly audio?: { readonly mode?: string };
    readonly spanAuthority?: string;
  };
  assert.deepEqual(selection, {
    video: { mode: "primary-moving" },
    audio: { mode: "default-if-present" },
    spanAuthority: "video",
    picture: { mode: "source" },
  });
  const stack = result.records.find((record) => record.id === "caption");
  assert.deepEqual(stack?.type, mediaTypes.fontStack);
  assert.equal((stack?.value as unknown as { readonly faces: readonly unknown[] }).faces.length, 2);
  const han = result.records.find(record => record.id === "han")?.value as unknown as FontArtifactRef;
  assert.equal(han.sources[0]?.unicodeRange, "U+4E00-9FFF,U+3400-4DBF");
  assert.deepEqual(requests.map((item) => item.from).sort(), ["./han.woff2", "./latin.woff2", "./reference.mp4"]);
});

test("Video can own the lazy prepared branch of an upstream generated Resource", async () => {
  const result = await compileSvmlDeclaration({
    source: `media.video { id: generated source: @generation.video }`,
    module: mediaAuthorModuleRef,
    alias: "media",
    compilers: [mediaVideoAuthorDeclaration],
    references: new Map([["generation.video", {
      ref: { kind: "component-output", component: "generation", output: "video" },
      type: blobTypes.blob,
    }]]),
  });
  assert.deepEqual(result.components[0]?.inputs.resource, {
    kind: "component-output",
    component: "generation",
    output: "video",
  });
  assert.deepEqual(result.exports.map((item) => item.name), [
    "generated", "generated.domain", "generated.extent", "generated.resource", "generated.source",
  ]);
});

test("Image uses the same lazy Media branch and publishes no fabricated temporal facets", async () => {
  const result = await compileSvmlDeclaration({
    source: `media.image { id: poster src: "./poster.png" }`,
    module: mediaAuthorModuleRef,
    alias: "media",
    compilers: [mediaImageAuthorDeclaration],
    resolveAsset: (from, mediaType) => ({
      kind: "blob", resource: fixtureResource(`media-image:${from}`), size: 32,
      mediaType: mediaType ?? "image/png",
    }),
  });
  assert.deepEqual(result.exports.map((item) => item.name), [
    "poster", "poster.resource", "poster.source",
  ]);
  assert.deepEqual(result.components[0]?.outputs, {
    default: "poster", resource: "poster.resource", source: "poster.source",
  });
  const request = result.records.find((record) => record.id === "poster.request")?.value;
  assert.deepEqual(request, {
    video: { mode: "primary-picture" }, audio: { mode: "none" }, picture: { mode: "source" },
  });
});
