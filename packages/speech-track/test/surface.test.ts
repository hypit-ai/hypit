import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import type { StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import type { SemanticTake } from "@hypit/speech";
import { speechTypes } from "@hypit/speech";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { decodeSpeechTrackSurface } from "@hypit/speech-track";

const take: SemanticTake = {
  media: {
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
    visual: {
      artifact: { kind: "blob", digest: fixtureDigest("track:take:video"), size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    },
    audio: {
      artifact: { kind: "blob", digest: fixtureDigest("track:take:audio"), size: 1, mediaType: "audio/wav" },
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
  if (path === "full") return {
    path,
    ref: { kind: "record", id: path },
    type: spatialTypes.frame,
    record: { id: path, type: spatialTypes.frame, value: { kind: "inline", value: {
      xPx: 0, yPx: 0, widthPx: 720, heightPx: 1280,
    } } },
  };
  if (path === "speech-style") return {
    path,
    ref: { kind: "record", id: path },
    type: svsRecipeType,
    record: { id: path, type: svsRecipeType, value: { kind: "inline", value: {
      path: "speech.base", properties: { fit: "cover" },
    } } },
  };
  return undefined;
}

test("Speech Track accepts only already-semantic Segment Takes", async () => {
  const element: StructuredElement = {
    kind: "element",
    name: "speech:Track",
    attributes: {
      id: "speech",
      "visual-frame": { kind: "reference", path: "full" },
      "visual-appearance": { kind: "reference", path: "speech-style" },
      "visual-z": "0",
    },
    children: [{
      kind: "element",
      name: "speech:Take",
      attributes: { source: { kind: "reference", path: "opening.take" } },
      children: [],
      range: { start: 20, end: 60 },
    }],
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
    visual: "speech.visual",
    audio: "speech.audio",
  });
  assert.equal(output.exports?.includes("speech.audio") ?? false, true);
});
