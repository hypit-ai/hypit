import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
  type AuthorDeclaration,
  type AuthorResolvedReference,
} from "@hypit/author";
import { blobTypes } from "@hypit/blob";
import { mediaTypes } from "@hypit/media";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";

import { hypitPackage } from "../src/activation.js";
import {
  mediaOperationsMarkupDeclarations,
  mediaOperationsModuleRef,
  mediaOperationsTypes,
  transformMediaAuthorDeclaration,
} from "../src/index.js";

const range = { source: "media.direct", start: 0, end: 1 };
const literal = (name: string, value: string) => ({ name, value: { kind: "literal" as const, value } });
const reference = (name: string, path: string) => ({ name, value: { kind: "reference" as const, path } });

test("Media Operations declarations preserve lazy transform order and resolve sources independently of text order", async () => {
  const declarations: AuthorDeclaration[] = [{
    module: mediaOperationsModuleRef,
    name: "transform-media",
    fields: [literal("id", "fast"), reference("source", "raw.media")],
    children: [
      { name: "Retime", fields: [literal("rate", "-24000/1001")], children: [], range },
      { name: "Trim", fields: [literal("start", "0.25s"), literal("tail", "0.5s")], children: [], range },
      { name: "Retime", fields: [], children: [
        { name: "Rate", fields: [literal("at", "start"), literal("value", "1")], children: [], range },
        { name: "Rate", fields: [literal("at", "end-500ms"), literal("value", "1/8")], children: [], range },
        { name: "Rate", fields: [literal("at", "end"), literal("value", "1")], children: [], range },
      ], range },
    ],
    range,
  }, {
    module: mediaOperationsModuleRef,
    name: "prepared-media",
    fields: [
      literal("id", "raw"),
      reference("source", "source"),
      literal("video", "primary-moving"),
      literal("audio", "default"),
      literal("span-authority", "video"),
    ],
    children: [],
    range,
  }];
  const source: AuthorResolvedReference = {
    path: "source",
    ref: { kind: "record", id: "source" },
    type: blobTypes.blob,
  };
  const registry = new AuthorDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, registry);
  const result = await compileAuthorDeclarations({
    sourceName: "media.direct",
    declarations,
    registry,
    resolveReference: (path) => path === "source" ? source : undefined,
    resolveAsset: () => { throw new Error("Media Operations declarations use no author assets."); },
  });

  const transformed = result.components.find((component) => component.id === "fast");
  assert.deepEqual(transformed?.inputs.media, {
    kind: "component-output",
    component: "raw",
    output: "media",
  });
  assert.ok(result.exports.some((output) => output.name === "raw.media"
    && output.type.name === mediaTypes.prepared.name));
  const program = result.records.find((record) => record.id === "fast.program");
  assert.equal(program?.type.name, mediaOperationsTypes.transformProgram.name);
  assert.deepEqual((program?.value as { operations?: readonly { kind: string }[] }).operations?.map((operation) => operation.kind),
    ["retime", "trim", "retime-profile"]);
  assert.deepEqual((program?.value as { operations?: readonly { rate?: unknown }[] }).operations?.[0]?.rate,
    { numerator: -24_000, denominator: 1_001 });
  assert.deepEqual((program?.value as { operations?: readonly { knots?: unknown[] }[] }).operations?.[2]?.knots, [
    { at: { edge: "start", offset: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } } },
      rate: { numerator: 1, denominator: 1 } },
    { at: { edge: "end", offset: { ticks: "500", timeBase: { numerator: 1, denominator: 1_000 } } },
      rate: { numerator: 1, denominator: 8 } },
    { at: { edge: "end", offset: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } } },
      rate: { numerator: 1, denominator: 1 } },
  ]);
});

test("nested Rate syntax reaches one exact retime profile through the public Markup boundary", async () => {
  const prepared: AuthorResolvedReference = {
    path: "raw.media",
    ref: { kind: "component-output", component: "raw", output: "media" },
    type: mediaTypes.prepared,
  };
  const result = await compileMarkupDeclaration({
    source: `<mediaop:Transform id="ramped" source={raw.media}>
  <mediaop:Retime>
    <mediaop:Rate at="start" value="1"/>
    <mediaop:Rate at="end-500ms" value="1/8"/>
    <mediaop:Rate at="end" value="1"/>
  </mediaop:Retime>
</mediaop:Transform>`,
    module: mediaOperationsModuleRef,
    alias: "mediaop",
    compilers: [transformMediaAuthorDeclaration],
    syntax: mediaOperationsMarkupDeclarations,
    references: new Map([[prepared.path, prepared]]),
  });

  const program = result.records.find((record) => record.id === "ramped.program");
  assert.equal(program?.type.name, mediaOperationsTypes.transformProgram.name);
  assert.deepEqual((program?.value as { operations?: readonly { kind: string }[] }).operations?.map((operation) => operation.kind),
    ["retime-profile"]);
});
