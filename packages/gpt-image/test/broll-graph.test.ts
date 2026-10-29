import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import { blobManifest, blobTypes } from "@hypit/blob";
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import { elaborateAuthorGraph } from "@hypit/author";
import { generationManifest } from "@hypit/generation";
import {
  sealModelArtifactBinding,
  sealModelFieldBuilder,
} from "@hypit/generation/model-fields";
import {
  createGptImageCleanFragment,
  gptImage2Fields,
  gptImageCleanManifest,
  gptImageCleanupProgram,
  gptImageEndpoints,
  gptImageManifest,
  sealGptImage2Draft,
} from "@hypit/gpt-image";
import { imageOperationsManifest, imageTransformTypes } from "@hypit/image-operations";
import { modelArtifactInputNames } from "@hypit/generation/model-fields";
import { mediaManifest } from "@hypit/media";
import { narrativeManifest } from "@hypit/narrative";
import { timelineManifest } from "@hypit/timeline";
import { temporalManifest } from "@hypit/temporal";
import type { CanonicalValue, ResourceId, ModuleManifest, Value, TypeRef } from "@hypit/protocol";
import {
  createSeedanceAssembledGenerationFragment,
  seedanceEndpoints,
  seedanceManifest,
  seedanceFields,
} from "@hypit/seedance";
import { spatialManifest } from "@hypit/spatial";
import { recipeManifest } from "@hypit/recipe";
import { textManifest } from "@hypit/text";

function buildState(
  program: Parameters<typeof planBuild>[0],
  graph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, graph, targets, []);
  return materializeBuild(defineBuild({
    program,
    plan: planned.plan,
  }), []);
}

const image = (name: string) => ({
  kind: "blob" as const,
  resource: fixtureResource(`image:${name}`),
  size: 100,
  mediaType: "image/png",
});

function fixture() {
  const manifests: ModuleManifest[] = [
    blobManifest,
    textManifest,
    generationManifest,
    imageOperationsManifest,
    gptImageManifest,
    gptImageCleanManifest,
    narrativeManifest,
    mediaManifest,
    temporalManifest,
    timelineManifest,
    spatialManifest,
    recipeManifest,
    seedanceManifest,
  ];
  const closure = createResolvedClosure(manifests);
  const gpt = gptImageEndpoints.image!;
  const seedance = seedanceEndpoints.mini!;
  const gptBindingPort = gptImage2Fields.fields.find((field) => field.name === "images");
  const seedanceBindingPort = seedanceFields["seedance-2-mini"].fields.find((field) => field.name === "referenceImage");
  assert.ok(gptBindingPort?.value.kind === "media");
  assert.ok(seedanceBindingPort?.value.kind === "media");
  const records: Array<{
    readonly id: string;
    readonly type: TypeRef;
    readonly value: Value;
  }> = [];
  const add = (id: string, type: TypeRef, value: Value) => records.push({ id, type, value });
  add("person", blobTypes.blob, image("person"));
  add("product", blobTypes.blob, image("product"));
  add("cleanup", imageTransformTypes.program, (gptImageCleanupProgram as unknown as CanonicalValue));

  const gptFragments = {
    holding: createGptImageCleanFragment([
      { name: "person", field: "images" }, { name: "product", field: "images" },
    ]),
    walking: createGptImageCleanFragment([{ name: "holding", field: "images" }]),
    interview: createGptImageCleanFragment([{ name: "holding", field: "images" }]),
  };
  const addGptInputs = (id: string, names: readonly string[]) => {
    add(`${id}.draft`, gpt.draftType, (sealGptImage2Draft({
        prompt: [`${id} prompt`], aspectRatio: ["9:16"], resolution: ["1K"],
      }) as unknown as CanonicalValue));
    for (const name of names) add(`${id}.${name}.binding`, gpt.mediaBindings.images!.type, (sealModelArtifactBinding(gptBindingPort as never, { role: "image" }) as unknown as CanonicalValue));
  };
  addGptInputs("holding", ["person", "product"]);
  addGptInputs("walking", ["holding"]);
  addGptInputs("interview", ["holding"]);

  const seedanceMedia = ["holding", "walking", "interview"].map((name) => ({ name, field: "referenceImage" }));
  const seedanceFragment = createSeedanceAssembledGenerationFragment(seedance, seedanceMedia);
  add("montage.draft", seedance.draftType, (sealModelFieldBuilder(seedanceFields["seedance-2-mini"], {
      prompt: ["A fast montage from all three reference images."],
      resolution: ["720p"], aspectRatio: ["9:16"], duration: [6], generateAudio: [false], webSearch: [false],
    }) as unknown as CanonicalValue));
  for (const name of ["holding", "walking", "interview"]) add(`montage.${name}.binding`, seedance.mediaBindings.referenceImage!.type, (sealModelArtifactBinding(seedanceBindingPort as never, { role: "image", fields: { personReference: true } }) as unknown as CanonicalValue));

  const componentInputs = (
    id: string,
    media: readonly { readonly name: string; readonly source: { readonly kind: "record"; readonly id: string } | { readonly kind: "component-output"; readonly component: string; readonly output: string } }[],
  ) => Object.fromEntries([
    ["draft", { kind: "record" as const, id: `${id}.draft` }],
    ["cleanup", { kind: "record" as const, id: "cleanup" }],
    ...media.flatMap((item) => {
      const names = modelArtifactInputNames(item.name);
      return [
        [names.binding, { kind: "record" as const, id: `${id}.${item.name}.binding` }],
        [names.artifact, item.source],
      ] as const;
    }),
  ]);
  const components = [{
    id: "holding",
    fragment: gptFragments.holding,
    inputs: componentInputs("holding", [
      { name: "person", source: { kind: "record", id: "person" } },
      { name: "product", source: { kind: "record", id: "product" } },
    ]),
    outputs: { image: "holding.image" },
  }, {
    id: "walking",
    fragment: gptFragments.walking,
    inputs: componentInputs("walking", [{
      name: "holding", source: { kind: "component-output", component: "holding", output: "image" },
    }]),
    outputs: { image: "walking.image" },
  }, {
    id: "interview",
    fragment: gptFragments.interview,
    inputs: componentInputs("interview", [{
      name: "holding", source: { kind: "component-output", component: "holding", output: "image" },
    }]),
    outputs: { image: "interview.image" },
  }, {
    id: "montage",
    fragment: seedanceFragment,
    inputs: Object.fromEntries([
      ["draft", { kind: "record" as const, id: "montage.draft" }],
      ...["holding", "walking", "interview"].flatMap((name) => {
        const names = modelArtifactInputNames(name);
        return [
          [names.binding, { kind: "record" as const, id: `montage.${name}.binding` }],
          [names.artifact, { kind: "component-output" as const, component: name, output: "image" }],
        ] as const;
      }),
    ]),
    outputs: { video: "montage.video" },
  }];
  const program = link(closure, records);
  const elaborated = elaborateAuthorGraph(program, components);
  return { program, graph: elaborated };
}

test("the common B-roll topology is one graph with one shared holding image", () => {
  const { program, graph } = fixture();
  const state = buildState(program, graph, ["montage.video"]);
  const producers = state.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === "request-gpt-image-2").length, 3);
  assert.equal(producers.filter((name) => name === "request-image-transform").length, 3);
  assert.equal(producers.filter((name) => name === "request-seedance-2-mini").length, 1);
  const holding = graph.outputs.find((output) => output.id === "holding.image");
  assert.ok(holding);
  assert.equal(graph.operations.filter((operation) =>
    Object.values(operation.inputs).some((input) => input.kind === "logical-output" && input.id === "holding.image")).length, 3);
});

test("an explicitly selected holding-image Record prunes only that branch", () => {
  const { program, graph } = fixture();
  const approved = {
    id: "approved-holding",
    type: blobTypes.blob,
    value: image("approved-holding"),
  };
  const realized = sealAuthorGraph({
    outputs: graph.outputs.map((item) => item.id === "holding.image"
      ? { ...item, primary: { kind: "record" as const, id: approved.id } }
      : item),
    operations: graph.operations,
  });
  const state = buildState(link(program.closure, [...program.records, approved]), realized, ["montage.video"]);
  const producers = state.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === "request-gpt-image-2").length, 2);
  assert.equal(producers.filter((name) => name === "request-image-transform").length, 2);
  assert.equal(producers.filter((name) => name === "request-seedance-2-mini").length, 1);
});
