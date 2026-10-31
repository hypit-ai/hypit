import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { compositionTypes } from "@hypit/composition";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { visualCombineModuleRef, visualCombineTypes } from "../src/index.js";

test("Visual Combine declarations preserve Use order while dependencies may point forward", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [
      { name: "timeline", ref: { kind: "record", id: "story.timeline" }, type: timelineTypes.timeline },
      { name: "opening", ref: { kind: "record", id: "opening.visual" }, type: compositionTypes.visualTrack },
      { name: "outro", ref: { kind: "record", id: "outro.visual" }, type: compositionTypes.visualTrack },
    ],
  };
  const text = `<svml>
  <import from="@hypit/visual-combine@1" as="combine"/>
  <import source="facts.svml" as="facts"/>
  <combine:Track id="motion" timeline={facts.timeline}>
    <combine:Use id="main" source={main.visual}/>
    <combine:Use id="outro" source={facts.outro}/>
  </combine:Track>
  <combine:Track id="main" timeline={facts.timeline}>
    <combine:Use id="opening" source={facts.opening}/>
  </combine:Track>
</svml>`;
  const mainUse = text.indexOf('<combine:Use id="main"');
  const decoded = await decodeMarkupDeclarations({ name: "combine.svml", text }, {
    resolveModule: () => visualCombineModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.components.map((component) => component.id), ["main", "motion"]);
  assert.deepEqual(decoded.exports.map((value) => value.name), ["main.visual", "motion.visual"]);
  const useSpecs = decoded.records.filter((record) => record.type.name === visualCombineTypes.useSpec.name);
  assert.deepEqual(useSpecs.map((record) => (record.value as { readonly id: string }).id), ["opening", "main", "outro"]);
  assert.deepEqual((decoded.provenance ?? []).find((item) => item.range.start === mainUse)?.records,
    ["motion.use.0001.spec"]);
});

test("Visual Combine declaration requires at least one Use", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [{ name: "timeline", ref: { kind: "record", id: "story.timeline" }, type: timelineTypes.timeline }],
  };
  await assert.rejects(() => decodeMarkupDeclarations({ name: "empty.svml", text: `<svml>
    <import from="@hypit/visual-combine@1" as="combine"/>
    <import source="facts.svml" as="facts"/>
    <combine:Track id="empty" timeline={facts.timeline}/>
  </svml>` }, {
    resolveModule: () => visualCombineModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  }), /requires at least one Use/u);
});

test("Visual Combine declaration rejects duplicate Use identity before graph lowering", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [
      { name: "timeline", ref: { kind: "record", id: "story.timeline" }, type: timelineTypes.timeline },
      { name: "picture", ref: { kind: "record", id: "picture.visual" }, type: compositionTypes.visualTrack },
    ],
  };
  await assert.rejects(() => decodeMarkupDeclarations({ name: "duplicate.svml", text: `<svml>
    <import from="@hypit/visual-combine@1" as="combine"/>
    <import source="facts.svml" as="facts"/>
    <combine:Track id="duplicate" timeline={facts.timeline}>
      <combine:Use id="same" source={facts.picture}/>
      <combine:Use id="same" source={facts.picture}/>
    </combine:Track>
  </svml>` }, {
    resolveModule: () => visualCombineModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  }), /repeats Use same/u);
});
