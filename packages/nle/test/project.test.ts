import assert from "node:assert/strict";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";

import {
  NleRevisionConflict,
  applyNleTransaction,
  createComponentMaterialization,
  createNleProject,
  createMediaAssetMaterialization,
  findNleItem,
  nleProjectDuration,
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
const frame = (value: number) => exactTemporalValueFromFrames(value, {
  frameRate: { numerator: 2, denominator: 1 },
});
const third = (ticks: number) => ({ ticks: String(ticks), timeBase: { numerator: 1, denominator: 3 } });
const exactSecond = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;

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
  start: frame(0),
  duration: frame(6),
  localStart: frame(0),
  enabled: true,
  picture: fullPicture,
  audio: { effects: [] },
};

const captionItem: NleComponentItem = {
  id: "caption-one",
  kind: "component",
  start: frame(1),
  duration: frame(2),
  localStart: frame(0),
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
  start: frame(0),
  duration: frame(4),
  localStart: frame(0),
  enabled: true,
  component: { module: { name: "@example/title", version: "1" }, name: "card" },
  parameters: { title: "Direct project state" },
  picture: fullPicture,
};

test("one revision stores Media and Component Items directly", () => {
  const project = createNleProject({
    id: "editorial",
    name: "Editorial",
    editRate: { numerator: 2, denominator: 1 },
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

test("edit rate is only an editing grid and never quantizes exact project time", () => {
  const base = createNleProject({
    id: "exact-time", name: "Exact time", editRate: { numerator: 24, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const edited = applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add",
    track: {
      id: "picture", name: "Picture", kind: "picture", locked: false, muted: false,
      items: [{
        ...componentItem,
        start: third(1),
        duration: third(2),
        localStart: third(0),
      }],
    },
  }] });

  assert.deepEqual(findNleItem(edited, "title-card").item.start, third(1));
  assert.deepEqual(nleProjectDuration(edited), exactSecond);
  const anotherGrid = parseNleProject(serializeNleProject({
    ...edited,
    editRate: { numerator: 60, denominator: 1 },
  }));
  assert.deepEqual(findNleItem(anotherGrid, "title-card").item.start, third(1));
  assert.deepEqual(nleProjectDuration(anotherGrid), exactSecond);
});

test("move, trim and split are atomic direct NLE edits", () => {
  const base = applyNleTransaction(createNleProject({
    id: "edit-proof", name: "Edit proof", editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "media.add", media: { id: "interview", name: "Interview", asset: interviewAsset } },
    { kind: "track.add", track: { id: "picture-main", name: "Picture", kind: "picture",
      locked: false, muted: false, items: [mediaItem, componentItem] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.trim", id: "interview-use", edge: "start", at: frame(1) },
    { kind: "item.split", id: "interview-use", at: frame(3), rightId: "interview-use-right" },
    { kind: "item.move", ids: ["title-card"], delta: frame(2) },
  ] });

  assert.deepEqual(findNleItem(edited, "interview-use").item,
    { ...mediaItem, start: frame(1), duration: frame(2), localStart: frame(1) });
  assert.deepEqual(findNleItem(edited, "interview-use-right").item,
    { ...mediaItem, id: "interview-use-right", start: frame(3), duration: frame(3), localStart: frame(3) });
  assert.deepEqual(findNleItem(edited, "title-card").item.start, frame(2));

  assert.throws(() => applyNleTransaction(edited, { revision: 2, commands: [
    { kind: "item.move", ids: ["title-card"], delta: frame(10) },
    { kind: "item.add", track: "picture-main", item: { ...captionItem, id: "title-card" } },
  ] }));
  assert.deepEqual(findNleItem(edited, "title-card").item.start, frame(2));
  assert.throws(() => applyNleTransaction(edited, { revision: 1, commands: [] }), NleRevisionConflict);
});

test("project, media and Track facts remain directly editable", () => {
  const base = applyNleTransaction(createNleProject({
    id: "direct-facts", name: "Before", editRate: { numerator: 24, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "media.add", media: { id: "interview", name: "Before", asset: interviewAsset } },
    { kind: "track.add", track: { id: "picture", name: "V1", kind: "picture",
      locked: false, muted: false, items: [] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "project.update", name: "After", editRate: { numerator: 60, denominator: 1 },
      canvas: { width: 200, height: 100, clearColor: "transparent" } },
    { kind: "media.rename", id: "interview", name: "Renamed interview" },
    { kind: "media.relink", id: "interview", asset: { path: "./media/relinked.media.json" } },
    { kind: "track.update", id: "picture", name: "Primary picture", locked: true, muted: true },
  ] });

  assert.equal(edited.name, "After");
  assert.deepEqual(edited.editRate, { numerator: 60, denominator: 1 });
  assert.deepEqual(edited.canvas, { width: 200, height: 100, clearColor: "transparent" });
  assert.deepEqual(edited.media[0], {
    id: "interview", name: "Renamed interview", asset: { path: "./media/relinked.media.json" },
  });
  assert.deepEqual(edited.tracks[0], {
    id: "picture", name: "Primary picture", kind: "picture", locked: true, muted: true, items: [],
  });

  const unlocked = applyNleTransaction(edited, { revision: 2, commands: [
    { kind: "track.update", id: "picture", locked: false },
  ] });
  assert.equal(unlocked.tracks[0]?.locked, false);
});

test("slip and detach-audio preserve direct programme and source time facts", () => {
  const base = applyNleTransaction(createNleProject({
    id: "source-time-edits", name: "Source time edits", editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "media.add", media: { id: "interview", name: "Interview", asset: interviewAsset } },
    { kind: "track.add", track: { id: "picture", name: "V1", kind: "picture",
      locked: false, muted: false, items: [mediaItem] } },
    { kind: "track.add", track: { id: "audio", name: "A1", kind: "audio",
      locked: false, muted: false, items: [] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.slip", id: "interview-use", delta: frame(1) },
    { kind: "item.detach-audio", id: "interview-use", audioItemId: "interview-audio", track: "audio" },
  ] });
  const picture = findNleItem(edited, "interview-use");
  const audio = findNleItem(edited, "interview-audio");

  assert.equal(picture.track.id, "picture");
  assert.equal(picture.item.picture !== undefined, true);
  assert.equal(picture.item.audio, undefined);
  assert.equal(audio.track.id, "audio");
  assert.equal(audio.item.picture, undefined);
  assert.deepEqual(audio.item.audio, { effects: [] });
  assert.deepEqual(picture.item.localStart, frame(1));
  assert.deepEqual(audio.item.localStart, frame(1));
  assert.deepEqual(audio.item.start, picture.item.start);
  assert.deepEqual(audio.item.duration, picture.item.duration);
});

test("roll moves one shared cut while preserving the two outer Item edges", () => {
  const left: NleComponentItem = {
    ...componentItem, id: "left", start: frame(0), duration: frame(4), localStart: frame(0),
  };
  const right: NleComponentItem = {
    ...componentItem, id: "right", start: frame(4), duration: frame(4), localStart: frame(2),
  };
  const base = applyNleTransaction(createNleProject({
    id: "roll-edit", name: "Roll edit", editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "V1", kind: "picture", locked: false, muted: false,
      items: [left, right] },
  }] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.roll", left: "left", right: "right", at: frame(5) },
  ] });

  assert.deepEqual(findNleItem(edited, "left").item, { ...left, duration: frame(5) });
  assert.deepEqual(findNleItem(edited, "right").item, {
    ...right, start: frame(5), duration: frame(3), localStart: frame(3),
  });
  assert.deepEqual(nleProjectDuration(edited), frame(8));
  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.roll", left: "left", right: "right", at: frame(8) },
  ] }), /outer Item edges/u);
});

test("ripple-trim moves only the caller's explicit scope", () => {
  const target: NleComponentItem = {
    ...componentItem, id: "target", start: frame(0), duration: frame(4), localStart: frame(0),
  };
  const following: NleComponentItem = {
    ...componentItem, id: "following", start: frame(4), duration: frame(2), localStart: frame(0),
  };
  const overlay: NleComponentItem = {
    ...componentItem, id: "overlay", start: frame(6), duration: frame(2), localStart: frame(0),
  };
  const untouched: NleComponentItem = {
    ...componentItem, id: "untouched", start: frame(8), duration: frame(2), localStart: frame(0),
  };
  const base = applyNleTransaction(createNleProject({
    id: "ripple-edit", name: "Ripple edit", editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: { id: "main", name: "V1", kind: "picture",
      locked: false, muted: false, items: [target, following, untouched] } },
    { kind: "track.add", track: { id: "overlay-track", name: "V2", kind: "picture",
      locked: true, muted: false, items: [overlay] } },
  ] });

  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [{
    kind: "item.ripple-trim", id: "target", edge: "end", at: frame(3),
    scope: ["following", "overlay"],
  }] }), /is locked/u);
  assert.deepEqual(findNleItem(base, "target").item, target);

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "track.update", id: "overlay-track", locked: false },
    { kind: "item.ripple-trim", id: "target", edge: "end", at: frame(3),
      scope: ["following", "overlay"] },
  ] });
  assert.deepEqual(findNleItem(edited, "target").item.duration, frame(3));
  assert.deepEqual(findNleItem(edited, "following").item.start, frame(3));
  assert.deepEqual(findNleItem(edited, "overlay").item.start, frame(5));
  assert.deepEqual(findNleItem(edited, "untouched").item.start, frame(8));
});

test("Track lock protects Transition, matte and Group relations and can be explicitly released", () => {
  const operator = { module: { name: "@example/relations", version: "1" }, name: "default" } as const;
  const item = (id: string, start: number, duration: number): NleComponentItem => ({
    ...componentItem, id, start: frame(start), duration: frame(duration),
  });
  const base = applyNleTransaction(createNleProject({
    id: "locked-relations", name: "Locked relations", editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "V1", kind: "picture", locked: true, muted: false, items: [
      item("outgoing", 0, 4), item("incoming", 2, 4), item("matte-source", 0, 8),
    ] },
  }] });
  const transition = { id: "transition", outgoing: "outgoing", incoming: "incoming",
    operator, parameters: {} } as const;
  const matte = { id: "matte", content: "incoming", matte: "matte-source",
    operator, parameters: {} } as const;
  const group = { id: "group", name: "Pair", items: ["outgoing", "incoming"] } as const;

  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [
    { kind: "transition.add", transition },
  ] }), /is locked/u);
  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [
    { kind: "matte.add", matte },
  ] }), /is locked/u);
  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [
    { kind: "group.add", group },
  ] }), /is locked/u);

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "track.update", id: "picture", locked: false },
    { kind: "transition.add", transition },
    { kind: "matte.add", matte },
    { kind: "group.add", group },
  ] });
  assert.equal(edited.transitions.length, 1);
  assert.equal(edited.mattes.length, 1);
  assert.equal(edited.groups.length, 1);
});

test("Media Asset files and package Components materialize as inspectable NLE transactions", () => {
  const empty = createNleProject({
    id: "materialization", name: "Materialization", editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const withTrack = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "main", name: "Main", kind: "picture", locked: false, muted: false, items: [] },
  }] });
  const resolved = prepared();
  const { source: _source, ...interpretation } = resolved;
  const mediaTransaction = createMediaAssetMaterialization(withTrack, {
    mediaId: "interview", itemId: "interview-use", name: "Interview",
    asset: interviewAsset, interpretation,
    track: "main", at: frame(2), picture: fullPicture,
  });
  assert.deepEqual(mediaTransaction.commands.map((command) => command.kind), ["media.add", "item.add"]);
  const withMedia = applyNleTransaction(withTrack, mediaTransaction);
  assert.deepEqual(findNleItem(withMedia, "interview-use").item, {
    id: "interview-use", kind: "media", media: "interview", start: frame(2), duration: frame(8),
    localStart: frame(0), enabled: true, audio: { effects: [] }, picture: fullPicture,
  });

  const componentTransaction = createComponentMaterialization(withMedia, {
    id: "title", track: "main", at: frame(1), duration: frame(4),
    component: { module: { name: "@example/title", version: "1" }, name: "card" },
    parameters: { title: "Already materialized" }, layout: fullPicture.layout,
  });
  const finished = applyNleTransaction(withMedia, componentTransaction);
  assert.deepEqual(findNleItem(finished, "title").item, {
    id: "title", kind: "component", start: frame(1), duration: frame(4), localStart: frame(0),
    enabled: true,
    component: { module: { name: "@example/title", version: "1" }, name: "card" },
    parameters: { title: "Already materialized" }, picture: fullPicture,
  });
});
