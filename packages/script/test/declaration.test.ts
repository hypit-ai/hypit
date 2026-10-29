import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
} from "@hypit/author";
import {
  MarkupDeclarationRegistry,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";

import { hypitPackage } from "../src/activation.js";
import { parseScript, scriptModuleRef } from "../src/index.js";

test("Script has one package-owned meaning through direct and Markup declarations", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);

  const body = "<opening><HOST>Hello @{focus}carefully.@{/focus} @{beat!}</opening>";
  const text = `<svml><import from="@hypit/script@1" as="script"/><script:script id="story">${body}</script:script></svml>`;
  const declarationStart = text.indexOf("<script:script");
  const bodyStart = text.indexOf(">", declarationStart) + 1;
  const bodyEnd = bodyStart + body.length;
  const declarationEnd = text.indexOf("</script:script>", bodyEnd) + "</script:script>".length;

  const direct = await compileAuthorDeclarations({
    sourceName: "story.svml",
    registry: compilers,
    resolveAsset: () => { throw new Error("unused"); },
    declarations: [{
      module: scriptModuleRef,
      name: "script",
      fields: [{ name: "id", value: { kind: "literal", value: "story" } }],
      children: [],
      text: body,
      textRange: { start: bodyStart, end: bodyEnd },
      range: { start: declarationStart, end: declarationEnd },
    }],
  });
  const markup = await decodeMarkupDeclarations({ name: "story.svml", text }, {
    resolveModule: () => scriptModuleRef,
    syntax,
    compilers,
  });

  assert.deepEqual(markup.records, direct.records);
  assert.deepEqual(markup.exports, direct.exports);

  const parsed = parseScript("story.svml", body, bodyStart);
  const segment = parsed.segments[0]!;
  const selection = parsed.selections[0]!;
  const moment = parsed.moments[0]!;
  const byRange = new Map((markup.provenance ?? []).map((item) => [
    `${item.range.start}:${item.range.end}`,
    item.records,
  ]));
  assert.deepEqual(byRange.get(`${segment.range.start}:${segment.range.end}`), [
    "story.segment.opening",
    "story.segment.opening.dialogue",
    "story.segment.opening.speech",
  ]);
  assert.deepEqual(byRange.get(`${selection.open.range.start}:${selection.close.range.end}`), [
    "story.selection.focus",
  ]);
  assert.deepEqual(byRange.get(`${moment.range.start}:${moment.range.end}`), ["story.moment.beat"]);
});
