import assert from "node:assert/strict";
import test from "node:test";

import { compileAuthorDeclarations, AuthorDeclarationRegistry } from "@hypit/author";
import type { AuthorDeclaration, AuthorResolvedReference } from "@hypit/author";
import { blobTypes } from "@hypit/blob";
import { compositionTypes } from "@hypit/composition";
import {
  depthStackAuthorDeclarations,
  depthStackModuleRef,
  depthStackTypes,
} from "@hypit/depth-stack";
import { mediaTypes } from "@hypit/media";
import { recipeType } from "@hypit/recipe";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import { fixtureResource } from "../../../test/fixture-resource.js";

const range = { source: "deck.svml", start: 0, end: 1 };
const literal = (name: string, value: string) => ({ name, value: { kind: "literal" as const, value } });
const reference = (name: string, path: string) => ({ name, value: { kind: "reference" as const, path } });

function external(path: string, type: AuthorResolvedReference["type"], value?: unknown): AuthorResolvedReference {
  return {
    path,
    ref: { kind: "record", id: path },
    type,
    ...(value === undefined ? {} : { record: { id: path, type, value: value as never } }),
  };
}

test("DepthStack declarations resolve package-owned labels and time values independently of source order", async () => {
  const declarations: AuthorDeclaration[] = [{
    module: depthStackModuleRef,
    name: "track",
    fields: [
      literal("id", "proof"),
      reference("timeline", "timeline"),
      reference("frame", "frame"),
      reference("appearance", "deck-style"),
      reference("until", "terminal"),
    ],
    children: [{
      name: "Card",
      fields: [
        literal("id", "first"),
        reference("source", "image"),
        reference("extent", "extent"),
        reference("at", "activation"),
        reference("label", "proof-label"),
      ],
      children: [],
      range,
    }],
    range,
  }, {
    module: depthStackModuleRef,
    name: "label",
    fields: [literal("id", "proof-label"), reference("font", "font")],
    children: [],
    text: "Evidence",
    range,
  }];

  const references = new Map<string, AuthorResolvedReference>([
    ["timeline", external("timeline", timelineTypes.timeline)],
    ["frame", external("frame", spatialTypes.frame)],
    ["deck-style", external("deck-style", recipeType, {
      path: "recipes.deck.proof",
      properties: { "visible-previous": 1, "visible-next": 0 },
    })],
    ["terminal", external("terminal", temporalTypes.instant)],
    ["activation", external("activation", temporalTypes.instant)],
    ["image", external("image", blobTypes.blob)],
    ["extent", external("extent", spatialTypes.extent)],
    ["font", external("font", mediaTypes.fontStack, { faces: [{
      sources: [{ artifact: { kind: "blob", resource: fixtureResource("depth-stack-declaration-font"), size: 1, mediaType: "font/woff2" } }],
      weight: 700,
      style: "normal",
    }] })],
  ]);
  const registry = new AuthorDeclarationRegistry();
  for (const declaration of depthStackAuthorDeclarations) registry.register(declaration);
  const result = await compileAuthorDeclarations({
    sourceName: "deck.svml",
    declarations,
    registry,
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("no assets expected"); },
  });

  assert.ok(result.exports.some((output) => output.name === "proof-label"
    && output.type.name === depthStackTypes.cardLabel.name));
  assert.ok(result.exports.some((output) => output.name === "proof.visual"
    && output.type.name === compositionTypes.visualTrack.name));
  const track = result.components.find((component) => component.id === "proof");
  assert.deepEqual(track?.inputs["card-0001-label"], {
    kind: "component-output",
    component: "proof-label",
    output: "label",
  });
  assert.deepEqual(track?.inputs["card-0001-activation"], { kind: "record", id: "activation" });
});
