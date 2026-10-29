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
import { mediaModuleRef, mediaTypes } from "../src/index.js";

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
  <media:WorkingPicture id="hdr-working" color-primaries="bt709" color-transfer="linear" reference-white-nits="203"/>
  <media:Delivery id="hdr-delivery" profile="hdr10-hevc" quality="high" hdr-static-metadata={hdr-metadata}/>
  <media:HdrStaticMetadata id="hdr-metadata"
    red-x="0.708" red-y="0.292" green-x="0.17" green-y="0.797"
    blue-x="0.131" blue-y="0.046" white-x="0.3127" white-y="0.329"
    min-luminance-nits="0.005" max-luminance-nits="1000"
    max-content-light-nits="1000" max-frame-average-light-nits="400"/>
  <media:Video id="reference" src="./reference.mp4"/>
  <media:Font id="han" weight="600" style="normal">
    <media:Source src="./han.woff2" unicode-range="U+4E00-9FFF"/>
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
    ["caption", "han", "hdr-delivery", "hdr-metadata", "hdr-working", "latin", "reference"]);
  const stack = result.records.find((record) => record.id === "caption");
  assert.deepEqual(stack?.type, mediaTypes.fontStack);
  assert.equal((stack?.value as unknown as { readonly faces: readonly unknown[] }).faces.length, 2);
  assert.deepEqual(result.records.find(record => record.id === "hdr-working")?.value, {
    colorPrimaries: "bt709", colorTransfer: "linear", referenceWhiteNits: 203, alphaMode: "premultiplied",
  });
  assert.deepEqual(result.records.find(record => record.id === "hdr-delivery")?.type, mediaTypes.delivery);
  const delivery = result.records.find(record => record.id === "hdr-delivery")?.value as unknown as {
    readonly visual: { readonly hdrStaticMetadata: unknown };
  };
  assert.deepEqual(delivery.visual.hdrStaticMetadata, result.records.find(record => record.id === "hdr-metadata")?.value);
  assert.deepEqual(requests.map((item) => item.from).sort(), ["./han.woff2", "./latin.woff2", "./reference.mp4"]);
});
