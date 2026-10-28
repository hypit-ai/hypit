import assert from "node:assert/strict";
import test from "node:test";

import { audioGainProcess, sealAudioTrack, sealComposition } from "@hypit/composition";
import type { AudioClip } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { audioProgramGainRoutes, audioProgramSourceClips, compileAudioProgram, verifyAudioProgram } from "../src/index.js";
import { exactTemporalZero, identityTemporalMap } from "@hypit/temporal";

const timeline = sealTimeline({ id: "story", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });

function clip(id: string): AudioClip {
  const sampling = frameSamplingMapFixture({
    targetFrameRate: { numerator: 48_000, denominator: 1 }, targetFrames: 48_000,
    sourceFrameRate: { numerator: 48_000, denominator: 1 }, sourceFrames: 48_000,
    pieces: [{ target: { startFrame: 0, endFrameExclusive: 48_000 },
      sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 } }],
  });
  const domain = sampling.stages[0]!.source;
  return {
    id,
    source: {
      source: { kind: "blob", resource: fixtureResource(`audio-program:${id}`), size: 1, mediaType: "audio/wav" },
      streamIndex: 0, presentationStart: exactTemporalZero(), sourceDomain: domain,
      interpretation: { sampleRate: 48_000, channels: 2 },
    },
    preparation: identityTemporalMap(domain),
    target: frameRangeFixture(0, 48_000, { numerator: 48_000, denominator: 1 }),
    sampling,
    gain: 1,
    fadeIn: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    fadeOut: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
  };
}

test("AudioProgram identities preserve distinct graph paths containing delimiters", () => {
  const first = sealAudioTrack({ id: "a", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "b", clip: clip("c:d") }], output: { node: "b", port: "signal" },
  } });
  const second = sealAudioTrack({ id: "a:b", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "c", clip: clip("d") }], output: { node: "c", port: "signal" },
  } });
  const program = compileAudioProgram(sealComposition({ id: "film", visual: { canvas: { width: 1, height: 1, clearColor: "#000000" }, root: { members: [] } }, audio: { contributions: [first, second] } }).audio, timeline);
  assert.doesNotThrow(() => verifyAudioProgram(program));
  assert.equal(new Set(audioProgramSourceClips(program).map((item) => item.id)).size, 2);
});

test("AudioProgram preserves repeated root signals without treating Track id as occurrence identity", () => {
  const track = sealAudioTrack({ id: "voice", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "source", clip: clip("line") }],
    output: { node: "source", port: "signal" },
  } });
  const program = compileAudioProgram(sealComposition({ id: "film", visual: { canvas: { width: 1, height: 1, clearColor: "#000000" }, root: { members: [] } }, audio: { contributions: [track, structuredClone(track)] } }).audio, timeline);
  const clips = audioProgramSourceClips(program);
  assert.equal(clips.length, 2);
  assert.equal(new Set(clips.map((item) => item.id)).size, 2);
  assert.deepEqual(clips.map((item) => item.source.source.resource), [
    track.graph.nodes[0]!.kind === "source" ? track.graph.nodes[0]!.clip.source.source.resource : undefined,
    track.graph.nodes[0]!.kind === "source" ? track.graph.nodes[0]!.clip.source.source.resource : undefined,
  ]);
});

test("AudioProgram canonicalizes a valid root signal multiset regardless of its constructor", () => {
  const first = sealAudioTrack({ id: "first", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "source", clip: clip("first") }],
    output: { node: "source", port: "signal" },
  } });
  const second = sealAudioTrack({ id: "second", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "source", clip: clip("second") }],
    output: { node: "source", port: "signal" },
  } });
  const authored = { contributions: [second, first] };
  const composition = sealComposition({ id: "film",
    visual: { canvas: { width: 1, height: 1, clearColor: "#000000" }, root: { members: [] } },
    audio: authored });
  assert.deepEqual(
    compileAudioProgram(authored, timeline),
    compileAudioProgram(composition.audio, timeline),
  );
});

test("AudioProgram preserves one shared source across explicit gain branches", () => {
  const track = sealAudioTrack({ id: "parallel", timelineId: timeline.id, graph: {
    nodes: [
      { kind: "source", id: "source", clip: clip("line") },
      { kind: "process", id: "dry", inputs: { signal: { node: "source", port: "signal" } },
        program: audioGainProcess(0.5) },
      { kind: "process", id: "send", inputs: { signal: { node: "source", port: "signal" } },
        program: audioGainProcess(0.25) },
      { kind: "mix", id: "return", inputs: [
        { node: "dry", port: "signal" }, { node: "send", port: "signal" },
      ] },
    ],
    output: { node: "return", port: "signal" },
  } });
  const program = compileAudioProgram({ contributions: [track] }, timeline);
  assert.equal(audioProgramSourceClips(program).length, 1);
  assert.deepEqual(audioProgramGainRoutes(program).map((route) => route.gain).sort(), [0.25, 0.5]);
});

test("AudioProgram retains package-owned Process programmes for endpoint capability decisions", () => {
  const track = sealAudioTrack({ id: "processed", timelineId: timeline.id, graph: {
    nodes: [
      { kind: "source", id: "source", clip: clip("line") },
      { kind: "process", id: "effect", inputs: { signal: { node: "source", port: "signal" } },
        program: { format: "example.audio-effect@1", payload: { amount: 0.5 }, artifacts: [] } },
    ],
    output: { node: "effect", port: "signal" },
  } });
  const program = compileAudioProgram({ contributions: [track] }, timeline);
  assert.equal(program.graph.nodes.find((node) => node.kind === "process")?.program.format,
    "example.audio-effect@1");
  assert.throws(() => audioProgramGainRoutes(program), /does not support Process format/u);
});
