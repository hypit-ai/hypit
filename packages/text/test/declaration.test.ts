import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
  type AuthorDeclaration,
  type ResolvedAuthorSourceImport,
} from "@hypit/author";
import {
  MarkupDeclarationRegistry,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";
import type { TypedRecord } from "@hypit/protocol";

import { hypitPackage } from "../src/activation.js";
import { sealTextTemplate, textModuleRef, textTypes } from "../src/index.js";

test("Text keeps one package-owned meaning through direct and Markup declarations", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);

  const template: TypedRecord = {
    id: "template.demo",
    type: textTypes.template,
    value: sealTextTemplate({ root: { kind: "slot", binding: "copy" } }),
  };
  const sourceImport: ResolvedAuthorSourceImport = {
    request: { from: "template.svs", alias: "kit" },
    source: "template.svs",
    records: [template],
    exports: [{ name: "demo", ref: { kind: "record", id: template.id }, type: template.type }],
  };
  const text = `<svml>
  <import from="@hypit/text@1" as="text"/>
  <import source="template.svs" as="kit"/>
  <text:Render id="prompt" template={kit.demo}>
    <text:Param name="energy" value="calm"/>
    <text:Append name="copy" text={extra}/>
  </text:Render>
  <text:Value id="extra">
    One authored line.
  </text:Value>
</svml>`;
  const renderStart = text.indexOf("<text:Render");
  const renderEnd = text.indexOf("</text:Render>") + "</text:Render>".length;
  const paramStart = text.indexOf("<text:Param");
  const paramEnd = text.indexOf("/>", paramStart) + 2;
  const appendStart = text.indexOf("<text:Append");
  const appendEnd = text.indexOf("/>", appendStart) + 2;
  const valueStart = text.indexOf("<text:Value");
  const valueEnd = text.indexOf("</text:Value>") + "</text:Value>".length;
  const declarations: readonly AuthorDeclaration[] = [{
    module: textModuleRef,
    name: "render",
    fields: [
      { name: "id", value: { kind: "literal", value: "prompt" } },
      { name: "template", value: { kind: "reference", path: "kit.demo" } },
    ],
    children: [{
      name: "Param",
      fields: [
        { name: "name", value: { kind: "literal", value: "energy" } },
        { name: "value", value: { kind: "literal", value: "calm" } },
      ],
      children: [],
      range: { start: paramStart, end: paramEnd },
    }, {
      name: "Append",
      fields: [
        { name: "name", value: { kind: "literal", value: "copy" } },
        { name: "text", value: { kind: "reference", path: "extra" } },
      ],
      children: [],
      range: { start: appendStart, end: appendEnd },
    }],
    range: { start: renderStart, end: renderEnd },
  }, {
    module: textModuleRef,
    name: "value",
    fields: [{ name: "id", value: { kind: "literal", value: "extra" } }],
    children: [],
    text: "\n    One authored line.\n  ",
    range: { start: valueStart, end: valueEnd },
  }];
  const external = new Map([["kit.demo", {
    path: "kit.demo",
    ref: { kind: "record" as const, id: template.id },
    type: template.type,
    record: template,
  }]]);
  const direct = await compileAuthorDeclarations({
    sourceName: "text.svml",
    declarations,
    registry: compilers,
    resolveReference: (path) => external.get(path),
    resolveAsset: () => { throw new Error("unused"); },
  });
  const markup = await decodeMarkupDeclarations({ name: "text.svml", text }, {
    resolveModule: () => textModuleRef,
    syntax,
    compilers,
    sourceImports: [sourceImport],
  });

  assert.deepEqual(markup.records, direct.records);
  assert.deepEqual(markup.components, direct.components);
  assert.deepEqual(markup.exports, direct.exports);
  assert.equal((markup.records.find((record) => record.id === "extra")?.value as { readonly value?: string }).value,
    "One authored line.");
  assert.deepEqual((markup.provenance ?? []).find((item) => item.range.start === appendStart)?.records,
    ["prompt.binding-0001"]);
});
