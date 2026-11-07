import assert from "node:assert/strict";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  NleRevisionConflict,
  applyNleTransaction,
  createComponentMaterialization,
  createNleProject,
  createMediaAssetMaterialization,
  findNleItem,
  parseNleProject,
  serializeNleProject,
  type NleComponentItem,
  type NleMediaItem,
  type NlePictureAppearance,
} from "../src/index.js";

const fullPicture: NlePictureAppearance = {
  layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
  effects: [],
};

const interviewAsset = { path: "./media/interview.media.json" } as const;

function prepared() {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
  return prepareMedia({
    id: "interview-prepared",
    source: { kind: "blob", resource: fixtureResource("nle:interview"), size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("4"), decodedUnitCount: 8,
      width: 100, height: 100, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }, {
      kind: "audio", index: 1, codecName: "aac",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("4"), sampleRate: 48_000,
      channels: 2, decodedSampleFrames: 192_000,
    }] },
    selection: { videoStreamIndex: 0, audioStreamIndex: 1, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
}

const mediaItem: NleMediaItem = {
  id: "interview-use",
  kind: "media",
  media: "interview",
  startFrame: 0,
  durationFrames: 6,
  localStartFrame: 0,
  enabled: true,
  picture: fullPicture,
  audio: { effects: [] },
};

const captionItem: NleComponentItem = {
  id: "caption-one",
  kind: "component",
  startFrame: 1,
  durationFrames: 2,
  localStartFrame: 0,
  enabled: true,
  component: { module: { name: "@example/caption", version: "1" }, name: "default" },
  parameters: { text: "Hello NLE", color: "white" },
  picture: {
    layout: { x: 10, y: 70, width: 80, height: 20, fit: "contain" },
    effects: [],
  },
};

const componentItem: NleComponentItem = {
  id: "title-card",
  kind: "component",
  startFrame: 0,
  durationFrames: 4,
  localStartFrame: 0,
  enabled: true,
  component: { module: { name: "@example/title", version: "1" }, name: "card" },
  parameters: { title: "Direct project state" },
  picture: fullPicture,
};

test("one revision stores Media and Component Items directly", () => {
  const project = createNleProject({
    id: "editorial",
    name: "Editorial",
    frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const edited = applyNleTransaction(project, { revision: 0, commands: [
    { kind: "media.add", media: { id: "interview", name: "Interview", asset: interviewAsset } },
    { kind: "track.add", track: { id: "picture-main", name: "Picture", kind: "picture",
      locked: false, muted: false, items: [] } },
    { kind: "item.add", track: "picture-main", item: mediaItem },
    { kind: "item.add", track: "picture-main", item: captionItem },
    { kind: "item.add", track: "picture-main", item: componentItem },
  ] });

  assert.equal(project.revision, 0);
  assert.equal(project.tracks.length, 0);
  assert.equal(edited.revision, 1);
  assert.deepEqual(edited.tracks[0]?.items.map((item) => item.kind), ["media", "component", "component"]);
  const text = serializeNleProject(edited);
  assert.match(text, /media\/interview\.media\.json/u);
  assert.doesNotMatch(text, /res_nle:interview|interpretation|BlobRef/u);
  assert.deepEqual(parseNleProject(text), edited);
});

test("move, trim and split are atomic direct NLE edits", () => {
  const base = applyNleTransaction(createNleProject({
    id: "edit-proof", name: "Edit proof", frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "media.add", media: { id: "interview", name: "Interview", asset: interviewAsset } },
    { kind: "track.add", track: { id: "picture-main", name: "Picture", kind: "picture",
      locked: false, muted: false, items: [mediaItem, componentItem] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.trim", id: "interview-use", edge: "start", frame: 1 },
    { kind: "item.split", id: "interview-use", frame: 3, rightId: "interview-use-right" },
    { kind: "item.move", ids: ["title-card"], deltaFrames: 2 },
  ] });

  assert.deepEqual(findNleItem(edited, "interview-use").item,
    { ...mediaItem, startFrame: 1, durationFrames: 2, localStartFrame: 1 });
  assert.deepEqual(findNleItem(edited, "interview-use-right").item,
    { ...mediaItem, id: "interview-use-right", startFrame: 3, durationFrames: 3, localStartFrame: 3 });
  assert.equal(findNleItem(edited, "title-card").item.startFrame, 2);

  assert.throws(() => applyNleTransaction(edited, { revision: 2, commands: [
    { kind: "item.move", ids: ["title-card"], deltaFrames: 10 },
    { kind: "item.add", track: "picture-main", item: { ...captionItem, id: "title-card" } },
  ] }));
  assert.equal(findNleItem(edited, "title-card").item.startFrame, 2);
  assert.throws(() => applyNleTransaction(edited, { revision: 1, commands: [] }), NleRevisionConflict);
});

test("Media Asset files and package Components materialize as inspectable NLE transactions", () => {
  const empty = createNleProject({
    id: "materialization", name: "Materialization", frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const withTrack = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "main", name: "Main", kind: "picture", locked: false, muted: false, items: [] },
  }] });
  const mediaTransaction = createMediaAssetMaterialization(withTrack, {
    mediaId: "interview", itemId: "interview-use", name: "Interview",
    asset: interviewAsset, resolved: prepared(),
    track: "main", atFrame: 2, picture: fullPicture,
  });
  assert.deepEqual(mediaTransaction.commands.map((command) => command.kind), ["media.add", "item.add"]);
  const withMedia = applyNleTransaction(withTrack, mediaTransaction);
  assert.deepEqual(findNleItem(withMedia, "interview-use").item, {
    id: "interview-use", kind: "media", media: "interview", startFrame: 2, durationFrames: 8,
    localStartFrame: 0, enabled: true, audio: { effects: [] }, picture: fullPicture,
  });

  const componentTransaction = createComponentMaterialization(withMedia, {
    id: "title", track: "main", atFrame: 1, durationFrames: 4,
    component: { module: { name: "@example/title", version: "1" }, name: "card" },
    parameters: { title: "Already materialized" }, layout: fullPicture.layout,
  });
  const finished = applyNleTransaction(withMedia, componentTransaction);
  assert.deepEqual(findNleItem(finished, "title").item, {
    id: "title", kind: "component", startFrame: 1, durationFrames: 4, localStartFrame: 0,
    enabled: true,
    component: { module: { name: "@example/title", version: "1" }, name: "card" },
    parameters: { title: "Already materialized" }, picture: fullPicture,
  });
});
