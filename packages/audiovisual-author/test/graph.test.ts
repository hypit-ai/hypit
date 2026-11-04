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
import { blobManifest } from "@hypit/hypit/blob";
import {
  createResolvedClosure,
  link,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import { canonicalize } from "@hypit/protocol";
import type { AuthorGraph, LinkedProgram, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { mediaManifest, mediaTypes, prepareMedia } from "@hypit/media";
import { spatialManifest } from "@hypit/spatial";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import { exactTemporalValue, sealLocalTemporalDomain, temporalManifest } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  audiovisualAuthorManifest,
  audiovisualAuthorComponent,
  audiovisualAuthorProducers,
  audiovisualAuthorTypes,
  compileAudiovisualAuthorSpec,
  createAudiovisualAuthorFragment,
  type AudiovisualAuthorSpec,
} from "../src/index.js";

const fixtureModule = { name: "example.future-source", version: "1" } as const;
const sourceRequestType = { module: fixtureModule, name: "SourceRequest" } satisfies TypeRef;
const resolveSourceProducer = { module: fixtureModule, name: "resolve-source" } satisfies ProducerRef;
const resolvePictureOperatorProducer = { module: fixtureModule, name: "resolve-picture-operator" } satisfies ProducerRef;
const resolveAudioOperatorProducer = { module: fixtureModule, name: "resolve-audio-operator" } satisfies ProducerRef;
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
    name: resolvePictureOperatorProducer.name,
    inputs: [],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }, {
    name: resolveAudioOperatorProducer.name,
    inputs: [],
    result: { kind: "output", name: "operator", type: audiovisualTypes.audioOperator },
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
  fixtureManifest,
]);
const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});
const space = sealLocalSpatialDomain({
  id: "main:picture-space",
  region: { x: 0, y: 0, width: 1920, height: 1080 },
});

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
      picture: { kind: "over", inputs: [
        { kind: "use", occurrence: "presenter", output: "picture" },
        { kind: "use", occurrence: "product", output: "picture" },
      ] },
    }, controlBindings: {} } },
    audio: { output: { kind: "apply", operator: "audio-effect", inputs: {
      signal: { kind: "use", occurrence: "presenter", output: "audio" },
    }, controlBindings: {} } },
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

function program(requestedDuration: number): LinkedProgram {
  return link(closure, [
    { id: "spec", type: audiovisualAuthorTypes.spec, value: canonicalize(spec()) },
    { id: "binding:a", type: audiovisualAuthorTypes.sourceBinding,
      value: canonicalize({ name: "generated-a-roll" }) },
    { id: "binding:b", type: audiovisualAuthorTypes.sourceBinding,
      value: canonicalize({ name: "product-material" }) },
    { id: "binding:picture-effect", type: audiovisualAuthorTypes.operatorBinding,
      value: canonicalize({ name: "picture-effect" }) },
    { id: "binding:audio-effect", type: audiovisualAuthorTypes.operatorBinding,
      value: canonicalize({ name: "audio-effect" }) },
    { id: "binding:natural", type: audiovisualAuthorTypes.reconstructionBinding,
      value: canonicalize({ name: "natural" }) },
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
    futureOperatorFragment(resolvePictureOperatorProducer, audiovisualTypes.pictureOperator), {
      id: "future-picture-operator", inputs: {},
    }), { operator: "future.picture-operator" });
  const audioOperator = bindAuthorFragment(elaborateGraphFragment(linked,
    futureOperatorFragment(resolveAudioOperatorProducer, audiovisualTypes.audioOperator), {
      id: "future-audio-operator", inputs: {},
    }), { operator: "future.audio-operator" });
  const reconstruction = bindAuthorFragment(elaborateGraphFragment(linked,
    futureOperatorFragment(
      resolveReconstructionProducer, audiovisualTypes.signalReconstruction, "reconstruction",
    ), {
      id: "future-reconstruction", inputs: {},
    }), { operator: "future.reconstruction" });
  const author = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualAuthorFragment({
      sources: 2, pictureOperators: 1, audioOperators: 1, reconstructions: 1,
    }), {
      id: "main",
      inputs: {
        spec: { kind: "record", id: "spec" },
        "binding-0001": { kind: "record", id: "binding:a" },
        "source-0001": { kind: "logical-output", id: "future.a" },
        "binding-0002": { kind: "record", id: "binding:b" },
        "source-0002": { kind: "logical-output", id: "future.b" },
        "picture-operator-binding-0001": { kind: "record", id: "binding:picture-effect" },
        "picture-operator-0001": { kind: "logical-output", id: "future.picture-operator" },
        "audio-operator-binding-0001": { kind: "record", id: "binding:audio-effect" },
        "audio-operator-0001": { kind: "logical-output", id: "future.audio-operator" },
        "reconstruction-binding-0001": { kind: "record", id: "binding:natural" },
        "reconstruction-0001": { kind: "logical-output", id: "future.reconstruction" },
      },
    }), { program: "main.program" });
  const contributions: readonly FragmentContribution[] = [
    a, b, pictureOperator, audioOperator, reconstruction, author,
  ];
  const merged = mergeFragmentContributions(
    { outputs: [], operations: [] }, ...contributions,
  );
  return sealAuthorGraph({ ...merged });
}

test("future typed Sources keep one fixed AuthorGraph and BuildPlan", () => {
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
    resolvePictureOperatorProducer.name,
    resolveAudioOperatorProducer.name,
    resolveReconstructionProducer.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.appendPictureOperator.name,
    audiovisualAuthorProducers.appendAudioOperator.name,
    audiovisualAuthorProducers.appendReconstruction.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.closeProgram.name,
  ].sort());
  const appendSteps = fivePlan.steps.filter((step) =>
    step.producer.name === audiovisualAuthorProducers.appendSource.name);
  assert.equal(appendSteps.length, 2);
  assert.equal(appendSteps.every((step) => Object.values(step.inputs)
    .some((record) => record.includes("future-a") || record.includes("future-b"))), true);
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

test("ordinary Producer facets materialize the future Source fold and finite close", async () => {
  const facet = (name: string) => audiovisualAuthorComponent.producers.find((candidate) =>
    candidate.producer.name === name)!;
  const created = await facet(audiovisualAuthorProducers.createBindings.name).handler({
    inputs: {},
  } as never);
  assert.equal(created.kind, "output");
  const appended = await facet(audiovisualAuthorProducers.appendSource.name).handler({
    inputs: {
      bindings: { value: created.value },
      binding: { value: canonicalize({ name: "generated" }) },
      source: { value: canonicalize(actualSource(49)) },
    },
  } as never);
  assert.equal(appended.kind, "output");
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
  const closed = await facet(audiovisualAuthorProducers.closeProgram.name).handler({
    inputs: { spec: { value: canonicalize(author) }, bindings: { value: appended.value } },
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
  const child = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualAuthorFragment({ sources: 1 }), {
      id: "nested-child",
      inputs: {
        spec: { kind: "record", id: "nested:child:spec" },
        "binding-0001": { kind: "record", id: "nested:child:binding" },
        "source-0001": { kind: "logical-output", id: "nested.media.source" },
      },
    }), { program: "nested.child.program" });
  const childSource = bindAuthorFragment(elaborateGraphFragment(linked,
    programSourceFragment, {
      id: "nested-child-source",
      inputs: { program: { kind: "logical-output", id: "nested.child.program" } },
    }), { source: "nested.child.source" });
  const parent = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualAuthorFragment({ sources: 1 }), {
      id: "nested-parent",
      inputs: {
        spec: { kind: "record", id: "nested:parent:spec" },
        "binding-0001": { kind: "record", id: "nested:parent:binding" },
        "source-0001": { kind: "logical-output", id: "nested.child.source" },
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
    { outputs: [], operations: [] }, media, child, childSource, parent,
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
    { id: "nested:child:binding", type: audiovisualAuthorTypes.sourceBinding,
      value: canonicalize({ name: "media" }) },
    { id: "nested:parent:binding", type: audiovisualAuthorTypes.sourceBinding,
      value: canonicalize({ name: "child" }) },
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
  assert.deepEqual(plan.steps.map((step) => step.producer.name).sort(), [
    audiovisualMediaProducers.source.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
    audiovisualProducers.programSource.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
  ].sort());

  const audioPlan = planBuild(linked, graph, ["nested.parent.audio-program"]).plan;
  assert.deepEqual(audioPlan.steps.map((step) => step.producer.name).sort(), [
    audiovisualMediaProducers.source.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
    audiovisualProducers.programSource.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
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
    audiovisualMediaProducers.source.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
    audiovisualProducers.programSource.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
    audiovisualHtmlProducers.preparedMediaSource.name,
    audiovisualHtmlProducers.createSources.name,
    audiovisualHtmlProducers.appendSource.name,
    audiovisualHtmlProducers.programSource.name,
    audiovisualHtmlProducers.createSources.name,
    audiovisualHtmlProducers.appendSource.name,
    audiovisualHtmlProducers.compile.name,
  ].sort());
});
