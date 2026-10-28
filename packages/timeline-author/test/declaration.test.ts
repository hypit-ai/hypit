import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
  type AuthorDeclaration,
} from "@hypit/author";
import {
  MarkupDeclarationRegistry,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";

import { hypitPackage } from "../src/activation.js";
import { timelineAuthorModuleRef, timelineAuthorTypes } from "../src/index.js";

test("Timeline Author has one package-owned meaning independent of Markup and source order", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);

  const text = `<svml>
  <import from="@hypit/timeline-author@1" as="time"/>
  <time:Timeline id="film" clock={clock} end="tail.end">
    <time:Window id="tail" from="start" for="3s"/>
  </time:Timeline>
  <time:Clock id="clock" frame-rate="30"/>
</svml>`;
  const timelineStart = text.indexOf("<time:Timeline");
  const timelineEnd = text.indexOf("</time:Timeline>") + "</time:Timeline>".length;
  const windowStart = text.indexOf("<time:Window");
  const windowEnd = text.indexOf("/>", windowStart) + 2;
  const clockStart = text.indexOf("<time:Clock");
  const clockEnd = text.indexOf("/>", clockStart) + 2;
  const declarations: readonly AuthorDeclaration[] = [{
    module: timelineAuthorModuleRef,
    name: "timeline",
    fields: [
      { name: "id", value: { kind: "literal", value: "film" } },
      { name: "clock", value: { kind: "reference", path: "clock" } },
      { name: "end", value: { kind: "literal", value: "tail.end" } },
    ],
    children: [{
      name: "Window",
      fields: [
        { name: "id", value: { kind: "literal", value: "tail" } },
        { name: "from", value: { kind: "literal", value: "start" } },
        { name: "for", value: { kind: "literal", value: "3s" } },
      ],
      children: [],
      range: { start: windowStart, end: windowEnd },
    }],
    range: { start: timelineStart, end: timelineEnd },
  }, {
    module: timelineAuthorModuleRef,
    name: "clock",
    fields: [
      { name: "id", value: { kind: "literal", value: "clock" } },
      { name: "frame-rate", value: { kind: "literal", value: "30" } },
    ],
    children: [],
    range: { start: clockStart, end: clockEnd },
  }];

  const direct = await compileAuthorDeclarations({
    sourceName: "timeline.svml",
    declarations,
    registry: compilers,
    resolveAsset: () => { throw new Error("unused"); },
  });
  const markup = await decodeMarkupDeclarations({ name: "timeline.svml", text }, {
    resolveModule: () => timelineAuthorModuleRef,
    syntax,
    compilers,
  });

  assert.deepEqual(markup.records, direct.records);
  assert.deepEqual(markup.components, direct.components);
  assert.deepEqual(markup.exports, direct.exports);
  const duration = markup.records.find((record) => record.type.name === timelineAuthorTypes.duration.name);
  assert.ok(duration);
  assert.deepEqual((markup.provenance ?? []).find((item) => item.range.start === windowStart)?.records, [duration?.id]);
});
