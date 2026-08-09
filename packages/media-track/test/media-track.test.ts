import assert from "node:assert/strict";
import test from "node:test";

import { sealProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { BlobRef } from "@narratage/protocol";
import {
  appendFullStillMediaItem,
  createMediaTrackSet,
  finalizeMediaTrack,
  renderMediaTrack,
  sealMediaStillItemSpec,
  sealMediaTrackHeader,
  stillMediaTrackFragment,
} from "@narratage/media-track";

const space = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});
const source: BlobRef = {
  kind: "blob",
  digest: digestOf("media-track:still"),
  size: 4_096,
  mediaType: "image/png",
};
const extent = { contract: "svml.intrinsic-extent@1" as const, widthPx: 800, heightPx: 800 };
const frame = { contract: "svml.spatial-frame@1" as const, xPx: 100, yPx: 200, widthPx: 400, heightPx: 300 };
const fit = {
  contract: "svml.content-fit@1" as const,
  sizing: "contain" as const,
  framePoint: { x: 0.5, y: 0.5 },
  contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 },
  constraint: "bounded" as const,
};

test("one still Media Item consumes explicit time, source, extent, Frame and Fit edges", () => {
  const header = sealMediaTrackHeader({ contract: "svml.media-track-header@1", id: "proof" });
  const spec = sealMediaStillItemSpec({
    contract: "svml.media-still-item-spec@1",
    id: "product",
    stackingOrder: 40,
    presentation: { clip: "frame", fill: { kind: "transparent" } },
  });
  const program = finalizeMediaTrack(appendFullStillMediaItem(
    createMediaTrackSet(), header, space, source, extent, frame, fit, spec,
  ), header);
  assert.deepEqual(program.items[0]?.span, { startFrame: 0, endFrameExclusive: 120 });
  assert.equal(program.items[0]?.layers[0]?.artifact.digest, source.digest);
  const track = renderMediaTrack(space, program);
  assert.equal(track.presents.length, 1);
  assert.deepEqual(track.presents[0]?.stacking, { order: 40, tieBreak: "proof:product" });
  const root = track.presents[0]?.elements[0];
  const image = track.presents[0]?.elements[1];
  assert.equal(root?.kind, "box");
  assert.deepEqual(root?.style, [
    { name: "height", value: "300px" },
    { name: "left", value: "100px" },
    { name: "overflow", value: "hidden" },
    { name: "position", value: "absolute" },
    { name: "top", value: "200px" },
    { name: "width", value: "400px" },
  ]);
  assert.equal(image?.kind, "image");
  assert.deepEqual(image?.style, [
    { name: "height", value: "300px" },
    { name: "left", value: "50px" },
    { name: "position", value: "absolute" },
    { name: "top", value: "0px" },
    { name: "width", value: "300px" },
  ]);
});

test("the first Media Fragment exposes every external dependency as a semantic input", () => {
  assert.deepEqual(stillMediaTrackFragment.inputs.map((input) => input.name), [
    "extent", "fit", "frame", "header", "source", "space", "spec",
  ]);
  assert.deepEqual(stillMediaTrackFragment.exports[0]?.semanticInputs, [
    "extent", "fit", "frame", "header", "source", "space", "spec",
  ]);
});

test("a still Item rejects non-image bytes instead of inferring from a filename or Provider", () => {
  const header = sealMediaTrackHeader({ contract: "svml.media-track-header@1", id: "proof" });
  const spec = sealMediaStillItemSpec({
    contract: "svml.media-still-item-spec@1", id: "bad", stackingOrder: 0,
    presentation: { clip: "frame", fill: { kind: "transparent" } },
  });
  assert.throws(() => appendFullStillMediaItem(
    createMediaTrackSet(), header, space,
    { ...source, mediaType: "video/mp4" }, extent, frame, fit, spec,
  ), /image BlobArtifact/u);
});
