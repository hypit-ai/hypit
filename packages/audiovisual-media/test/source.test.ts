import assert from "node:assert/strict";
import test from "node:test";

import { audioType, pictureType } from "@hypit/audiovisual";
import { prepareMedia, SRGB_STRAIGHT_PICTURE } from "@hypit/media";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  audiovisualMediaComponent,
  audiovisualMediaProducers,
  programSourceFromPreparedMedia,
  programSourceFromStillPicture,
  resolveStillPictureSource,
} from "../src/index.js";

const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1_000 } });

function prepared() {
  return prepareMedia({
    id: "interview",
    source: { kind: "blob", resource: fixtureResource("audiovisual-media:interview"),
      size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("5000"), decodedUnitCount: 150,
      width: 1920, height: 1080, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }, {
      kind: "audio", index: 1, codecName: "aac",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("5000"),
      sampleRate: 48_000, channels: 2, decodedSampleFrames: 240_000,
    }] },
    selection: { videoStreamIndex: 0, audioStreamIndex: 1, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
}

test("PreparedMedia becomes one coordinated Picture and Audio ProgramSource", () => {
  const media = prepared();
  const source = programSourceFromPreparedMedia(media);
  assert.equal(source.id, "interview");
  assert.deepEqual(source.outputs.picture?.type, pictureType);
  assert.deepEqual(source.outputs.audio?.type, audioType);
  assert.equal(source.outputs.picture?.kind, "signal");
  assert.equal(source.outputs.audio?.kind, "signal");
  assert.deepEqual(source.outputs.picture.domain, media.domain);
  assert.deepEqual(source.outputs.audio.domain, media.domain);
  assert.deepEqual(source.outputs.picture?.spatialDomain?.region,
    { x: 0, y: 0, width: 1920, height: 1080 });
});

test("the adapter Producer publishes the same factual ProgramSource", async () => {
  const media = prepared();
  const producer = audiovisualMediaComponent.producers.find((candidate) =>
    candidate.producer.name === audiovisualMediaProducers.source.name)!;
  const result = await producer.handler({ inputs: { media: { value: media as never } } } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, programSourceFromPreparedMedia(media));
});

test("a still picture becomes a constant Picture Source without a fabricated clock", async () => {
  const spec = {
    id: "poster",
    space: sealLocalSpatialDomain({
      id: "poster:pixels",
      region: { x: 0, y: 0, width: 1200, height: 1600 },
    }),
  };
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("audiovisual-media:poster"),
    size: 1,
    mediaType: "image/png",
  };
  const picture = resolveStillPictureSource(spec, artifact, SRGB_STRAIGHT_PICTURE);
  const source = programSourceFromStillPicture(picture);
  assert.equal(source.id, "poster");
  assert.deepEqual(source.outputs, { picture: {
    kind: "constant",
    type: pictureType,
    spatialDomain: spec.space,
  } });
  assert.equal("domain" in source.outputs.picture!, false);

  const producer = (name: string) => audiovisualMediaComponent.producers.find((candidate) =>
    candidate.producer.name === name)!;
  const resolved = await producer(audiovisualMediaProducers.resolveStillPicture.name).handler({
    inputs: {
      spec: { value: spec as never },
      artifact: { value: artifact as never },
      picture: { value: SRGB_STRAIGHT_PICTURE as never },
    },
  } as never);
  assert.equal(resolved.kind, "output");
  const projected = await producer(audiovisualMediaProducers.stillPictureSource.name).handler({
    inputs: { picture: { value: resolved.value } },
  } as never);
  assert.equal(projected.kind, "output");
  assert.deepEqual(projected.value, source);
});
