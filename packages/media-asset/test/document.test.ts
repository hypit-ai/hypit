import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import { identityTemporalMap, sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  parseMediaAssetDocument,
  resolveMediaAssetDocument,
  serializeMediaAssetDocument,
  verifyMediaAssetDocument,
} from "../src/index.js";
import type { MediaAssetDocument } from "../src/index.js";
import { resolveMediaAssetDocumentFile } from "../src/node/index.js";

function document(): MediaAssetDocument {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
  const prepared = prepareMedia({
    id: "interview-prepared",
    source: { kind: "blob", resource: fixtureResource("asset-source"), size: 100, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("10"), decodedUnitCount: 300,
      width: 1920, height: 1080, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }, {
      kind: "audio", index: 1, codecName: "aac",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("10"), decodedSampleFrames: 480_000,
      sampleRate: 48_000, channels: 2,
    }] },
    selection: { videoStreamIndex: 0, audioStreamIndex: 1, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
  const { source: _source, ...filePrepared } = prepared;
  const speechDomain = sealLocalTemporalDomain({
    id: "speech-samples",
    duration: { ticks: "10", timeBase: { numerator: 1, denominator: 1 } },
  });
  return {
    format: "hypit.media-asset@1",
    id: "interview",
    media: {
      file: { path: "./interview.mp4", mediaType: "video/mp4" },
      prepared: filePrepared,
    },
    representations: [{
      id: "speech.zh",
      type: { module: { name: "@example/speech", version: "1" }, name: "Transcript" },
      document: { path: "./speech/transcript.json", mediaType: "application/json" },
      resources: {},
      binding: {
        temporal: { mapToMedia: {
          stages: [{
            ...identityTemporalMap(prepared.domain!).stages[0]!,
            target: speechDomain,
          }],
        } },
        audio: { member: "audio" },
      },
    }, {
      id: "objects",
      type: { module: { name: "@example/object-tracks", version: "1" }, name: "TrackedObjects" },
      document: { path: "./objects/objects.json", mediaType: "application/json" },
      resources: {
        masks: { path: "./objects/masks.mkv", mediaType: "video/x-matroska" },
      },
      binding: {
        temporal: { mapToMedia: identityTemporalMap(prepared.domain!) },
        picture: { member: "picture", space: "prepared-display-normalized" },
      },
    }],
  };
}

test("one file manifest carries independently typed time and object representations", () => {
  const value = document();
  verifyMediaAssetDocument(value);
  const text = serializeMediaAssetDocument(value);
  assert.deepEqual(parseMediaAssetDocument(text), value);
  assert.equal(text.includes("WhisperX"), false);
  assert.equal(text.includes("SAM"), false);
});

test("file resolution creates ephemeral BlobRefs without opening package documents", async () => {
  const requests: string[] = [];
  const asset = await resolveMediaAssetDocument(document(), (file, resolution) => {
    requests.push(`${resolution.kind}:${file.path}`);
    return {
      kind: "blob",
      resource: fixtureResource(`asset:${file.path}`),
      size: 10,
      mediaType: file.mediaType,
    };
  });
  assert.deepEqual(requests.sort(), [
    "media:./interview.mp4",
    "representation-resource:./objects/masks.mkv",
    "representation:./objects/objects.json",
    "representation:./speech/transcript.json",
  ]);
  assert.equal(asset.media.source.mediaType, "video/mp4");
  assert.deepEqual(asset.representations.map((representation) => representation.type.name),
    ["Transcript", "TrackedObjects"]);
});

test("manifest rejects guessed paths, duplicate ids and bindings outside the prepared media", () => {
  const base = document();
  assert.throws(() => verifyMediaAssetDocument({
    ...base,
    media: { ...base.media, file: { ...base.media.file, path: "../interview.mp4" } },
  }), /parent segments/u);
  assert.throws(() => verifyMediaAssetDocument({
    ...base,
    representations: [base.representations[0], base.representations[0]],
  }), /repeats representation speech.zh/u);
  const foreign = sealLocalTemporalDomain({
    id: "foreign",
    duration: { ticks: "10", timeBase: { numerator: 1, denominator: 1 } },
  });
  assert.throws(() => verifyMediaAssetDocument({
    ...base,
    representations: [{
      ...base.representations[0]!,
      binding: { temporal: { mapToMedia: identityTemporalMap(foreign) } },
    }],
  }), /must end in PreparedMedia domain/u);
});

test("resolved MIME type must agree with the file declaration", async () => {
  await assert.rejects(() => resolveMediaAssetDocument(document(), (file) => ({
    kind: "blob",
    resource: fixtureResource(`wrong:${file.path}`),
    size: 10,
    mediaType: "application/octet-stream",
  })), /resolved as application\/octet-stream/u);
});

test("node import anchors every explicit file at the manifest without interpreting representations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-asset-"));
  try {
    const value = document();
    await Promise.all([
      writeFile(join(directory, "interview.mp4"), "media"),
      writeFile(join(directory, "interview.media.json"), serializeMediaAssetDocument(value)),
      (async () => {
        await mkdir(join(directory, "speech"));
        await writeFile(join(directory, "speech", "transcript.json"), "speech");
      })(),
      (async () => {
        await mkdir(join(directory, "objects"));
        await writeFile(join(directory, "objects", "objects.json"), "objects");
        await writeFile(join(directory, "objects", "masks.mkv"), "masks");
      })(),
    ]);
    const opened: string[] = [];
    const asset = await resolveMediaAssetDocumentFile(join(directory, "interview.media.json"),
      async (path, mediaType, resolution) => {
        opened.push(`${resolution.kind}:${path}`);
        return {
          kind: "blob",
          resource: fixtureResource(`node:${path}`),
          size: (await stat(path)).size,
          mediaType,
        };
      });
    assert.equal(asset.id, "interview");
    assert.deepEqual(opened.map((value) => value.replace(`${directory}/`, "")).sort(), [
      "media:interview.mp4",
      "representation-resource:objects/masks.mkv",
      "representation:objects/objects.json",
      "representation:speech/transcript.json",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
