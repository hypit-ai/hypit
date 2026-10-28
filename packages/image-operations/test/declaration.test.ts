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
import { spatialTypes } from "@hypit/spatial";

import { hypitPackage } from "../src/activation.js";
import {
  imageOperationsModuleRef,
  imageTransformTypes,
} from "../src/index.js";

const range = { source: "image.direct", start: 0, end: 1 };
const literal = (name: string, value: string) => ({ name, value: { kind: "literal" as const, value } });
const reference = (name: string, path: string) => ({ name, value: { kind: "reference" as const, path } });

test("Image Operations declarations preserve paint and transform order independently of source order", async () => {
  const declarations: AuthorDeclaration[] = [{
    module: imageOperationsModuleRef,
    name: "compose",
    fields: [literal("id", "poster"), reference("canvas", "canvas")],
    children: [{
      name: "Layer",
      fields: [reference("source", "clean.image"), reference("frame", "frame"), literal("fit", "cover")],
      children: [],
      range,
    }],
    range,
  }, {
    module: imageOperationsModuleRef,
    name: "transform",
    fields: [literal("id", "clean"), reference("source", "source"), reference("program", "cleanup")],
    children: [],
    range,
  }, {
    module: imageOperationsModuleRef,
    name: "program",
    fields: [literal("id", "cleanup")],
    children: [
      { name: "Denoise", fields: [], children: [], range },
      { name: "Encode", fields: [literal("format", "png")], children: [], range },
    ],
    range,
  }];
  const external: Record<string, AuthorResolvedReference> = {
    source: { path: "source", ref: { kind: "record", id: "source" }, type: blobTypes.blob },
    canvas: { path: "canvas", ref: { kind: "record", id: "canvas" }, type: spatialTypes.canvas },
    frame: { path: "frame", ref: { kind: "record", id: "frame" }, type: spatialTypes.frame },
  };
  const registry = new AuthorDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, registry);
  const result = await compileAuthorDeclarations({
    sourceName: "image.direct",
    declarations,
    registry,
    resolveReference: (path) => external[path],
    resolveAsset: () => { throw new Error("Image Operations declarations use no author assets."); },
  });

  const transform = result.components.find((component) => component.id === "clean");
  assert.deepEqual(transform?.inputs.program, { kind: "record", id: "cleanup" });
  const compose = result.components.find((component) => component.id === "poster");
  assert.deepEqual(compose?.inputs["layer-0001-source"], {
    kind: "component-output",
    component: "clean",
    output: "image",
  });
  const program = result.records.find((record) => record.id === "cleanup");
  assert.equal(program?.type.name, imageTransformTypes.program.name);
  assert.deepEqual((program?.value as { operations?: readonly { kind: string }[] }).operations
    ?.map((operation) => operation.kind), ["denoise", "encode"]);
});
