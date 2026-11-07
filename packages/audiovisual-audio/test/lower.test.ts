import assert from "node:assert/strict";
import test from "node:test";

import { verifyAudioProgram } from "@hypit/audio-program";
import {
  audioGainControlOperator,
  audioGainOperator,
  readAudioGainProcess,
} from "@hypit/audio-gain";
import { preservePitch } from "@hypit/audio-preserve-pitch";
import {
  audioType,
  audiovisualProgramSource,
  pointwiseOperatorTemporalSupport,
  sealAudiovisualProgram,
  sealOccurrence,
  type ProgramSource,
} from "@hypit/audiovisual";
import { prepareMedia } from "@hypit/media";
import { supportsLocalAudioProgram } from "@hypit/media-local";
import { canonicalize } from "@hypit/hypit/protocol";
import {
  exactTemporalValue,
  evaluateTemporalMap,
  sealLocalTemporalDomain,
  sealTemporalMap,
} from "@hypit/temporal/algebra";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  appendAudiovisualAudioSource,
  audiovisualAudioComponent,
  audiovisualAudioProducers,
  createAudiovisualAudioSourceSet,
  lowerAudiovisualAudioProgram,
  preparedMediaAudioSource,
  sealAudiovisualAudioSource,
} from "../src/index.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});
const programDomain = sealLocalTemporalDomain({ id: "audio-proof:time", duration: at(1) });
const sourceDomain = sealLocalTemporalDomain({ id: "voice:time", duration: at(1) });
const occurrenceDomain = sealLocalTemporalDomain({ id: "voice-use:time", duration: at(1) });
const source: ProgramSource = {
  id: sourceDomain.id,
  outputs: { audio: { kind: "signal", type: audioType, domain: sourceDomain } },
};
const artifact = { kind: "blob" as const, resource: fixtureResource("audiovisual-audio:voice"),
  size: 1, mediaType: "audio/wav" };
const media = prepareMedia({
  id: sourceDomain.id,
  source: artifact,
  inspection: { streams: [{
    kind: "audio", index: 0, codecName: "pcm_s16le",
    disposition: { default: true, attachedPicture: false },
    startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
    endPts: { ticks: "48000", timeBase: { numerator: 1, denominator: 48_000 } },
    sampleRate: 48_000, channels: 2, decodedSampleFrames: 48_000,
  }] },
  selection: { audioStreamIndex: 0, spanAuthority: "audio" },
});
const occurrence = sealOccurrence({
  id: "voice-use",
  source,
  domain: occurrenceDomain,
  placement: { parent: programDomain, start: at(0), active: { start: at(0), end: at(1) } },
  selections: { audio: { kind: "signal", mapping: sealTemporalMap({ stages: [{
    target: occurrenceDomain,
    source: sourceDomain,
    pieces: [{ target: { start: at(0), end: at(1) }, sourceAtStart: at(0),
      rate: { numerator: 1, denominator: 1 } }],
  }] }) } },
});

const programme = sealAudiovisualProgram({
  id: "audio-proof",
  domain: programDomain,
  occurrences: { [occurrence.id]: occurrence },
  audio: { root: "compressed", nodes: {
    voice: { kind: "use", occurrence: occurrence.id, output: "audio" },
    middle: { kind: "restrict", input: "voice", range: { start: at(1, 4), end: at(3, 4) } },
    compressed: { kind: "apply", operator: {
      id: "project:sidechain", inputs: ["programme", "detector"],
      temporalControls: {},
      temporalSupport: pointwiseOperatorTemporalSupport(["programme", "detector"]),
      program: { format: "project:sidechain@1", payload: {}, artifacts: [] },
    }, inputs: { programme: "middle", detector: "voice" }, controlMappings: {} },
  } },
});

function lower() {
  return lowerAudiovisualAudioProgram({
    program: programme,
    sampling: { sampleRate: 48_000 },
    sources: appendAudiovisualAudioSource(
      createAudiovisualAudioSourceSet(),
      preparedMediaAudioSource(media, { sampleRate: 48_000 }),
    ),
  });
}

test("the complete AVIR Audio DAG lowers continuously with restrict and named ports", () => {
  const program = lower();
  assert.doesNotThrow(() => verifyAudioProgram(program));
  assert.deepEqual(program.domain, programDomain);
  assert.deepEqual(program.sampling, { sampleRate: 48_000 });
  const restrict = program.graph.nodes.find((node) => node.kind === "restrict");
  assert.deepEqual(restrict?.range, { start: at(1, 4), end: at(3, 4) });
  const process = program.graph.nodes.find((node) => node.kind === "process");
  assert.deepEqual(Object.keys(process?.inputs ?? {}).sort(), ["detector", "programme"]);
  assert.equal(process?.program.format, "project:sidechain@1");
  assert.deepEqual(process?.temporalSupport,
    pointwiseOperatorTemporalSupport(["programme", "detector"]));
});

test("Audio Source implementation cannot own AVIR Occurrence placement", () => {
  const program = lower();
  const use = program.graph.nodes.find((node) => node.kind === "program");
  assert.deepEqual(use?.target, { start: at(0), end: at(1) });
  assert.equal(Object.hasOwn(use?.program ?? {}, "target"), false);
});

test("PreparedMedia and Audio Gain close through the real local terminal capability", () => {
  const gainProgramme = sealAudiovisualProgram({
    id: "gain-proof",
    domain: programDomain,
    occurrences: { [occurrence.id]: occurrence },
    audio: { root: "gain", nodes: {
      voice: { kind: "use", occurrence: occurrence.id, output: "audio" },
      gain: { kind: "apply", operator: audioGainOperator(0.5),
        inputs: { signal: "voice" }, controlMappings: {} },
    } },
  });
  const program = lowerAudiovisualAudioProgram({
    program: gainProgramme,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [preparedMediaAudioSource(media, { sampleRate: 48_000 })] },
  });
  const process = program.graph.nodes.find((node) => node.kind === "process");
  assert.equal(process === undefined ? undefined : readAudioGainProcess(process.program), 0.5);
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program })), { status: "supported" });
});

test("an occurrence-local Audio Control lowers as one Programme-to-Control Mapping", () => {
  const control = {
    domain: occurrenceDomain,
    segments: [{
      range: { start: at(0), end: at(1) },
      from: 0,
      to: 1,
      interpolation: { kind: "linear" as const },
    }],
  };
  const controlled = sealAudiovisualProgram({
    id: "controlled-gain-proof",
    domain: programDomain,
    occurrences: { [occurrence.id]: occurrence },
    audio: { root: "gain", nodes: {
      voice: { kind: "use", occurrence: occurrence.id, output: "audio" },
      gain: {
        kind: "apply",
        operator: audioGainControlOperator(control),
        inputs: { signal: "voice" },
        controlMappings: { gain: sealTemporalMap({ stages: [{
          target: programDomain,
          source: occurrenceDomain,
          pieces: [{ target: { start: at(0), end: at(1) }, sourceAtStart: at(0),
            rate: { numerator: 1, denominator: 1 } }],
        }] }) },
      },
    } },
  });
  const program = lowerAudiovisualAudioProgram({
    program: controlled,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [preparedMediaAudioSource(media, { sampleRate: 48_000 })] },
  });
  const process = program.graph.nodes.find((node) => node.kind === "process");
  assert.ok(process !== undefined);
  const mapping = process.controlMappings.gain;
  assert.ok(mapping !== undefined);
  assert.deepEqual(mapping.stages[0]?.target, programDomain);
  assert.deepEqual(mapping.stages.at(-1)?.source, occurrenceDomain);
  assert.deepEqual(evaluateTemporalMap(mapping, at(1, 2), "after")?.position, at(1, 2));
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program })), { status: "supported" });
});

test("a child AudiovisualProgram closes through ProgramSource into the parent Audio terminal", () => {
  const child = sealAudiovisualProgram({
    id: "child-programme",
    domain: programDomain,
    occurrences: { [occurrence.id]: occurrence },
    audio: { root: "voice", nodes: {
      voice: { kind: "use", occurrence: occurrence.id, output: "audio" },
    } },
  });
  const childAudio = lowerAudiovisualAudioProgram({
    program: child,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [preparedMediaAudioSource(media, { sampleRate: 48_000 })] },
  });
  const childSource = audiovisualProgramSource(child);
  const childUseDomain = sealLocalTemporalDomain({ id: "child-programme-use:time", duration: at(1) });
  const childUse = sealOccurrence({
    id: "child-programme-use",
    source: childSource,
    domain: childUseDomain,
    placement: { parent: programDomain, start: at(0), active: { start: at(0), end: at(1) } },
    selections: { audio: { kind: "signal", mapping: sealTemporalMap({ stages: [{
      target: childUseDomain,
      source: programDomain,
      pieces: [{ target: { start: at(0), end: at(1) }, sourceAtStart: at(0),
        rate: { numerator: 1, denominator: 1 } }],
    }] }) } },
  });
  const parent = sealAudiovisualProgram({
    id: "parent-programme",
    domain: programDomain,
    occurrences: { [childUse.id]: childUse },
    audio: { root: "child", nodes: {
      child: { kind: "use", occurrence: childUse.id, output: "audio" },
    } },
  });
  const parentAudio = lowerAudiovisualAudioProgram({
    program: parent,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [sealAudiovisualAudioSource({
      source: childSource.id,
      output: "audio",
      program: childAudio,
    })] },
  });

  const childNode = parentAudio.graph.nodes.find((node) => node.kind === "program");
  assert.ok(childNode !== undefined);
  assert.deepEqual(childNode.program, childAudio);
  assert.equal(childNode.program.graph.nodes.some((node) => node.kind === "program"), true);
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program: parentAudio })),
    { status: "supported" });
});

test("PreparedMedia lowering rebases a trimmed active range without rewriting its Source Map", () => {
  const trimmed = sealOccurrence({
    ...occurrence,
    id: "trimmed-voice",
    placement: { parent: programDomain, start: at(1, 8),
      active: { start: at(1, 4), end: at(3, 4) } },
  });
  const trimmedProgramme = sealAudiovisualProgram({
    id: "trimmed-proof",
    domain: programDomain,
    occurrences: { [trimmed.id]: trimmed },
    audio: { root: "voice", nodes: {
      voice: { kind: "use", occurrence: trimmed.id, output: "audio" },
    } },
  });
  const program = lowerAudiovisualAudioProgram({
    program: trimmedProgramme,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [preparedMediaAudioSource(media, { sampleRate: 48_000 })] },
  });
  const use = program.graph.nodes.find((node) => node.kind === "program");
  assert.ok(use !== undefined);
  const mediaSource = use?.program.graph.nodes.find((node) => node.kind === "source")?.media;
  assert.ok(mediaSource !== undefined);
  assert.deepEqual(use.target, { start: at(1, 8), end: at(5, 8) });
  assert.deepEqual(use.sampling.stages[0]?.target.duration, at(1, 2));
  assert.deepEqual(evaluateTemporalMap(use.sampling, at(0), "after")?.position, at(1, 4));
  assert.deepEqual(evaluateTemporalMap(use.sampling, at(1, 2), "before")?.position, at(3, 4));
  assert.deepEqual(mediaSource.preparation.stages[0]?.target, use.program.domain);
});

test("package-owned reconstruction stays on the mapped Programme use, not the media leaf", () => {
  const reconstructedOccurrence = sealOccurrence({
    ...occurrence,
    id: "natural-voice",
    selections: { audio: {
      ...occurrence.selections.audio as Extract<typeof occurrence.selections[string], { kind: "signal" }>,
      reconstruction: preservePitch(),
    } },
  });
  const reconstructedProgramme = sealAudiovisualProgram({
    id: "reconstruction-proof",
    domain: programDomain,
    occurrences: { [reconstructedOccurrence.id]: reconstructedOccurrence },
    audio: { root: "voice", nodes: {
      voice: { kind: "use", occurrence: reconstructedOccurrence.id, output: "audio" },
    } },
  });
  const program = lowerAudiovisualAudioProgram({
    program: reconstructedProgramme,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [preparedMediaAudioSource(media, { sampleRate: 48_000 })] },
  });
  const use = program.graph.nodes.find((node) => node.kind === "program");
  assert.ok(use !== undefined);
  assert.equal(use.reconstruction?.format, preservePitch().program.format);
  const leaf = use.program.graph.nodes.find((node) => node.kind === "source");
  assert.ok(leaf?.kind === "source");
  assert.equal(Object.hasOwn(leaf.media, "reconstruction"), false);
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program })), { status: "supported" });
});

test("typed terminal Producers carry Media Source implementation into AudioProgram", async () => {
  const facet = (name: string) => audiovisualAudioComponent.producers.find((candidate) =>
    candidate.producer.name === name)!;
  const output = canonicalize({ sampleRate: 48_000 });
  const sourceResult = await facet(audiovisualAudioProducers.preparedMediaSource.name).handler({
    inputs: { media: { value: canonicalize(media) }, output: { value: output } },
  } as never);
  assert.equal(sourceResult.kind, "output");
  const created = await facet(audiovisualAudioProducers.createSources.name).handler({
    inputs: {},
  } as never);
  assert.equal(created.kind, "output");
  const appended = await facet(audiovisualAudioProducers.appendSource.name).handler({
    inputs: { sources: { value: created.value }, source: { value: sourceResult.value } },
  } as never);
  assert.equal(appended.kind, "output");
  const compiled = await facet(audiovisualAudioProducers.compile.name).handler({
    inputs: {
      program: { value: canonicalize(programme) },
      sources: { value: appended.value },
      output: { value: output },
    },
  } as never);
  assert.equal(compiled.kind, "output");
  assert.doesNotThrow(() => verifyAudioProgram(compiled.value as never));
});
