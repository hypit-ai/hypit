import assert from "node:assert/strict";
import test from "node:test";

import { sealAudioTrack, sealComposition } from "@hypit/composition";
import type { AudioClip } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { compileAudioProgram, verifyAudioProgram } from "../src/index.js";

const timeline = sealTimeline({ id: "story", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });

function clip(id: string): AudioClip {
  return {
    id,
    artifact: { kind: "blob", resource: fixtureResource(`audio-program:${id}`), size: 1, mediaType: "audio/wav" },
    target: { startSample: 0, endSampleExclusive: 48_000 },
    sourceTime: { sourceSampleFrames: 48_000, pieces: [{
      target: { startSample: 0, endSampleExclusive: 48_000 },
      sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
    }] },
    gain: 1, fadeInSamples: 0, fadeOutSamples: 0,
  };
}

test("AudioProgram identities preserve distinct graph paths containing delimiters", () => {
  const first = sealAudioTrack({ id: "a", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "b", clip: clip("c:d") }], output: { node: "b", port: "signal" },
  } });
  const second = sealAudioTrack({ id: "a:b", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "c", clip: clip("d") }], output: { node: "c", port: "signal" },
  } });
  const program = compileAudioProgram(sealComposition({
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [first, second],
  }), timeline);
  assert.doesNotThrow(() => verifyAudioProgram(program));
  assert.equal(new Set(program.clips.map((item) => item.id)).size, 2);
});

test("AudioProgram preserves repeated root signals without treating Track id as occurrence identity", () => {
  const track = sealAudioTrack({ id: "voice", timelineId: timeline.id, graph: {
    nodes: [{ kind: "source", id: "source", clip: clip("line") }],
    output: { node: "source", port: "signal" },
  } });
  const program = compileAudioProgram(sealComposition({
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [track, structuredClone(track)],
  }), timeline);
  assert.equal(program.clips.length, 2);
  assert.equal(new Set(program.clips.map((item) => item.id)).size, 2);
  assert.deepEqual(program.clips.map((item) => item.artifact.resource), [
    track.graph.nodes[0]!.kind === "source" ? track.graph.nodes[0]!.clip.artifact.resource : undefined,
    track.graph.nodes[0]!.kind === "source" ? track.graph.nodes[0]!.clip.artifact.resource : undefined,
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
  const authored = {
    id: "film", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [second, first],
  };
  assert.deepEqual(
    compileAudioProgram(authored, timeline),
    compileAudioProgram(sealComposition(authored), timeline),
  );
});
