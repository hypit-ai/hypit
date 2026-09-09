import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import type { StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import type { SemanticTake } from "@hypit/speech";
import { speechTypes } from "@hypit/speech";
import { decodeSpeechTrackSurface } from "@hypit/speech-track";

const take: SemanticTake = {
  narrativeId: "test-narrative",
  media: {
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
    visual: {
      artifact: { kind: "blob", resource: fixtureResource("track:take:video"), size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    },
    audio: {
      artifact: { kind: "blob", resource: fixtureResource("track:take:audio"), size: 1, mediaType: "audio/wav" },
    },
  },
  segment: {
    segmentId: "opening",
    startAnchorId: "opening:start",
    endAnchorId: "opening:end",
    startFrame: 0,
    endFrameExclusive: 30,
  },
  tokens: [],
  anchors: [
    { identity: "opening:start", frame: 0 },
    { identity: "opening:end", frame: 30 },
  ],
};

function resolved(path: string): SurfaceResolvedReference | undefined {
  if (path === "opening.take") return {
    path,
    ref: { kind: "record", id: path },
    type: speechTypes.semanticTake,
    record: { id: path, type: speechTypes.semanticTake, value: { kind: "inline", value: take } },
  };
  return undefined;
}

test("Speech Track accepts only already-semantic Segment Takes", async () => {
  const element: StructuredElement = {
    kind: "element",
    name: "speech:Track",
    attributes: { id: "speech" },
    children: [{ kind: "element", name: "speech:Take",
      attributes: { source: { kind: "reference", path: "opening.take" } }, children: [], range: { start: 20, end: 60 } }],
    range: { start: 0, end: 70 },
  };
  const output = await decodeSpeechTrackSurface({
    sourceName: "main.svml",
    element,
    resolveReference: resolved,
    resolveAsset() { throw new Error("Speech Track does not resolve assets"); },
  });
  assert.deepEqual(output.components[0]?.outputs, {
    semantic: "speech.semantic",
    audio: "speech.audio",
  });
  assert.equal(output.exports?.includes("speech.audio") ?? false, true);
  assert.equal(output.records.length, 1);
  assert.deepEqual(output.fragments?.[0]?.inputs.map(input => input.name), ["header", "take-1"]);
});
