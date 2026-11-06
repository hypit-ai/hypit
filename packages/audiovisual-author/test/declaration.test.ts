import assert from "node:assert/strict";
import test from "node:test";

import { audiovisualTypes, type AudiovisualProgram } from "@hypit/audiovisual";
import type { AuthorProvenance, AuthorResolvedReference } from "@hypit/author";
import {
  exactTemporalValue,
  identityTemporalMap,
  sealLocalTemporalDomain,
  temporalTypes,
} from "@hypit/temporal";

import { compileSvmlDeclaration } from "../../../test/compile-svml-declaration.js";
import {
  audiovisualAuthorDeclarations,
  audiovisualAuthorModuleRef,
  locateAudiovisualNleSubject,
  realizeAudiovisualNleSubject,
} from "../src/index.js";

const sources = new Map<string, AuthorResolvedReference>([
  "video-source",
  "caption-one-source",
  "caption-two-source",
  "caption-three-source",
].map((name) => [name, {
  ref: { kind: "record", id: name },
  type: audiovisualTypes.programSource,
}]));

test("Programme syntax elaborates source, occurrence and event bounds into the forward DAG", async () => {
  const references = new Map<string, AuthorResolvedReference>([
    ...["video", "captions", "label", "callout"].map((name) => [name, {
      ref: { kind: "record" as const, id: `${name}-source` }, type: audiovisualTypes.programSource,
    }] as const),
    ["selection-event", {
      ref: { kind: "record" as const, id: "selection-event" }, type: temporalTypes.regionSet,
    }],
  ]);
  const decoded = await compileSvmlDeclaration({
    module: audiovisualAuthorModuleRef,
    alias: "video",
    compilers: audiovisualAuthorDeclarations,
    references,
    source: `video.Program "bound" {
  duration: @occurrence.video.end
  picture-domain: { width: 1920px, height: 1080px }
  source "video" { value: @video }
  source "captions" { value: @captions }
  source "label" { value: @label }
  source "callout" { value: @callout }
  occurrence "video" {
    source: @source.video
    at: 0s
    outputs: { picture: {} }
  }
  occurrence "captions" {
    source: @source.captions
    outputs: { picture: {} }
    time { bound: source to: @occurrence.video.picture }
  }
  occurrence "label" {
    source: @source.label
    outputs: { picture: {} }
    time { bound: occurrence to: @occurrence.video }
  }
  occurrence "callout" {
    source: @source.callout
    duration: 1s
    outputs: { picture: {} }
    time {
      bound: event
      through: @occurrence.video.picture
      event: @selection-event
      require: unique
      offset: 250ms
    }
  }
  picture "video" { use: @occurrence.video.picture }
  picture "captions" { use: @occurrence.captions.picture }
  picture "label" { use: @occurrence.label.picture }
  picture "callout" { use: @occurrence.callout.picture }
  picture "final" { over: [@picture.video, @picture.captions, @picture.label, @picture.callout] }
  output { picture: @picture.final }
}`,
  });
  const component = (suffix: string) => decoded.components.find((candidate) => candidate.id === `bound:${suffix}`)!;
  assert.equal(component("occurrence:captions:use").fragment.operations.some((operation) =>
    operation.producer.name === "bind-occurrence-use-to-source"), true);
  assert.equal(component("occurrence:label:use").fragment.operations.some((operation) =>
    operation.producer.name === "bind-occurrence-use-to-occurrence"), true);
  assert.equal(component("occurrence:callout:event-position").fragment.operations.some((operation) =>
    operation.producer.name === "preimage-map-regions"), true);
  assert.deepEqual(component("occurrence:callout:use").inputs.start, {
    kind: "component-output", component: "bound:occurrence:callout:event-position", output: "position",
  });
});

test("Programme Domain may consume an occurrence end as an ordinary forward graph value", async () => {
  const decoded = await compileSvmlDeclaration({
    module: audiovisualAuthorModuleRef,
    alias: "video",
    compilers: audiovisualAuthorDeclarations,
    references: new Map([["video-source", {
      ref: { kind: "record", id: "video-source" },
      type: audiovisualTypes.programSource,
    }]]),
    source: `video.Program "main" {
  duration: @occurrence.video.end
  picture-domain: { width: 1920px, height: 1080px }
  source "video" { value: @video-source }
  occurrence "video" {
    source: @source.video
    at: 0s
    outputs: { picture: {} }
  }
  picture "video" { use: @occurrence.video.picture }
  output { picture: @picture.video }
}`,
  });
  const domain = decoded.components.find((component) => component.id === "main:domain")!;
  assert.deepEqual(domain.inputs.duration, {
    kind: "component-output",
    component: "main:occurrence:video:use",
    output: "end",
  });
  const use = decoded.components.find((component) => component.id === "main:occurrence:video:use")!;
  assert.equal(use.fragment.operations.some((operation) =>
    operation.producer.name === "infer-occurrence-duration"), true);
});

test("Programme NLE endpoints resolve through Source declaration provenance, not Source identity", async () => {
  const body = `video.Program "main" {
  duration: 3s
  picture-domain: { width: 1920px, height: 1080px }
  source "captions" { value: @caption-component }
  occurrence "captions" {
    source: @source.captions
    at: 0s
    outputs: { picture: {} }
  }
  picture "captions" { use: @occurrence.captions.picture }
  output { picture: @picture.captions }
}`;
  const decoded = await compileSvmlDeclaration({
    module: audiovisualAuthorModuleRef,
    alias: "video",
    compilers: audiovisualAuthorDeclarations,
    references: new Map([["caption-component", {
      ref: { kind: "component-output", component: "captions:caption", output: "source" },
      type: audiovisualTypes.programSource,
    }]]),
    source: body,
  });
  const { svmlStructureFrontend } = await import("../../svml/src/index.js");
  const source = {
    id: "test.svml",
    name: "test.svml",
    bytes: new TextEncoder().encode(`module video from "${audiovisualAuthorModuleRef.name}@${audiovisualAuthorModuleRef.version}"

${body}
`),
  };
  const document = await svmlStructureFrontend.openStructure(source);
  const provenance: AuthorProvenance = {
    format: "hypit.author-provenance@1",
    elements: (decoded.provenance ?? []).map((element, index) => ({
      id: `element-${index}`, source: source.id, sourceName: source.name, range: element.range,
      records: element.records.map((id) => ({ local: id, id })),
      outputs: element.outputs.map((output) => ({ ...output, local: output.id })),
      inputs: element.inputs.map((input, inputIndex) => ({
        id: `element-${index}-input-${inputIndex}`, ...input,
      })),
    })),
  };
  const domain = sealLocalTemporalDomain({
    id: "main:time",
    duration: exactTemporalValue({ numerator: 3n, denominator: 1n }),
  });
  const mapping = identityTemporalMap(domain);
  const reference = locateAudiovisualNleSubject({
    document,
    provenance,
    programme: "main",
    endpoint: "main.occurrence.captions.picture",
  });
  assert.deepEqual(reference.owner, {
    kind: "component-output", component: "captions:caption", output: "source",
  });
  const location = realizeAudiovisualNleSubject(reference, {
      id: "main",
      occurrences: { captions: { selections: { picture: { kind: "signal", mapping } } } },
    } as unknown as AudiovisualProgram);
  assert.equal(location.occurrence, "captions");
  assert.equal(location.output, "picture");
  assert.deepEqual(location.target, { id: "main.occurrence.captions.picture", mapping });
});
