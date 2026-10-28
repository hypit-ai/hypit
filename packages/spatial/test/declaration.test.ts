import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  compileAuthorDeclarations,
  elaborateAuthorGraph,
  installAuthorDeclarationFacets,
  type AuthorDeclaration,
} from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import { createResolvedClosure, link } from "@hypit/kernel";
import {
  MarkupDeclarationRegistry,
  createMarkupDeclarationAuthorFrontend,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";

import { hypitPackage } from "../src/activation.js";
import { spatialManifest, spatialModuleRef } from "../src/index.js";

const declarations = new AuthorDeclarationRegistry();
const syntax = new MarkupDeclarationRegistry();
installAuthorDeclarationFacets(hypitPackage.facets, declarations);
installMarkupDeclarationFacets(hypitPackage.facets, syntax);

const directPoint: AuthorDeclaration = {
  module: spatialModuleRef,
  name: "point",
  fields: [
    { name: "id", value: { kind: "literal", value: "focus" } },
    { name: "x", value: { kind: "literal", value: "120.5" } },
    { name: "y", value: { kind: "literal", value: "-32" } },
  ],
  children: [],
  range: { start: 0, end: 1 },
};

test("Spatial Point direct and Markup declarations lower to the same authored meaning", async () => {
  const direct = await compileAuthorDeclarations({
    sourceName: "direct",
    declarations: [directPoint],
    registry: declarations,
    resolveAsset: () => { throw new Error("Point does not use assets."); },
  });
  const markup = await decodeMarkupDeclarations({
    name: "point.svml",
    text: `<svml><import from="@hypit/spatial@1" as="space"/><space:Point id="focus" x="120.5" y="-32"/></svml>`,
  }, {
    resolveModule: () => spatialModuleRef,
    syntax,
    compilers: declarations,
  });

  assert.deepEqual(markup.records, direct.records);
  assert.deepEqual(markup.exports, direct.exports);
  const closure = createResolvedClosure([spatialManifest]);
  assert.deepEqual(
    elaborateAuthorGraph(link(closure, markup.records), markup.components),
    elaborateAuthorGraph(link(closure, direct.records), direct.components),
  );
});

test("the declaration-only Frontend compiles the complete Spatial author family", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupDeclarationAuthorFrontend({
    resolveModule: () => spatialModuleRef,
    syntax,
    compilers: declarations,
  }));
  const entry = resolveSelfDescribedTextSource({
    id: "/project/main.svml",
    name: "main.svml",
    text: `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="space" from="@hypit/spatial@1"/>
  <space:AspectFrame id="sticker" within={safe} x="100%" y="100%" width="32%" aspect="9/16" anchor="bottom-right"/>
  <space:AnchoredFrame id="card" within={safe} x="50%" y="78%" width="82%" height="28%" anchor="center"/>
  <space:Frame id="safe" within={vertical.bounds} left="6%" top="4%" right="94%" bottom="96%"/>
  <space:Map id="turned" xx="0" xy="-0.5" yx="0.5" yy="0" tx="920" ty="180"/>
  <space:Path id="headline-path"><space:Move x="120" y="280"/><space:Line x="960" y="280"/></space:Path>
  <space:Point id="headline-origin" x="120" y="280"/>
  <space:Extent id="portrait" width="1080" height="1920"/>
  <space:Canvas id="vertical" width="1080" height="1920"/>
</svml>`,
  });
  const compiled = await compileSourceClosure({
    entry,
    closure: createResolvedClosure([spatialManifest]),
    frontends,
    resolveSource() { throw new Error("Spatial fixture imports no Source files."); },
  });

  assert.deepEqual(compiled.exports.map((item) => item.name).sort(), [
    "card", "headline-origin", "headline-path", "portrait", "safe", "sticker",
    "turned", "vertical.bounds", "vertical.canvas",
  ]);
  assert.equal(compiled.graph.operations.length, 3);
  assert.equal(compiled.graph.outputs.length, 3);
});
