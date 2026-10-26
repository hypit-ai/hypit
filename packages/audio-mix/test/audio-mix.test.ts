import assert from "node:assert/strict";
import test from "node:test";

import { audioGraphFromClips, sealAudioTrack } from "@hypit/composition";
import { compileAudioProgram } from "@hypit/media-operations";
import { sealComposition } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";
import { appendAudioMixInput, assertAudioMixSet, createAudioMixSet, finalizeAudioMix } from "../src/index.js";
import { audioMixMarkupSurfaces, audioMixTypes, decodeAudioMixSurface } from "../src/index.js";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap } from "@hypit/temporal";

const timeline = sealTimeline({ id: "story", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
const audioDomain = { id: "fixture-materialization", duration: exactTemporalValueFromFrames(48_000,
  { frameRate: { numerator: 48_000, denominator: 1 } }) };
const source = sealAudioTrack({ timelineId: timeline.id, id: "voice", graph: audioGraphFromClips([{
  id: "line", subjectId: "line", source: {
    source: { kind: "blob", resource: fixtureResource("audio-mix:voice"), size: 1, mediaType: "audio/wav" },
    streamIndex: 0, presentationStart: exactTemporalZero(), sourceDomain: audioDomain,
    interpretation: { sampleRate: 48_000, channels: 2 },
  },
  preparation: identityTemporalMap(audioDomain),
  target: frameRangeFixture(0, 48_000, { numerator: 48_000, denominator: 1 }),
  sampling: frameSamplingMapFixture({ targetFrameRate: { numerator: 48_000, denominator: 1 }, targetFrames: 48_000,
    sourceFrameRate: { numerator: 48_000, denominator: 1 }, sourceFrames: 48_000,
    pieces: [{ target: { startFrame: 0, endFrameExclusive: 48_000 },
      sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 } }] }),
  gain: 1,
  fadeIn: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
  fadeOut: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
}]) });

test("Audio Mix closes explicit gain branches into one DAG and Film-level compilation preserves them", () => {
  let set = createAudioMixSet();
  set = appendAudioMixInput(set, timeline, { id: "dry", gain: 1 }, source);
  set = appendAudioMixInput(set, timeline, { id: "quiet-copy", gain: 0.25 }, source);
  const mixed = finalizeAudioMix(set, { id: "dialogue" }, timeline);
  assert.deepEqual([...mixed.graph.nodes.reduce((counts, node) => counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1),
    new Map<string, number>())], [["source", 2], ["process", 1], ["mix", 1]]);
  const program = compileAudioProgram(sealComposition({
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [mixed],
  }), timeline);
  assert.deepEqual(program.clips.map((clip) => clip.gain).sort(), [0.25, 1]);
});

test("Audio Mix keeps routing identity explicit and rejects duplicate Input ids", () => {
  const set = appendAudioMixInput(createAudioMixSet(), timeline, { id: "voice", gain: 1 }, source);
  assert.throws(() => appendAudioMixInput(set, timeline, { id: "voice", gain: 1 }, source), /repeats Input/u);
});

test("AudioMixSet refinement validates accumulated routing edges", () => {
  const set = appendAudioMixInput(createAudioMixSet(), timeline, { id: "voice", gain: 1 }, source);
  assert.doesNotThrow(() => assertAudioMixSet(set));
  assert.throws(() => assertAudioMixSet({ inputs: [set.inputs[0]!, structuredClone(set.inputs[0]!)] }),
    /repeats Input voice/u);
  assert.throws(() => assertAudioMixSet({ inputs: [{ spec: { id: "voice", gain: 1 }, track: undefined as never }] }),
    /AudioTrack is invalid/u);
});

test("Audio Mix identity is independent of declaration order while retaining repeated signals", () => {
  const mixed = (order: readonly [string, number][]) => {
    let set = createAudioMixSet();
    for (const [id, gain] of order) set = appendAudioMixInput(set, timeline, { id, gain }, source);
    return finalizeAudioMix(set, { id: "dialogue" }, timeline);
  };
  const forward = mixed([["dry", 1], ["quiet-copy", 0.25]]);
  const reversed = mixed([["quiet-copy", 0.25], ["dry", 1]]);
  assert.deepEqual(forward, reversed);
  assert.equal(forward.graph.nodes.find((node) => node.kind === "mix")?.inputs.length, 2);
  const program = (track: typeof forward) => compileAudioProgram(sealComposition({
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [track],
  }), timeline);
  assert.deepEqual(program(forward), program(reversed));
});

test("Audio Mix Surface declares and wires its complete author path", async () => {
  assert.deepEqual(audioMixMarkupSurfaces[0]?.outputs,
    [audioMixTypes.header, audioMixTypes.inputSpec, compositionTypes.audioTrack]);
  const range = { source: "mix.svml", start: 0, end: 1 };
  const output = await decodeAudioMixSurface({ sourceName: "mix.svml", element: {
    kind: "element", name: "mix:Track", range,
    attributes: { id: "dialogue", timeline: { kind: "reference", path: "story.timeline" } },
    children: [{ kind: "element", name: "mix:Input", range, children: [], attributes: {
      id: "voice", source: { kind: "reference", path: "voice.audio" }, gain: "0.5",
    } }],
  }, resolveReference: (path) => path === "story.timeline"
    ? { path, type: timelineTypes.timeline, ref: { kind: "record", id: path } }
    : path === "voice.audio"
      ? { path, type: compositionTypes.audioTrack, ref: { kind: "record", id: path } }
      : undefined,
  resolveAsset: () => { throw new Error("Audio Mix reads explicit references only"); } });
  assert.deepEqual(output.records.map((record) => record.type), [audioMixTypes.header, audioMixTypes.inputSpec]);
  assert.equal(output.components[0]?.outputs.audio, "dialogue.audio");
});

test("composed gain remains an ordinary finite signal value", () => {
  const set = appendAudioMixInput(createAudioMixSet(), timeline, { id: "amplified", gain: 100 }, source);
  const mixed = finalizeAudioMix(set, { id: "loud" }, timeline);
  const program = compileAudioProgram(sealComposition({
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [mixed],
  }), timeline);
  assert.equal(program.clips[0]?.gain, 100);
});

test("Audio Mix preserves structural identity when nested nodes use process-like names", () => {
  const namedGain = sealAudioTrack({ timelineId: timeline.id, id: "voice", graph: {
    nodes: [{ kind: "source", id: "gain", clip: source.graph.nodes.find((node) => node.kind === "source")!.clip }],
    output: { node: "gain", port: "signal" },
  } });
  const set = appendAudioMixInput(createAudioMixSet(), timeline, { id: "voice", gain: 0.5 }, namedGain);
  const mixed = finalizeAudioMix(set, { id: "dialogue" }, timeline);
  assert.equal(new Set(mixed.graph.nodes.map((node) => node.id)).size, mixed.graph.nodes.length);
  assert.equal(compileAudioProgram(sealComposition({
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [mixed],
  }), timeline).clips[0]?.gain, 0.5);
});
