import assert from "node:assert/strict";
import test from "node:test";

import {
  audioType,
  audiovisualDependency,
  audiovisualManifest,
  audiovisualProducers,
  audiovisualProgramSource,
  audiovisualTypes,
  pictureType,
  type ProgramSource,
} from "@hypit/audiovisual";
import {
  audiovisualAudioManifest,
  audiovisualAudioProducers,
  audiovisualAudioTypes,
  createAudiovisualAudioFragment,
  createAudiovisualProgramAudioSourceFragment,
  preparedMediaAudioSourceFragment,
} from "@hypit/audiovisual-audio";
import {
  audiovisualHtmlManifest,
  audiovisualHtmlProducers,
  audiovisualHtmlTypes,
  createAudiovisualHtmlFragment,
  createAudiovisualProgramHtmlSourceFragment,
  preparedMediaHtmlSourceFragment,
} from "@hypit/audiovisual-html";
import {
  audiovisualMediaManifest,
  audiovisualMediaProducers,
  preparedMediaProgramSourceFragment,
  programSourceFromPreparedMedia,
} from "@hypit/audiovisual-media";
import { audioProgramManifest } from "@hypit/audio-program";
import { htmlProgramManifest } from "@hypit/html-program";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
  sealGraphFragment,
} from "@hypit/author";
import type { FragmentContribution } from "@hypit/author";
import {
  audioGainManifest,
  audioGainProducers,
  audioGainTypes,
} from "@hypit/audio-gain";
import { blobManifest } from "@hypit/blob";
import {
  createResolvedClosure,
  link,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import { canonicalize } from "@hypit/protocol";
import type { AuthorGraph, LinkedProgram, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { mediaManifest, mediaTypes, prepareMedia } from "@hypit/media";
import {
  IDENTITY_PICTURE_FILTER,
  pictureFilterManifest,
  pictureFilterProducers,
  pictureFilterTypes,
} from "@hypit/picture-filter";
import {
  pictureTransitionManifest,
  pictureTransitionProducers,
  pictureTransitionTypes,
} from "@hypit/picture-transition";
import { spatialManifest } from "@hypit/spatial";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import {
  exactTemporalValue,
  sealLocalTemporalDomain,
  temporalManifest,
  temporalProducers,
  temporalTypes,
} from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  audiovisualAuthorManifest,
  audiovisualAuthorComponent,
  audiovisualAuthorProducers,
  audiovisualAuthorTypes,
  compileAudiovisualAuthorSpec,
  createAudiovisualProgramDomainFragment,
  createOccurrenceClosureFragment,
  createOccurrenceBoundOccurrenceUseFragment,
  createOccurrenceUseFragment,
  createResolvedAudiovisualProgramFragment,
  createSourceBoundOccurrenceUseFragment,
  createUniqueSourceEventPositionFragment,
  type AudiovisualAuthorSpec,
} from "../src/index.js";

const fixtureModule = { name: "example.future-source", version: "1" } as const;
const sourceRequestType = { module: fixtureModule, name: "SourceRequest" } satisfies TypeRef;
const resolveSourceProducer = { module: fixtureModule, name: "resolve-source" } satisfies ProducerRef;
const resolveReconstructionProducer = { module: fixtureModule, name: "resolve-reconstruction" } satisfies ProducerRef;
const fixtureManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [audiovisualDependency],
  types: [sourceRequestType.name],
  capabilities: [],
  producers: [{
    name: resolveSourceProducer.name,
    inputs: [{ name: "request", type: sourceRequestType }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }, {
    name: resolveReconstructionProducer.name,
    inputs: [],
    result: { kind: "output", name: "reconstruction", type: audiovisualTypes.signalReconstruction },
  }],
};

const closure = createResolvedClosure([
  blobManifest,
  temporalManifest,
  spatialManifest,
  mediaManifest,
  audioProgramManifest,
  htmlProgramManifest,
  audiovisualManifest,
  audiovisualMediaManifest,
  audiovisualAudioManifest,
  audiovisualHtmlManifest,
  audiovisualAuthorManifest,
  pictureFilterManifest,
  pictureTransitionManifest,
  audioGainManifest,
  fixtureManifest,
]);

test("three time bindings elaborate to ordinary typed operations", () => {
  const sourceBound = createSourceBoundOccurrenceUseFragment();
  assert.deepEqual(sourceBound.operations.map((operation) => operation.producer.name).toSorted(), [
    audiovisualAuthorProducers.bindOccurrenceUseToSource.name,
    audiovisualAuthorProducers.projectOccurrenceUseEnd.name,
  ].toSorted());
  const occurrenceBound = createOccurrenceBoundOccurrenceUseFragment();
  assert.deepEqual(occurrenceBound.operations.map((operation) => operation.producer.name).toSorted(), [
    audiovisualAuthorProducers.bindOccurrenceUseToOccurrence.name,
    audiovisualAuthorProducers.projectOccurrenceUseEnd.name,
  ].toSorted());
  const eventBound = createUniqueSourceEventPositionFragment({ offset: true });
  assert.deepEqual(eventBound.operations.map((operation) => operation.producer.name).toSorted(), [
    audiovisualAuthorProducers.projectOccurrenceUseOutputMapping.name,
    temporalProducers.preimageMapRegions.name,
    temporalProducers.uniqueRegionSetPoint.name,
    temporalProducers.pointPosition.name,
    audiovisualAuthorProducers.projectOccurrenceUsePosition.name,
    temporalProducers.addExactValues.name,
  ].toSorted());
});
const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});
const start = (offset = at(0)) => ({ edge: "start" as const, offset });
const end = (offset = at(0)) => ({ edge: "end" as const, offset });
const full = () => ({ from: start(), until: end() });
const sampleFrom = (sourceAt = at(0)) => ({ relations: [{
  kind: "rate" as const,
  target: full(),
  targetAt: start(),
  sourceAt: start(sourceAt),
  rate: { numerator: 1, denominator: 1 },
  source: full(),
}] });
const space = sealLocalSpatialDomain({
  id: "main:picture-space",
  region: { x: 0, y: 0, width: 1920, height: 1080 },
});
const programTime = sealLocalTemporalDomain({ id: "main:time", duration: at(12) });
const filterControl = {
  domain: programTime,
  segments: [{
    range: { start: at(0), end: at(12) },
    from: IDENTITY_PICTURE_FILTER,
    to: { ...IDENTITY_PICTURE_FILTER, opacity: 0.5, blurRadius: 8 },
    interpolation: { kind: "linear" as const },
  }],
};
const gainControl = {
  domain: programTime,
  segments: [{
    range: { start: at(0), end: at(12) },
    from: 1,
    to: 0.5,
    interpolation: { kind: "linear" as const },
  }],
};

function spec(): AudiovisualAuthorSpec {
  return {
    id: "main",
    duration: at(12),
    pictureDomain: space,
    sources: {
      "a-roll": { binding: "generated-a-roll" },
      "b-roll": { binding: "product-material" },
    },
    occurrences: {
      presenter: { source: "a-roll", at: at(0),
        outputs: { picture: {}, audio: { reconstruction: "natural" } } },
      product: { source: "b-roll", at: at(4), duration: at(5), outputs: { picture: {} } },
    },
    picture: { output: { kind: "apply", operator: "picture-effect", inputs: {
      picture: { kind: "apply", operator: "transition", inputs: {
        outgoing: { kind: "use", occurrence: "presenter", output: "picture" },
        incoming: { kind: "use", occurrence: "product", output: "picture" },
      }, controlBindings: { progress: { kind: "relation", relation: sampleFrom() } } },
    }, controlBindings: { filter: { kind: "program" } } } },
    audio: { output: { kind: "apply", operator: "audio-effect", inputs: {
      signal: { kind: "use", occurrence: "presenter", output: "audio" },
    }, controlBindings: { gain: { kind: "program" } } } },
  };
}

function futureSourceFragment() {
  return sealGraphFragment({
    inputs: [{ name: "request", type: sourceRequestType }],
    operations: [{
      id: "resolve",
      producer: resolveSourceProducer,
      inputs: { request: { kind: "fragment-input", name: "request" } },
      result: { kind: "output", name: "source" },
    }],
    exports: [{
      name: "source",
      type: audiovisualTypes.programSource,
      root: { kind: "fragment-operation", operation: "resolve" },
    }],
  });
}

test("the Author Fragment accepts a future TemporalMap through the ordinary typed value fold", () => {
  const fragment = createResolvedAudiovisualProgramFragment({ occurrences: 0, temporalMaps: 1 });
  assert.deepEqual(fragment.inputs.find((input) => input.name === "temporal-map-0001")?.type,
    temporalTypes.map);
  assert.equal(fragment.operations.some((operation) =>
    operation.producer.name === audiovisualAuthorProducers.appendTemporalMap.name), true);
});

function futureOperatorFragment(
  producer: ProducerRef,
  type: TypeRef,
  resultName = "operator",
) {
  return sealGraphFragment({
    inputs: [],
    operations: [{
      id: "resolve",
      producer,
      inputs: {},
      result: { kind: "output", name: resultName },
    }],
    exports: [{
      name: "operator",
      type,
      root: { kind: "fragment-operation", operation: "resolve" },
    }],
  });
}

function ownerOperatorFragment(
  producer: ProducerRef,
  inputs: Readonly<Record<string, TypeRef>>,
  outputType: TypeRef,
) {
  return sealGraphFragment({
    inputs: Object.entries(inputs).map(([name, type]) => ({ name, type })),
    operations: [{
      id: "operator",
      producer,
      inputs: Object.fromEntries(Object.keys(inputs).map((name) =>
        [name, { kind: "fragment-input" as const, name }])),
      result: { kind: "output", name: "operator" },
    }],
    exports: [{
      name: "operator",
      type: outputType,
      root: { kind: "fragment-operation", operation: "operator" },
    }],
  });
}

function program(requestedDuration: number): LinkedProgram {
  return link(closure, [
    { id: "spec", type: audiovisualAuthorTypes.spec, value: canonicalize(spec()) },
    { id: "use:presenter:spec", type: audiovisualAuthorTypes.occurrenceUseSpec,
      value: canonicalize({ id: "presenter", domainId: "main:presenter:time",
        outputs: { picture: {}, audio: { reconstruction: "natural" } } }) },
    { id: "use:product:spec", type: audiovisualAuthorTypes.occurrenceUseSpec,
      value: canonicalize({ id: "product", domainId: "main:product:time",
        outputs: { picture: {} } }) },
    { id: "use:presenter:start", type: temporalTypes.exactValue, value: canonicalize(at(0)) },
    { id: "use:product:start", type: temporalTypes.exactValue, value: canonicalize(at(4)) },
    { id: "use:product:duration", type: temporalTypes.exactValue, value: canonicalize(at(5)) },
    { id: "main:domain:spec", type: audiovisualAuthorTypes.programDomainSpec,
      value: canonicalize({ id: "main" }) },
    { id: "main:duration", type: temporalTypes.exactValue, value: canonicalize(at(12)) },
    { id: "binding:picture-effect", type: audiovisualAuthorTypes.operatorBinding,
      value: canonicalize({ name: "picture-effect" }) },
    { id: "binding:transition", type: audiovisualAuthorTypes.operatorBinding,
      value: canonicalize({ name: "transition" }) },
    { id: "binding:audio-effect", type: audiovisualAuthorTypes.operatorBinding,
      value: canonicalize({ name: "audio-effect" }) },
    { id: "binding:natural", type: audiovisualAuthorTypes.reconstructionBinding,
      value: canonicalize({ name: "natural" }) },
    { id: "control:filter", type: pictureFilterTypes.control,
      value: canonicalize(filterControl) },
    { id: "transition:spec", type: pictureTransitionTypes.operatorSpec,
      value: canonicalize({ kind: "cross-dissolve", easing: "linear" }) },
    { id: "transition:domain", type: temporalTypes.localDomain,
      value: canonicalize(programTime) },
    { id: "control:gain", type: audioGainTypes.gainControl,
      value: canonicalize(gainControl) },
    { id: "request:a", type: sourceRequestType,
      value: canonicalize({ durationPreferenceSeconds: requestedDuration }) },
    { id: "request:b", type: sourceRequestType, value: canonicalize({ asset: "product.mp4" }) },
  ]);
}

function graph(linked: LinkedProgram): AuthorGraph {
  const sourceFragment = futureSourceFragment();
  const a = bindAuthorFragment(elaborateGraphFragment(linked, sourceFragment, {
    id: "future-a",
    inputs: { request: { kind: "record", id: "request:a" } },
  }), { source: "future.a" });
  const b = bindAuthorFragment(elaborateGraphFragment(linked, sourceFragment, {
    id: "future-b",
    inputs: { request: { kind: "record", id: "request:b" } },
  }), { source: "future.b" });
  const pictureOperator = bindAuthorFragment(elaborateGraphFragment(linked,
    ownerOperatorFragment(pictureFilterProducers.controlOperator,
      { control: pictureFilterTypes.control }, audiovisualTypes.pictureOperator), {
      id: "future-picture-operator",
      inputs: { control: { kind: "record", id: "control:filter" } },
    }), { operator: "future.picture-operator" });
  const transitionOperator = bindAuthorFragment(elaborateGraphFragment(linked,
    ownerOperatorFragment(pictureTransitionProducers.operator, {
      spec: pictureTransitionTypes.operatorSpec,
      domain: temporalTypes.localDomain,
    }, audiovisualTypes.pictureOperator), {
      id: "future-transition-operator",
      inputs: {
        spec: { kind: "record", id: "transition:spec" },
        domain: { kind: "record", id: "transition:domain" },
      },
    }), { operator: "future.transition-operator" });
  const audioOperator = bindAuthorFragment(elaborateGraphFragment(linked,
    ownerOperatorFragment(audioGainProducers.gainControlOperator,
      { control: audioGainTypes.gainControl }, audiovisualTypes.audioOperator), {
      id: "future-audio-operator",
      inputs: { control: { kind: "record", id: "control:gain" } },
    }), { operator: "future.audio-operator" });
  const reconstruction = bindAuthorFragment(elaborateGraphFragment(linked,
    futureOperatorFragment(
      resolveReconstructionProducer, audiovisualTypes.signalReconstruction, "reconstruction",
    ), {
      id: "future-reconstruction", inputs: {},
    }), { operator: "future.reconstruction" });
  const presenterUse = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceUseFragment({ inferDuration: true, reconstructions: 1 }), {
      id: "main-presenter-use",
      inputs: {
        spec: { kind: "record", id: "use:presenter:spec" },
        source: { kind: "logical-output", id: "future.a" },
        start: { kind: "record", id: "use:presenter:start" },
        "reconstruction-binding-0001": { kind: "record", id: "binding:natural" },
        "reconstruction-0001": { kind: "logical-output", id: "future.reconstruction" },
      },
    }), { use: "main.presenter.use", end: "main.presenter.end" });
  const productUse = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceUseFragment({ inferDuration: false }), {
      id: "main-product-use",
      inputs: {
        spec: { kind: "record", id: "use:product:spec" },
        source: { kind: "logical-output", id: "future.b" },
        start: { kind: "record", id: "use:product:start" },
        duration: { kind: "record", id: "use:product:duration" },
      },
    }), { use: "main.product.use", end: "main.product.end" });
  const domain = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramDomainFragment(), {
      id: "main-domain",
      inputs: {
        spec: { kind: "record", id: "main:domain:spec" },
        duration: { kind: "record", id: "main:duration" },
      },
    }), { domain: "main.domain" });
  const closeUse = (name: string) => bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceClosureFragment(), {
      id: `main-${name}-close`,
      inputs: {
        use: { kind: "logical-output", id: `main.${name}.use` },
        parent: { kind: "logical-output", id: "main.domain" },
      },
    }), { occurrence: `main.${name}.occurrence` });
  const presenter = closeUse("presenter");
  const product = closeUse("product");
  const author = bindAuthorFragment(elaborateGraphFragment(linked,
    createResolvedAudiovisualProgramFragment({
      occurrences: 2, pictureOperators: 2, audioOperators: 1,
    }), {
      id: "main-program",
      inputs: {
        spec: { kind: "record", id: "spec" },
        domain: { kind: "logical-output", id: "main.domain" },
        "occurrence-0001": { kind: "logical-output", id: "main.presenter.occurrence" },
        "occurrence-0002": { kind: "logical-output", id: "main.product.occurrence" },
        "picture-operator-binding-0001": { kind: "record", id: "binding:picture-effect" },
        "picture-operator-0001": { kind: "logical-output", id: "future.picture-operator" },
        "picture-operator-binding-0002": { kind: "record", id: "binding:transition" },
        "picture-operator-0002": { kind: "logical-output", id: "future.transition-operator" },
        "audio-operator-binding-0001": { kind: "record", id: "binding:audio-effect" },
        "audio-operator-0001": { kind: "logical-output", id: "future.audio-operator" },
      },
    }), { program: "main.program" });
  const contributions: readonly FragmentContribution[] = [
    a, b, pictureOperator, transitionOperator, audioOperator, reconstruction,
    presenterUse, productUse, domain, presenter, product, author,
  ];
  const merged = mergeFragmentContributions(
    { outputs: [], operations: [] }, ...contributions,
  );
  return sealAuthorGraph({ ...merged });
}

test("future Sources and package-owned Controls keep one fixed AuthorGraph and BuildPlan", () => {
  const requestedFive = program(5);
  const requestedTen = program(10);
  const fiveGraph = graph(requestedFive);
  const tenGraph = graph(requestedTen);
  const fivePlan = planBuild(requestedFive, fiveGraph, ["main.program"]).plan;
  const tenPlan = planBuild(requestedTen, tenGraph, ["main.program"]).plan;

  assert.deepEqual(fiveGraph, tenGraph);
  assert.deepEqual(fivePlan, tenPlan);
  assert.deepEqual(fivePlan.steps.map((step) => step.producer.name).sort(), [
    "resolve-source",
    "resolve-source",
    pictureFilterProducers.controlOperator.name,
    pictureTransitionProducers.operator.name,
    audioGainProducers.gainControlOperator.name,
    resolveReconstructionProducer.name,
    audiovisualAuthorProducers.appendPictureOperator.name,
    audiovisualAuthorProducers.appendPictureOperator.name,
    audiovisualAuthorProducers.appendAudioOperator.name,
    audiovisualAuthorProducers.appendReconstruction.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.inferOccurrenceDuration.name,
    audiovisualAuthorProducers.resolveOccurrenceUse.name,
    audiovisualAuthorProducers.resolveOccurrenceUse.name,
    audiovisualAuthorProducers.createProgramDomain.name,
    audiovisualAuthorProducers.closeOccurrence.name,
    audiovisualAuthorProducers.closeOccurrence.name,
    audiovisualAuthorProducers.createOccurrences.name,
    audiovisualAuthorProducers.appendOccurrence.name,
    audiovisualAuthorProducers.appendOccurrence.name,
    audiovisualAuthorProducers.closeResolvedProgram.name,
  ].sort());
  const useSteps = fivePlan.steps.filter((step) =>
    step.producer.name === audiovisualAuthorProducers.resolveOccurrenceUse.name);
  assert.equal(useSteps.length, 2);
  assert.equal(useSteps.every((step) => Object.values(step.inputs)
    .some((record) => record.includes("future-a") || record.includes("future-b"))), true);
  assert.deepEqual(fivePlan.steps.find((step) =>
    step.producer.name === pictureFilterProducers.controlOperator.name)?.inputs,
  { control: "control:filter" });
  assert.deepEqual(fivePlan.steps.find((step) =>
    step.producer.name === pictureTransitionProducers.operator.name)?.inputs,
  { spec: "transition:spec", domain: "transition:domain" });
  assert.deepEqual(fivePlan.steps.find((step) =>
    step.producer.name === audioGainProducers.gainControlOperator.name)?.inputs,
  { control: "control:gain" });
});

function actualSource(durationNumerator: number): ProgramSource {
  const duration = at(durationNumerator, 10);
  return {
    id: "actual-generated-a-roll",
    outputs: {
      picture: {
        kind: "signal",
        type: pictureType,
        domain: sealLocalTemporalDomain({ id: "actual-a-roll:picture-time", duration }),
        spatialDomain: space,
      },
      audio: {
        kind: "signal",
        type: audioType,
        domain: sealLocalTemporalDomain({ id: "actual-a-roll:audio-time", duration }),
      },
    },
  };
}

test("one forward AuthorGraph derives its boundary from a Source use and closes afterward", () => {
  const source = actualSource(49);
  const author: AudiovisualAuthorSpec = {
    id: "forward",
    duration: at(49, 10),
    pictureDomain: space,
    sources: { generated: { binding: "generated" } },
    occurrences: {
      generated: { source: "generated", at: at(0), outputs: { picture: {} } },
    },
    picture: { output: { kind: "use", occurrence: "generated", output: "picture" } },
  };
  const linked = link(closure, [
    { id: "forward:use-spec", type: audiovisualAuthorTypes.occurrenceUseSpec,
      value: canonicalize({ id: "generated", domainId: "forward:generated:time",
        outputs: { picture: {} } }) },
    { id: "forward:source", type: audiovisualTypes.programSource, value: canonicalize(source) },
    { id: "forward:start", type: temporalTypes.exactValue, value: canonicalize(at(0)) },
    { id: "forward:domain-spec", type: audiovisualAuthorTypes.programDomainSpec,
      value: canonicalize({ id: "forward" }) },
    { id: "forward:spec", type: audiovisualAuthorTypes.spec, value: canonicalize(author) },
  ]);
  const use = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceUseFragment({ inferDuration: true }), {
      id: "forward:use",
      inputs: {
        spec: { kind: "record", id: "forward:use-spec" },
        source: { kind: "record", id: "forward:source" },
        start: { kind: "record", id: "forward:start" },
      },
    }), { use: "forward.use", end: "forward.end" });
  const domain = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramDomainFragment(), {
      id: "forward:domain",
      inputs: {
        spec: { kind: "record", id: "forward:domain-spec" },
        duration: { kind: "logical-output", id: "forward.end" },
      },
    }), { domain: "forward.domain" });
  const occurrence = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceClosureFragment(), {
      id: "forward:occurrence",
      inputs: {
        use: { kind: "logical-output", id: "forward.use" },
        parent: { kind: "logical-output", id: "forward.domain" },
      },
    }), { occurrence: "forward.occurrence" });
  const program = bindAuthorFragment(elaborateGraphFragment(linked,
    createResolvedAudiovisualProgramFragment({ occurrences: 1 }), {
      id: "forward:program",
      inputs: {
        spec: { kind: "record", id: "forward:spec" },
        domain: { kind: "logical-output", id: "forward.domain" },
        "occurrence-0001": { kind: "logical-output", id: "forward.occurrence" },
      },
    }), { program: "forward.program" });
  const merged = mergeFragmentContributions(
    { outputs: [], operations: [] }, use, domain, occurrence, program,
  );
  const plan = planBuild(linked, sealAuthorGraph({ ...merged }), ["forward.program"]).plan;
  const step = (name: string) => plan.steps.find((candidate) => candidate.producer.name === name)!;
  const resolve = step(audiovisualAuthorProducers.resolveOccurrenceUse.name);
  const end = step(audiovisualAuthorProducers.projectOccurrenceUseEnd.name);
  const createDomain = step(audiovisualAuthorProducers.createProgramDomain.name);
  const closeOccurrence = step(audiovisualAuthorProducers.closeOccurrence.name);
  const appendOccurrence = step(audiovisualAuthorProducers.appendOccurrence.name);
  const closeProgram = step(audiovisualAuthorProducers.closeResolvedProgram.name);
  assert.equal(end.inputs.use, resolve.result.record);
  assert.equal(createDomain.inputs.duration, end.result.record);
  assert.equal(closeOccurrence.inputs.use, resolve.result.record);
  assert.equal(closeOccurrence.inputs.parent, createDomain.result.record);
  assert.equal(appendOccurrence.inputs.occurrence, closeOccurrence.result.record);
  assert.equal(closeProgram.inputs.domain, createDomain.result.record);
  assert.equal(closeProgram.inputs.occurrences, appendOccurrence.result.record);
});

test("actual 4.9 and 5.1 second Sources change only the closed Programme value", () => {
  const author: AudiovisualAuthorSpec = {
    id: "actual-duration",
    duration: at(6),
    pictureDomain: space,
    sources: { generated: { binding: "generated" } },
    occurrences: {
      generated: { source: "generated", at: at(0), outputs: { picture: {}, audio: {} } },
    },
    picture: { output: { kind: "use", occurrence: "generated", output: "picture" } },
    audio: { output: { kind: "use", occurrence: "generated", output: "audio" } },
  };
  const short = compileAudiovisualAuthorSpec(author, { sources: { generated: actualSource(49) } });
  const long = compileAudiovisualAuthorSpec(author, { sources: { generated: actualSource(51) } });
  assert.deepEqual(short.occurrences.generated?.domain.duration, at(49, 10));
  assert.deepEqual(long.occurrences.generated?.domain.duration, at(51, 10));
  assert.deepEqual(short.domain, long.domain);
});

test("ordinary Producer facets materialize the forward use, boundary and Programme close", async () => {
  const facet = (name: string) => audiovisualAuthorComponent.producers.find((candidate) =>
    candidate.producer.name === name)!;
  const created = await facet(audiovisualAuthorProducers.createBindings.name).handler({
    inputs: {},
  } as never);
  assert.equal(created.kind, "output");
  const source = actualSource(49);
  const useSpec = { id: "generated", domainId: "producer-close:generated:time",
    outputs: { picture: {}, audio: {} } };
  const duration = await facet(audiovisualAuthorProducers.inferOccurrenceDuration.name).handler({
    inputs: {
      spec: { value: canonicalize(useSpec) },
      source: { value: canonicalize(source) },
    },
  } as never);
  assert.equal(duration.kind, "output");
  const use = await facet(audiovisualAuthorProducers.resolveOccurrenceUse.name).handler({
    inputs: {
      spec: { value: canonicalize(useSpec) },
      source: { value: canonicalize(source) },
      start: { value: canonicalize(at(0)) },
      duration: { value: duration.value },
      bindings: { value: created.value },
    },
  } as never);
  assert.equal(use.kind, "output");
  const domain = await facet(audiovisualAuthorProducers.createProgramDomain.name).handler({
    inputs: {
      spec: { value: canonicalize({ id: "producer-close" }) },
      duration: { value: canonicalize(at(6)) },
    },
  } as never);
  assert.equal(domain.kind, "output");
  const occurrence = await facet(audiovisualAuthorProducers.closeOccurrence.name).handler({
    inputs: { use: { value: use.value }, parent: { value: domain.value } },
  } as never);
  assert.equal(occurrence.kind, "output");
  const empty = await facet(audiovisualAuthorProducers.createOccurrences.name).handler({
    inputs: {},
  } as never);
  assert.equal(empty.kind, "output");
  const occurrences = await facet(audiovisualAuthorProducers.appendOccurrence.name).handler({
    inputs: { occurrences: { value: empty.value }, occurrence: { value: occurrence.value } },
  } as never);
  assert.equal(occurrences.kind, "output");
  const author: AudiovisualAuthorSpec = {
    id: "producer-close",
    duration: at(6),
    pictureDomain: space,
    sources: { generated: { binding: "generated" } },
    occurrences: {
      generated: { source: "generated", at: at(0), outputs: { picture: {}, audio: {} } },
    },
    picture: { output: { kind: "use", occurrence: "generated", output: "picture" } },
    audio: { output: { kind: "use", occurrence: "generated", output: "audio" } },
  };
  const closed = await facet(audiovisualAuthorProducers.closeResolvedProgram.name).handler({
    inputs: {
      spec: { value: canonicalize(author) },
      bindings: { value: created.value },
      domain: { value: domain.value },
      occurrences: { value: occurrences.value },
    },
  } as never);
  assert.equal(closed.kind, "output");
  const value = closed.value as unknown as { readonly occurrences: Readonly<Record<string, {
    readonly domain: { readonly duration: unknown };
  }>> };
  assert.deepEqual(value.occurrences.generated?.domain.duration, at(49, 10));
});

function preparedInterview() {
  return prepareMedia({
    id: "nested-interview",
    source: {
      kind: "blob",
      resource: fixtureResource("audiovisual-author:nested-interview"),
      size: 1,
      mediaType: "video/mp4",
    },
    inspection: { streams: [{
      kind: "video",
      index: 0,
      codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: at(0),
      endPts: at(5),
      decodedUnitCount: 150,
      width: 1920,
      height: 1080,
      sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0,
      picture: {
        colorPrimaries: "bt709",
        colorTransfer: "bt709",
        colorMatrix: "bt709",
        colorRange: "limited",
        bitDepth: 8,
        alphaMode: "opaque",
      },
    }, {
      kind: "audio",
      index: 1,
      codecName: "aac",
      disposition: { default: true, attachedPicture: false },
      startPts: at(0),
      endPts: at(5),
      sampleRate: 48_000,
      channels: 2,
      decodedSampleFrames: 240_000,
    }] },
    selection: {
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      spanAuthority: "video",
      picture: {
        colorPrimaries: "bt709",
        colorTransfer: "bt709",
        colorMatrix: "bt709",
        colorRange: "limited",
        bitDepth: 8,
        alphaMode: "opaque",
      },
    },
  });
}

const nestedChildSpace = sealLocalSpatialDomain({
  id: "nested-child:picture-space",
  region: { x: 0, y: 0, width: 1920, height: 1080 },
});
const nestedParentSpace = sealLocalSpatialDomain({
  id: "nested-parent:picture-space",
  region: { x: 0, y: 0, width: 1920, height: 1080 },
});

function nestedSpecs(media = preparedInterview()) {
  const mediaSource = programSourceFromPreparedMedia(media);
  const child: AudiovisualAuthorSpec = {
    id: "nested-child",
    duration: at(5),
    pictureDomain: nestedChildSpace,
    sources: { media: { binding: "media" } },
    occurrences: {
      interview: { source: "media", at: at(0), outputs: { picture: {}, audio: {} } },
    },
    picture: { output: {
      kind: "remap",
      input: { kind: "use", occurrence: "interview", output: "picture" },
      mapping: sealSpatialMap({
        target: nestedChildSpace,
        source: mediaSource.outputs.picture!.spatialDomain!,
        transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
      }),
    } },
    audio: { output: { kind: "use", occurrence: "interview", output: "audio" } },
  };
  const childProgram = compileAudiovisualAuthorSpec(child, { sources: { media: mediaSource } });
  const childSource = audiovisualProgramSource(childProgram);
  const parent: AudiovisualAuthorSpec = {
    id: "nested-parent",
    duration: at(7),
    pictureDomain: nestedParentSpace,
    sources: { child: { binding: "child" } },
    occurrences: {
      child: { source: "child", at: at(1), outputs: { picture: {}, audio: {} } },
    },
    picture: { output: {
      kind: "remap",
      input: { kind: "use", occurrence: "child", output: "picture" },
      mapping: sealSpatialMap({
        target: nestedParentSpace,
        source: childSource.outputs.picture!.spatialDomain!,
        transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
      }),
    } },
    audio: { output: { kind: "use", occurrence: "child", output: "audio" } },
  };
  return { media, mediaSource, child, childProgram, childSource, parent };
}

const programSourceFragment = sealGraphFragment({
  inputs: [{ name: "program", type: audiovisualTypes.program }],
  operations: [{
    id: "source",
    producer: audiovisualProducers.programSource,
    inputs: { program: { kind: "fragment-input", name: "program" } },
    result: { kind: "output", name: "source" },
  }],
  exports: [{
    name: "source",
    type: audiovisualTypes.programSource,
    root: { kind: "fragment-operation", operation: "source" },
  }],
});

function nestedGraph(linked: LinkedProgram): AuthorGraph {
  const media = bindAuthorFragment(elaborateGraphFragment(linked,
    preparedMediaProgramSourceFragment, {
      id: "nested-media-source",
      inputs: { media: { kind: "record", id: "nested:media" } },
    }), { source: "nested.media.source" });
  const childUse = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceUseFragment({ inferDuration: true }), {
      id: "nested-child-use",
      inputs: {
        spec: { kind: "record", id: "nested:child:use-spec" },
        source: { kind: "logical-output", id: "nested.media.source" },
        start: { kind: "record", id: "nested:child:start" },
      },
    }), { use: "nested.child.use", end: "nested.child.end" });
  const childDomain = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramDomainFragment(), {
      id: "nested-child-domain",
      inputs: {
        spec: { kind: "record", id: "nested:child:domain-spec" },
        duration: { kind: "record", id: "nested:child:duration" },
      },
    }), { domain: "nested.child.domain" });
  const childOccurrence = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceClosureFragment(), {
      id: "nested-child-occurrence",
      inputs: {
        use: { kind: "logical-output", id: "nested.child.use" },
        parent: { kind: "logical-output", id: "nested.child.domain" },
      },
    }), { occurrence: "nested.child.occurrence" });
  const child = bindAuthorFragment(elaborateGraphFragment(linked,
    createResolvedAudiovisualProgramFragment({ occurrences: 1 }), {
      id: "nested-child-program",
      inputs: {
        spec: { kind: "record", id: "nested:child:spec" },
        domain: { kind: "logical-output", id: "nested.child.domain" },
        "occurrence-0001": { kind: "logical-output", id: "nested.child.occurrence" },
      },
    }), { program: "nested.child.program" });
  const childSource = bindAuthorFragment(elaborateGraphFragment(linked,
    programSourceFragment, {
      id: "nested-child-source",
      inputs: { program: { kind: "logical-output", id: "nested.child.program" } },
    }), { source: "nested.child.source" });
  const parentUse = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceUseFragment({ inferDuration: true }), {
      id: "nested-parent-use",
      inputs: {
        spec: { kind: "record", id: "nested:parent:use-spec" },
        source: { kind: "logical-output", id: "nested.child.source" },
        start: { kind: "record", id: "nested:parent:start" },
      },
    }), { use: "nested.parent.use", end: "nested.parent.end" });
  const parentDomain = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramDomainFragment(), {
      id: "nested-parent-domain",
      inputs: {
        spec: { kind: "record", id: "nested:parent:domain-spec" },
        duration: { kind: "record", id: "nested:parent:duration" },
      },
    }), { domain: "nested.parent.domain" });
  const parentOccurrence = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceClosureFragment(), {
      id: "nested-parent-occurrence",
      inputs: {
        use: { kind: "logical-output", id: "nested.parent.use" },
        parent: { kind: "logical-output", id: "nested.parent.domain" },
      },
    }), { occurrence: "nested.parent.occurrence" });
  const parent = bindAuthorFragment(elaborateGraphFragment(linked,
    createResolvedAudiovisualProgramFragment({ occurrences: 1 }), {
      id: "nested-parent-program",
      inputs: {
        spec: { kind: "record", id: "nested:parent:spec" },
        domain: { kind: "logical-output", id: "nested.parent.domain" },
        "occurrence-0001": { kind: "logical-output", id: "nested.parent.occurrence" },
      },
    }), { program: "nested.parent.program" });
  const mediaAudio = bindAuthorFragment(elaborateGraphFragment(linked,
    preparedMediaAudioSourceFragment, {
      id: "nested-media-audio-source",
      inputs: {
        media: { kind: "record", id: "nested:media" },
        output: { kind: "record", id: "nested:audio-output" },
      },
    }), { source: "nested.media.audio-source" });
  const childAudio = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramAudioSourceFragment(1), {
      id: "nested-child-audio-source",
      inputs: {
        program: { kind: "logical-output", id: "nested.child.program" },
        output: { kind: "record", id: "nested:audio-output" },
        "source-0001": { kind: "logical-output", id: "nested.media.audio-source" },
      },
    }), { source: "nested.child.audio-source" });
  const parentAudio = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualAudioFragment(1), {
      id: "nested-parent-audio",
      inputs: {
        program: { kind: "logical-output", id: "nested.parent.program" },
        output: { kind: "record", id: "nested:audio-output" },
        "source-0001": { kind: "logical-output", id: "nested.child.audio-source" },
      },
    }), { program: "nested.parent.audio-program" });
  const mediaHtml = bindAuthorFragment(elaborateGraphFragment(linked,
    preparedMediaHtmlSourceFragment, {
      id: "nested-media-html-source",
      inputs: { media: { kind: "record", id: "nested:media" } },
    }), { source: "nested.media.html-source" });
  const childHtml = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramHtmlSourceFragment(1), {
      id: "nested-child-html-source",
      inputs: {
        program: { kind: "logical-output", id: "nested.child.program" },
        "source-0001": { kind: "logical-output", id: "nested.media.html-source" },
      },
    }), { source: "nested.child.html-source" });
  const parentHtml = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualHtmlFragment(1), {
      id: "nested-parent-html",
      inputs: {
        program: { kind: "logical-output", id: "nested.parent.program" },
        output: { kind: "record", id: "nested:html-output" },
        "source-0001": { kind: "logical-output", id: "nested.child.html-source" },
      },
    }), { program: "nested.parent.html-program" });
  return sealAuthorGraph(mergeFragmentContributions(
    { outputs: [], operations: [] }, media,
    childUse, childDomain, childOccurrence, child, childSource,
    parentUse, parentDomain, parentOccurrence, parent,
    mediaAudio, childAudio, parentAudio, mediaHtml, childHtml, parentHtml,
  ));
}

test("PreparedMedia closes through a child Programme into one parent AuthorGraph", () => {
  const values = nestedSpecs();
  const parentProgram = compileAudiovisualAuthorSpec(values.parent, {
    sources: { child: values.childSource },
  });
  assert.equal(parentProgram.occurrences.child?.source.id, "nested-child");
  assert.deepEqual(parentProgram.occurrences.child?.domain.duration, at(5));
  assert.deepEqual(parentProgram.occurrences.child?.source.outputs.picture?.spatialDomain,
    nestedChildSpace);
  const childAudio = parentProgram.occurrences.child?.source.outputs.audio;
  assert.equal(childAudio?.kind, "signal");
  assert.deepEqual(childAudio.domain, values.childProgram.domain);

  const linked = link(closure, [
    { id: "nested:media", type: mediaTypes.prepared, value: canonicalize(values.media) },
    { id: "nested:child:use-spec", type: audiovisualAuthorTypes.occurrenceUseSpec,
      value: canonicalize({ id: "interview", domainId: "nested-child:interview:time",
        outputs: { picture: {}, audio: {} } }) },
    { id: "nested:child:start", type: temporalTypes.exactValue, value: canonicalize(at(0)) },
    { id: "nested:child:domain-spec", type: audiovisualAuthorTypes.programDomainSpec,
      value: canonicalize({ id: "nested-child" }) },
    { id: "nested:child:duration", type: temporalTypes.exactValue, value: canonicalize(at(5)) },
    { id: "nested:parent:use-spec", type: audiovisualAuthorTypes.occurrenceUseSpec,
      value: canonicalize({ id: "child", domainId: "nested-parent:child:time",
        outputs: { picture: {}, audio: {} } }) },
    { id: "nested:parent:start", type: temporalTypes.exactValue, value: canonicalize(at(1)) },
    { id: "nested:parent:domain-spec", type: audiovisualAuthorTypes.programDomainSpec,
      value: canonicalize({ id: "nested-parent" }) },
    { id: "nested:parent:duration", type: temporalTypes.exactValue, value: canonicalize(at(7)) },
    { id: "nested:child:spec", type: audiovisualAuthorTypes.spec, value: canonicalize(values.child) },
    { id: "nested:parent:spec", type: audiovisualAuthorTypes.spec, value: canonicalize(values.parent) },
    { id: "nested:audio-output", type: audiovisualAudioTypes.output,
      value: canonicalize({ sampleRate: 48_000 }) },
    { id: "nested:html-output", type: audiovisualHtmlTypes.output, value: canonicalize({
      id: "nested-html",
      sampling: { frameRate: { numerator: 30, denominator: 1 } },
      canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    }) },
  ]);
  const graph = nestedGraph(linked);
  const plan = planBuild(linked, graph, ["nested.parent.program"]).plan;
  const forwardProgrammeSteps = [
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.inferOccurrenceDuration.name,
    audiovisualAuthorProducers.resolveOccurrenceUse.name,
    audiovisualAuthorProducers.createProgramDomain.name,
    audiovisualAuthorProducers.closeOccurrence.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.createOccurrences.name,
    audiovisualAuthorProducers.appendOccurrence.name,
    audiovisualAuthorProducers.closeResolvedProgram.name,
  ];
  const nestedProgrammeSteps = [
    audiovisualMediaProducers.source.name,
    ...forwardProgrammeSteps,
    audiovisualProducers.programSource.name,
    ...forwardProgrammeSteps,
  ];
  assert.deepEqual(plan.steps.map((step) => step.producer.name).sort(),
    nestedProgrammeSteps.toSorted());

  const audioPlan = planBuild(linked, graph, ["nested.parent.audio-program"]).plan;
  assert.deepEqual(audioPlan.steps.map((step) => step.producer.name).sort(), [
    ...nestedProgrammeSteps,
    audiovisualAudioProducers.preparedMediaSource.name,
    audiovisualAudioProducers.createSources.name,
    audiovisualAudioProducers.appendSource.name,
    audiovisualAudioProducers.programSource.name,
    audiovisualAudioProducers.createSources.name,
    audiovisualAudioProducers.appendSource.name,
    audiovisualAudioProducers.compile.name,
  ].sort());

  const htmlPlan = planBuild(linked, graph, ["nested.parent.html-program"]).plan;
  assert.deepEqual(htmlPlan.steps.map((step) => step.producer.name).sort(), [
    ...nestedProgrammeSteps,
    audiovisualHtmlProducers.preparedMediaSource.name,
    audiovisualHtmlProducers.createSources.name,
    audiovisualHtmlProducers.appendSource.name,
    audiovisualHtmlProducers.programSource.name,
    audiovisualHtmlProducers.createSources.name,
    audiovisualHtmlProducers.appendSource.name,
    audiovisualHtmlProducers.compile.name,
  ].sort());
});
