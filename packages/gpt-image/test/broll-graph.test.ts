import assert from "node:assert/strict";
import test from "node:test";

import { artifactManifest, artifactTypes } from "@narratage/artifact";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypeValidationReceipt,
  sealTypedModule,
  start,
} from "@narratage/core";
import { elaborateAuthorModule, sealAuthorModule } from "@narratage/elaborator";
import {
  generationManifest,
  sealGenerationMediaBinding,
  sealGenerationRequestDraft,
} from "@narratage/generation";
import {
  createGptImageCleanFragment,
  gptImage2Ports,
  gptImageCleanManifest,
  gptImageEndpoints,
  gptImageManifest,
  sealGptImage2Draft,
} from "@narratage/gpt-image";
import {
  gptImageDenoiseV1,
  imageTransformImplementationDigests,
  imageTransformManifest,
  imageTransformTypes,
} from "@narratage/image-transform";
import { exactModelMediaInputNames } from "@narratage/model-kit";
import { mediaManifest } from "@narratage/media";
import { narrativeManifest } from "@narratage/narrative";
import { programSpaceManifest } from "@narratage/program-space";
import type { CanonicalValue, Digest, ModuleManifest, StoredValue, TypeRef } from "@narratage/protocol";
import { rasterManifest } from "@narratage/raster";
import { createProvidedCandidate } from "@narratage/run";
import {
  createSeedanceAssembledGenerationFragment,
  seedanceEndpoints,
  seedanceManifest,
  seedancePorts,
} from "@narratage/seedance";
import { speechManifest } from "@narratage/speech";
import { spatialManifest } from "@narratage/spatial";
import { textManifest } from "@narratage/text";

const origin = {
  kind: "authored" as const,
};

const image = (name: string) => ({
  kind: "blob" as const,
  digest: digestOf(`image:${name}`),
  size: 100,
  mediaType: "image/png",
});

function fixture() {
  const manifests: ModuleManifest[] = [
    artifactManifest,
    textManifest,
    generationManifest,
    rasterManifest,
    imageTransformManifest,
    gptImageManifest,
    gptImageCleanManifest,
    narrativeManifest,
    mediaManifest,
    programSpaceManifest,
    spatialManifest,
    speechManifest,
    seedanceManifest,
  ];
  const closure = createResolvedClosure(manifests);
  const gpt = gptImageEndpoints.image!;
  const seedance = seedanceEndpoints.mini!;
  const gptBindingPort = gptImage2Ports.ports.find((port) => port.name === "images");
  const seedanceBindingPort = seedancePorts["seedance-2-mini"].ports.find((port) => port.name === "referenceImage");
  assert.ok(gptBindingPort?.value.kind === "media");
  assert.ok(seedanceBindingPort?.value.kind === "media");
  const records: Array<{
    readonly id: string;
    readonly type: TypeRef;
    readonly value: StoredValue;
    readonly validatorDigest?: Digest;
  }> = [];
  const add = (id: string, type: TypeRef, value: StoredValue, validatorDigest?: Digest) =>
    records.push({ id, type, value, ...(validatorDigest === undefined ? {} : { validatorDigest }) });
  add("person", artifactTypes.blob, image("person"));
  add("product", artifactTypes.blob, image("product"));
  add("cleanup", imageTransformTypes.program, {
    kind: "inline", value: gptImageDenoiseV1 as unknown as CanonicalValue,
  }, imageTransformImplementationDigests.validator);

  const gptFragments = {
    holding: createGptImageCleanFragment([
      { name: "person", port: "images" }, { name: "product", port: "images" },
    ]),
    walking: createGptImageCleanFragment([{ name: "holding", port: "images" }]),
    interview: createGptImageCleanFragment([{ name: "holding", port: "images" }]),
  };
  const addGptInputs = (id: string, names: readonly string[]) => {
    add(`${id}.draft`, gpt.draftType, {
      kind: "inline",
      value: sealGptImage2Draft({
        prompt: [`${id} prompt`], aspectRatio: ["9:16"], resolution: ["1K"],
      }) as unknown as CanonicalValue,
    }, gpt.draftValidatorDigest);
    for (const name of names) add(`${id}.${name}.binding`, gpt.mediaBindings.images!.type, {
      kind: "inline",
      value: sealGenerationMediaBinding(gptBindingPort as never, { role: "image" }) as unknown as CanonicalValue,
    });
  };
  addGptInputs("holding", ["person", "product"]);
  addGptInputs("walking", ["holding"]);
  addGptInputs("interview", ["holding"]);

  const seedanceMedia = ["holding", "walking", "interview"].map((name) => ({ name, port: "referenceImage" }));
  const seedanceFragment = createSeedanceAssembledGenerationFragment(seedance, seedanceMedia);
  add("montage.draft", seedance.draftType, {
    kind: "inline",
    value: sealGenerationRequestDraft(seedancePorts["seedance-2-mini"], {
      prompt: ["A fast montage from all three reference images."],
      resolution: ["720p"], aspectRatio: ["9:16"], duration: [6], generateAudio: [false], webSearch: [false],
    }) as unknown as CanonicalValue,
  }, seedance.draftValidatorDigest);
  for (const name of ["holding", "walking", "interview"]) add(`montage.${name}.binding`, seedance.mediaBindings.referenceImage!.type, {
    kind: "inline",
    value: sealGenerationMediaBinding(seedanceBindingPort as never, { role: "image" }) as unknown as CanonicalValue,
  });

  const componentInputs = (
    id: string,
    media: readonly { readonly name: string; readonly source: { readonly kind: "record"; readonly id: string } | { readonly kind: "component-output"; readonly component: string; readonly output: string } }[],
  ) => Object.fromEntries([
    ["draft", { kind: "record" as const, id: `${id}.draft` }],
    ["cleanup", { kind: "record" as const, id: "cleanup" }],
    ...media.flatMap((item) => {
      const names = exactModelMediaInputNames(item.name);
      return [
        [names.binding, { kind: "record" as const, id: `${id}.${item.name}.binding` }],
        [names.artifact, item.source],
      ] as const;
    }),
  ]);
  const components = [{
    id: "holding",
    fragment: gptFragments.holding.id,
    inputs: componentInputs("holding", [
      { name: "person", source: { kind: "record", id: "person" } },
      { name: "product", source: { kind: "record", id: "product" } },
    ]),
    outputs: { image: "holding.image" },
  }, {
    id: "walking",
    fragment: gptFragments.walking.id,
    inputs: componentInputs("walking", [{
      name: "holding", source: { kind: "component-output", component: "holding", output: "image" },
    }]),
    outputs: { image: "walking.image" },
  }, {
    id: "interview",
    fragment: gptFragments.interview.id,
    inputs: componentInputs("interview", [{
      name: "holding", source: { kind: "component-output", component: "holding", output: "image" },
    }]),
    outputs: { image: "interview.image" },
  }, {
    id: "montage",
    fragment: seedanceFragment.id,
    inputs: Object.fromEntries([
      ["draft", { kind: "record" as const, id: "montage.draft" }],
      ...["holding", "walking", "interview"].flatMap((name) => {
        const names = exactModelMediaInputNames(name);
        return [
          [names.binding, { kind: "record" as const, id: `montage.${name}.binding` }],
          [names.artifact, { kind: "component-output" as const, component: name, output: "image" }],
        ] as const;
      }),
    ]),
    outputs: { video: "montage.video" },
  }];
  const typed = sealTypedModule({
    id: "broll-records",
    closureDigest: closure.digest,
    records: records.map(({ validatorDigest, ...record }) => {
      const sealed = sealRecord({ ...record, origin });
      return validatorDigest === undefined ? sealed : {
        ...sealed,
        validation: sealTypeValidationReceipt({
          type: sealed.type,
          recordDigest: sealed.digest,
          validatorDigest,
        }),
      };
    }),
  });
  const program = link(closure, [typed]);
  const fragments = new Map([
    ...Object.values(gptFragments).map((fragment) => [fragment.id, fragment] as const),
    [seedanceFragment.id, seedanceFragment] as const,
  ]);
  const elaborated = elaborateAuthorModule(program, sealAuthorModule({ name: "broll", components }),
    (id) => fragments.get(id));
  return { program, graph: elaborated.graph };
}

test("the common B-roll topology is one graph with one shared holding image", () => {
  const { program, graph } = fixture();
  const state = start(program, graph, sealBuildRequest({
    graph: graph.id,
    targets: [{ output: "montage.video" }],
  }));
  const producers = state.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === "request-gpt-image-2").length, 3);
  assert.equal(producers.filter((name) => name === "request-image-transform").length, 3);
  assert.equal(producers.filter((name) => name === "request-seedance-2-mini").length, 1);
  const holding = graph.outputs.find((output) => output.id === "holding.image");
  assert.ok(holding);
  assert.equal(graph.operations.filter((operation) =>
    Object.values(operation.inputs).some((input) => input.kind === "logical-output" && input.id === "holding.image")).length, 3);
});

test("an explicitly selected holding-image Candidate prunes only that branch", () => {
  const { program, graph } = fixture();
  const candidate = createProvidedCandidate({ type: artifactTypes.blob, value: image("approved-holding") });
  const realized = sealCompiledGraph({
    program: graph.program,
    outputs: graph.outputs.map((item) => item.id === "holding.image"
      ? { ...item, primary: candidate.id }
      : item),
    candidates: [...graph.candidates, candidate],
    operations: graph.operations,
  });
  const state = start(program, realized, sealBuildRequest({
    graph: realized.id,
    targets: [{ output: "montage.video" }],
  }));
  const producers = state.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === "request-gpt-image-2").length, 2);
  assert.equal(producers.filter((name) => name === "request-image-transform").length, 2);
  assert.equal(producers.filter((name) => name === "request-seedance-2-mini").length, 1);
});
