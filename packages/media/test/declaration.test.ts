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

import { hypitPackage } from "../src/activation.js";
import { mediaModuleRef, mediaTypes, type FontArtifactRef } from "../src/index.js";

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
    ["caption", "han", "latin", "reference"]);
  const stack = result.records.find((record) => record.id === "caption");
  assert.deepEqual(stack?.type, mediaTypes.fontStack);
  assert.equal((stack?.value as unknown as { readonly faces: readonly unknown[] }).faces.length, 2);
  const han = result.records.find(record => record.id === "han")?.value as unknown as FontArtifactRef;
  assert.equal(han.sources[0]?.unicodeRange, "U+4E00-9FFF,U+3400-4DBF");
  assert.deepEqual(requests.map((item) => item.from).sort(), ["./han.woff2", "./latin.woff2", "./reference.mp4"]);
});
