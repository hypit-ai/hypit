import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import { identityTemporalMap, sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  attachMediaRepresentation,
  detachMediaRepresentation,
  parseMediaAssetDocument,
  replaceMediaRepresentation,
  resolveMediaAssetMedia,
  resolveMediaAssetDocument,
  serializeMediaAssetDocument,
  verifyMediaAssetDocument,
} from "../src/index.js";
import type { MediaAssetDocument } from "../src/index.js";
import {
  importMediaAssetFile,
  readMediaAssetDocumentFile,
  resolveMediaAssetDocumentFile,
} from "../src/node/index.js";

function document(): MediaAssetDocument {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
  const prepared = prepareMedia({
    id: "interview-media",
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
  const { source: _source, ...interpretation } = prepared;
  const speechDomain = sealLocalTemporalDomain({
    id: "speech-samples",
    duration: { ticks: "10", timeBase: { numerator: 1, denominator: 1 } },
  });
  return {
    format: "hypit.media-asset@1",
    id: "interview",
    media: {
      file: { path: "./interview.mp4", mediaType: "video/mp4" },
      interpretation,
    },
    representations: [{
      id: "speech.zh",
      type: { module: { name: "@example/speech" }, name: "Transcript" },
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
      type: { module: { name: "@example/object-tracks" }, name: "TrackedObjects" },
      document: { path: "./objects/objects.json", mediaType: "application/json" },
      resources: {
        masks: { path: "./objects/masks.mkv", mediaType: "video/x-matroska" },
      },
      binding: {
        temporal: { mapToMedia: identityTemporalMap(prepared.domain!) },
        picture: { member: "picture", space: "media-display-normalized" },
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
  assert.equal(text.toLowerCase().includes("prepared"), false);
});

test("Representation identity supports direct attach, replace and detach without versions", () => {
  const initial = document();
  const speech = initial.representations[0]!;
  const withoutSpeech = detachMediaRepresentation(initial, speech.id);
  assert.deepEqual(withoutSpeech.representations.map((value) => value.id), ["objects"]);

  const attached = attachMediaRepresentation(withoutSpeech, speech);
  assert.deepEqual(attached.representations.map((value) => value.id), ["objects", "speech.zh"]);
  assert.throws(() => attachMediaRepresentation(attached, speech), /already has Representation speech\.zh/u);

  const replacement = {
    ...speech,
    document: { ...speech.document, path: "./speech/corrected.json" },
  };
  const replaced = replaceMediaRepresentation(attached, "speech.zh", replacement);
  assert.equal(replaced.representations.find((value) => value.id === "speech.zh")?.document.path,
    "./speech/corrected.json");
  assert.throws(() => replaceMediaRepresentation(attached, "missing", replacement),
    /has no Representation missing/u);
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

test("media-only resolution does not stage optional representation files", async () => {
  const requests: string[] = [];
  const media = await resolveMediaAssetMedia(document(), (file, resolution) => {
    requests.push(`${resolution.kind}:${file.path}`);
    return {
      kind: "blob",
      resource: fixtureResource(`media-only:${file.path}`),
      size: 10,
      mediaType: file.mediaType,
    };
  });
  assert.deepEqual(requests, ["media:./interview.mp4"]);
  assert.equal(media.source.mediaType, "video/mp4");
});

test("manifest rejects guessed paths, duplicate ids and bindings outside the media interpretation", () => {
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
  }), /must end in media domain/u);
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

test("one cancellable import task copies bytes and publishes an interpretation-only manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-import-"));
  try {
    const incoming = join(directory, "incoming", "still.png");
    const asset = join(directory, "project", "media", "still.media.json");
    await mkdir(join(directory, "incoming"));
    await writeFile(incoming, "picture-bytes");
    const stages: string[] = [];
    const result = await importMediaAssetFile({
      sourcePath: incoming,
      assetPath: asset,
      id: "still",
      mediaType: "image/png",
      filePolicy: "copy",
    }, {
      inspect: async () => ({ streams: [{
        kind: "video", index: 0, codecName: "png",
        disposition: { default: true, attachedPicture: false },
        decodedUnitCount: 1, width: 8, height: 6,
        sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
        picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
          colorRange: "full", bitDepth: 8, alphaMode: "straight" },
      }] }),
      select: () => ({
        video: { mode: "primary-picture" }, audio: { mode: "none" }, picture: { mode: "source" },
      }),
    }, { progress: (update) => stages.push(update.stage) });
    assert.deepEqual(stages, ["inspect", "interpret", "copy", "publish", "complete"]);
    assert.equal(await readFile(result.mediaPath, "utf8"), "picture-bytes");
    const written = await readMediaAssetDocumentFile(asset);
    assert.equal(written.media.file.path, "still.png");
    assert.equal(written.media.interpretation.picture?.kind, "constant");
    assert.equal(JSON.stringify(written).toLowerCase().includes("prepared"), false);
    await assert.rejects(() => importMediaAssetFile({
      sourcePath: incoming, assetPath: asset, id: "again", mediaType: "image/png", filePolicy: "copy",
    }, { inspect: async () => ({ streams: [] }), select: () => { throw new Error("must not select"); } }),
    /already exists/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("link import rejects outside files and cancellation publishes nothing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-media-import-policy-"));
  try {
    const source = join(directory, "outside.png");
    const asset = join(directory, "project", "media", "still.media.json");
    await writeFile(source, "picture");
    const host = {
      inspect: async () => ({ streams: [] }),
      select: () => { throw new Error("selection should not be reached"); },
    };
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(() => importMediaAssetFile({
      sourcePath: source, assetPath: asset, id: "still", mediaType: "image/png", filePolicy: "copy",
    }, host, { signal: cancelled.signal }), /abort/u);
    assert.equal(await stat(asset).then(() => true, () => false), false);

    await assert.rejects(() => importMediaAssetFile({
      sourcePath: source, assetPath: asset, id: "still", mediaType: "image/png", filePolicy: "link",
    }, {
      inspect: async () => ({ streams: [] }),
      select: () => ({ video: { mode: "none" }, audio: { mode: "none" }, picture: { mode: "none" } }),
    }), /must lie below/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
