import assert from "node:assert/strict";

import test from "node:test";

import { audioType, pictureType } from "@hypit/audiovisual";
import { prepareMedia } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  mediaAvirAuthorComponent,
  mediaAvirAuthorProducers,
  mediaAvirSourceAuthorDeclaration,
  programSourceFromPreparedMedia,
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
  const producer = mediaAvirAuthorComponent.producers.find((candidate) =>
    candidate.producer.name === mediaAvirAuthorProducers.source.name)!;
  const result = await producer.handler({ inputs: { media: { value: media as never } } } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, programSourceFromPreparedMedia(media));
});

test("the package-owned Source declaration exposes PreparedMedia to Program authoring", async () => {
  const declaration = {
    module: { name: "@hypit/media-avir-author" },
    name: "Source",
    label: "a-roll",
    fields: [{ name: "media", value: { kind: "reference" as const, path: "generated.source" } }],
    children: [],
    range: { start: 0, end: 1 },
  };
  assert.deepEqual(mediaAvirSourceAuthorDeclaration.bindings(declaration, { sourceName: "main.svml" }), [{
    name: "a-roll",
    ref: { kind: "component-output", component: "a-roll:media-source", output: "source" },
    type: { module: { name: "@hypit/audiovisual" }, name: "ProgramSource" },
  }]);
  const compiled = await mediaAvirSourceAuthorDeclaration.compile({
    sourceName: "main.svml",
    declaration,
    resolveReference: (path) => path === "generated.source" ? {
      ref: { kind: "component-output", component: "generated-media", output: "source" },
      type: { module: { name: "@hypit/media" }, name: "PreparedMedia" },
    } : undefined,
    resolveAsset: () => { throw new Error("unused"); },
    readAsset: () => { throw new Error("unused"); },
  });
  assert.equal(compiled.components[0]?.id, "a-roll:media-source");
  assert.deepEqual(compiled.components[0]?.inputs.media,
    { kind: "component-output", component: "generated-media", output: "source" });
});

test("a still image PreparedMedia becomes a constant Picture Source without a fabricated clock", async () => {
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("audiovisual-media:poster"),
    size: 1,
    mediaType: "image/png",
  };
  const media = prepareMedia({
    id: "poster", source: artifact,
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "png",
      disposition: { default: true, attachedPicture: false }, decodedUnitCount: 1,
      width: 1200, height: 1600, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0, picture: { colorPrimaries: "bt709", colorTransfer: "srgb",
        colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" },
    }] },
    selection: { videoStreamIndex: 0, picture: { colorPrimaries: "bt709", colorTransfer: "srgb",
      colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } },
  });
  const source = programSourceFromPreparedMedia(media);
  assert.equal(source.id, "poster");
  assert.deepEqual(source.outputs, { picture: {
    kind: "constant",
    type: pictureType,
    spatialDomain: { id: "poster:picture", region: { x: 0, y: 0, width: 1200, height: 1600 } },
  } });
  assert.equal("domain" in source.outputs.picture!, false);

  const producer = mediaAvirAuthorComponent.producers.find((candidate) =>
    candidate.producer.name === mediaAvirAuthorProducers.source.name)!;
  const projected = await producer.handler({ inputs: { media: { value: media as never } } } as never);
  assert.equal(projected.kind, "output");
  assert.deepEqual(projected.value, source);
});
