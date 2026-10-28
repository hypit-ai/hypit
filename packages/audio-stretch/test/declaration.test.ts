import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { audioTrackTypes } from "@hypit/audio-track";

import { hypitPackage } from "../src/activation.js";
import { PITCH_PRESERVING_RECONSTRUCTION_FORMAT, audioStretchModuleRef } from "../src/index.js";

test("PreservePitch declaration publishes one typed reconstruction value", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const decoded = await decodeMarkupDeclarations({
    name: "stretch.svml",
    text: `<svml>
      <import from="@hypit/audio-stretch@1" as="stretch"/>
      <stretch:PreservePitch id="natural"/>
    </svml>`,
  }, {
    resolveModule: () => audioStretchModuleRef,
    syntax,
    compilers,
    sourceImports: [],
  });
  assert.deepEqual(decoded.exports.map(({ name, type }) => [name, type.name]), [
    ["natural", audioTrackTypes.reconstruction.name],
  ]);
  assert.equal((decoded.records[0]?.value as { format?: string }).format,
    PITCH_PRESERVING_RECONSTRUCTION_FORMAT);
});
