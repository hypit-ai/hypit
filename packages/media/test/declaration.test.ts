import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  installAuthorDeclarationFacets,
} from "@hypit/author";
import {
  MarkupDeclarationRegistry,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";
import { blobTypes } from "@hypit/blob";

import { hypitPackage } from "../src/activation.js";
import { mediaMarkupDeclarations, mediaModuleRef, mediaProducers, mediaTypes, mediaVideoAuthorDeclaration, type FontArtifactRef } from "../src/index.js";

test("Media declarations resolve assets and authored font references independently of source order", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const requests: Array<{ readonly from: string; readonly mediaType: string }> = [];

  const result = await decodeMarkupDeclarations({
    name: "media.svml",
    text: `<svml>
  <import from="@hypit/media@1" as="media"/>
  <media:FontStack id="caption" primary={latin}><media:Fallback font={han}/></media:FontStack>
  <media:Video id="reference" src="./reference.mp4"/>
  <media:Font id="han" weight="600" style="normal">
    <media:Source src="./han.woff2" unicode-range="U+4E00-9FFF, U+3400-4DBF"/>
  </media:Font>
  <media:Font id="latin" src="./latin.woff2" weight="600" style="normal"/>
</svml>`,
  }, {
    resolveModule: () => mediaModuleRef,
    syntax,
    compilers,
    resolveAsset(request) {
      requests.push({ from: request.from, mediaType: request.mediaType });
      return {
        kind: "blob",
        resource: fixtureResource(`media-declaration:${request.from}`),
        size: 1_024,
        mediaType: request.mediaType,
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
  const result = await compileMarkupDeclaration({
    source: `<media:Video id="generated" source={generation.video}/>`,
    module: mediaModuleRef,
    alias: "media",
    compilers: [mediaVideoAuthorDeclaration],
    syntax: mediaMarkupDeclarations,
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
