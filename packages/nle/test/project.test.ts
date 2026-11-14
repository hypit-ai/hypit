import assert from "node:assert/strict";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";

import {
  NleRevisionConflict,
  applyNleTransaction,
  createAdjustmentMaterialization,
  createComponentMaterialization,
  createNleProject,
  createMediaAssetMaterialization,
  findNleComponentValue,
  findNleItem,
  findNlePictureLayout,
  nleLinearTimeMapping,
  nleProjectDuration,
  parseNleProject,
  planNleSpatialEdit,
  resolveNleComponentSharedValue,
  resolveNlePictureLayout,
  serializeNleProject,
  type NleComponentItem,
  type NleMediaItem,
  type NlePictureAppearance,
} from "../src/index.js";

const fullPicture = {
  layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
} as const satisfies NlePictureAppearance;

const interviewAsset = { path: "./media/interview.media.json" } as const;
const frame = (value: number) => exactTemporalValueFromFrames(value, {
  frameRate: { numerator: 2, denominator: 1 },
});
const third = (ticks: number) => ({ ticks: String(ticks), timeBase: { numerator: 1, denominator: 3 } });
const exactSecond = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
const linear = (duration: ReturnType<typeof frame>, sourceAtStart = frame(0)) =>
  nleLinearTimeMapping(duration, sourceAtStart);

function prepared(width = 100, height = 100) {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
  return prepareMedia({
    id: "interview-prepared",
    source: { kind: "blob", resource: fixtureResource("nle:interview"), size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("4"), decodedUnitCount: 8,
      width, height, sampleAspectRatio: { numerator: 1, denominator: 1 },
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
  kind: "present", source: "media",
  asset: interviewAsset,
  start: frame(0),
  duration: frame(6),
  sourceTime: linear(frame(6)),
  enabled: true,
  picture: fullPicture,
  audio: { },
};

const captionItem: NleComponentItem = {
  id: "caption-one",
  kind: "present", source: "component",
  start: frame(1),
  duration: frame(2),
  sourceTime: linear(frame(2)),
  enabled: true,
  component: { module: { name: "@example/caption" }, name: "default" },
  parameters: { text: "Hello NLE", color: "white" },
  picture: {
    layout: { x: 10, y: 70, width: 80, height: 20, fit: "contain" },
  },
};

const componentItem: NleComponentItem = {
  id: "title-card",
  kind: "present", source: "component",
  start: frame(0),
  duration: frame(4),
  sourceTime: linear(frame(4)),
  enabled: true,
  component: { module: { name: "@example/title" }, name: "card" },
  parameters: { title: "Direct project state" },
  picture: fullPicture,
};

test("one revision stores Media and Component Presents directly", () => {
  const project = createNleProject({
    id: "editorial",
    name: "Editorial",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const edited = applyNleTransaction(project, { revision: 0, commands: [
    { kind: "track.add", track: { id: "picture-main", name: "Picture", kind: "picture",
      muted: false, items: [] } },
    { kind: "item.add", track: "picture-main", item: mediaItem },
    { kind: "item.add", track: "picture-main", item: captionItem },
    { kind: "item.add", track: "picture-main", item: componentItem },
  ] });

  assert.equal(project.revision, 0);
  assert.equal(project.tracks.length, 0);
  assert.equal(edited.revision, 1);
  assert.deepEqual(edited.tracks[0]?.items.map((item) => [item.kind,
    item.kind === "present" ? item.source : undefined]), [
    ["present", "media"], ["present", "component"], ["present", "component"],
  ]);
  const text = serializeNleProject(edited);
  const reopened = parseNleProject(text);
  assert.deepEqual((reopened.tracks[0]?.items[0] as NleMediaItem).asset, interviewAsset);
  assert.deepEqual(reopened, edited);
});

test("spatial intentions plan ordinary inline and shared Layout transactions", () => {
  let project = applyNleTransaction(createNleProject({
    id: "spatial",
    name: "Spatial",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [captionItem] },
  }] });

  project = applyNleTransaction(project, planNleSpatialEdit(project, "caption-one", {
    kind: "frame.translate", deltaX: 5, deltaY: -10,
  }));
  assert.deepEqual(resolveNlePictureLayout(project,
    (findNleItem(project, "caption-one").item as NleComponentItem).picture!.layout),
  { x: 15, y: 60, width: 80, height: 20, fit: "contain" });

  project = applyNleTransaction(project, planNleSpatialEdit(project, "caption-one", {
    kind: "layout.share", id: "caption-layout", name: "Caption layout",
  }));
  assert.deepEqual((findNleItem(project, "caption-one").item as NleComponentItem).picture!.layout,
    { ref: "caption-layout" });

  project = applyNleTransaction(project, planNleSpatialEdit(project, "caption-one", {
    kind: "focus.set", contentX: 0.25, contentY: 0.75,
  }));
  assert.deepEqual(findNlePictureLayout(project, "caption-layout").layout,
    { x: 15, y: 60, width: 80, height: 20, fit: "contain", contentX: 0.25, contentY: 0.75 });

  project = applyNleTransaction(project, planNleSpatialEdit(project, "caption-one", {
    kind: "layout.unlink",
  }));
  assert.equal("ref" in (findNleItem(project, "caption-one").item as NleComponentItem).picture!.layout, false);
});

test("Component slots and picture layouts link ordinary Items to explicit shared project values", () => {
  const symbol = componentItem.component;
  const linkedItem: NleComponentItem = {
    ...componentItem,
    sharedValues: [{ slot: "appearance", ref: "shared-appearance" }],
    picture: { layout: { ref: "lower-third" } },
  };
  const secondLinkedItem: NleComponentItem = {
    ...linkedItem,
    id: "title-card-two",
    parameters: { title: "Another direct item" },
  };
  const base = applyNleTransaction(createNleProject({
    id: "linked-values", name: "Linked values",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "component-value.add", value: {
      id: "shared-appearance", name: "Shared appearance", component: symbol,
      slot: "appearance", value: { color: "white", weight: 700 },
    } },
    { kind: "picture-layout.add", value: {
      id: "lower-third", name: "Lower third",
      layout: { x: 10, y: 70, width: 80, height: 20, fit: "contain" },
    } },
    { kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [linkedItem, secondLinkedItem],
    } },
  ] });

  assert.deepEqual(resolveNleComponentSharedValue(base, linkedItem, "appearance").value,
    { color: "white", weight: 700 });
  assert.deepEqual(resolveNlePictureLayout(base, linkedItem.picture!.layout),
    { x: 10, y: 70, width: 80, height: 20, fit: "contain" });
  assert.deepEqual(parseNleProject(serializeNleProject(base)), base);

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "component-value.replace", value: {
      ...findNleComponentValue(base, "shared-appearance"),
      value: { color: "yellow", weight: 900 },
    } },
    { kind: "picture-layout.replace", value: {
      ...findNlePictureLayout(base, "lower-third"),
      layout: { x: 5, y: 60, width: 90, height: 30, fit: "contain" },
    } },
  ] });
  const persistedItem = findNleItem(edited, "title-card").item as NleComponentItem;
  assert.deepEqual(persistedItem.sharedValues, linkedItem.sharedValues);
  assert.deepEqual(persistedItem.picture, linkedItem.picture);
  assert.deepEqual(resolveNleComponentSharedValue(edited, persistedItem, "appearance").value,
    { color: "yellow", weight: 900 });
  assert.deepEqual(resolveNlePictureLayout(edited, persistedItem.picture!.layout),
    { x: 5, y: 60, width: 90, height: 30, fit: "contain" });
  const secondPersistedItem = findNleItem(edited, "title-card-two").item as NleComponentItem;
  assert.deepEqual(resolveNleComponentSharedValue(edited, secondPersistedItem, "appearance").value,
    { color: "yellow", weight: 900 });
  assert.deepEqual(resolveNlePictureLayout(edited, secondPersistedItem.picture!.layout),
    { x: 5, y: 60, width: 90, height: 30, fit: "contain" });

  assert.throws(() => applyNleTransaction(edited, { revision: 2, commands: [{
    kind: "component-value.replace",
    value: { ...findNleComponentValue(edited, "shared-appearance"), slot: "another-slot" },
  }] }), /shared value appearance references Component Value slot another-slot/u);
  assert.throws(() => applyNleTransaction(edited, { revision: 2, commands: [{
    kind: "component-value.remove", id: "shared-appearance",
  }] }), /still used by Items: title-card, title-card-two/u);
  assert.throws(() => applyNleTransaction(edited, { revision: 2, commands: [{
    kind: "picture-layout.remove", id: "lower-third",
  }] }), /still used by Items: title-card, title-card-two/u);

});

test("exact project time is independent of any editor grid", () => {
  const base = createNleProject({
    id: "exact-time", name: "Exact time",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const edited = applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add",
    track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [{
        ...componentItem,
        start: third(1),
        duration: third(2),
        sourceTime: nleLinearTimeMapping(third(2), third(0)),
      }],
    },
  }] });

  assert.deepEqual(findNleItem(edited, "title-card").item.start, third(1));
  assert.deepEqual(nleProjectDuration(edited), exactSecond);
  const reopened = parseNleProject(serializeNleProject(edited));
  assert.deepEqual(findNleItem(reopened, "title-card").item.start, third(1));
  assert.deepEqual(nleProjectDuration(reopened), exactSecond);
});

test("Picture layouts preserve off-canvas placement and an explicit cover focal point", () => {
  const base = createNleProject({
    id: "spatial-media", name: "Spatial media",
    canvas: { width: 1920, height: 1080, clearColor: "black" },
  });
  const layout = {
    x: -315, y: 461, width: 1100, height: 619, fit: "cover" as const,
    contentX: 0.62, contentY: 0.35,
  };
  const project = applyNleTransaction(base, { revision: 0, commands: [
    { kind: "track.add", track: { id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [{ ...mediaItem, id: "host-use", picture: { layout } }] } },
  ] });
  assert.deepEqual(parseNleProject(serializeNleProject(project)).tracks[0]?.items[0]?.kind === "present"
    ? (parseNleProject(serializeNleProject(project)).tracks[0]!.items[0] as NleMediaItem).picture?.layout
    : undefined, layout);

  const invalid = structuredClone(project);
  const item = invalid.tracks[0]!.items[0] as NleMediaItem;
  (item.picture!.layout as { contentX: number }).contentX = 1.1;
  assert.throws(() => serializeNleProject(invalid), /contentX must lie between zero and one/u);
});

test("Project parsing rejects Timeline View state inside composition", () => {
  const project = createNleProject({ id: "separated-view", name: "Separated View" });
  assert.throws(() => parseNleProject(JSON.stringify({
    ...project,
    editRate: { numerator: 30, denominator: 1 },
    groups: [],
  })), /belong to hypit\.nle-view@1/u);
  const withTrack = applyNleTransaction(project, { revision: 0, commands: [{
    kind: "track.add", track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [] },
  }] });
  assert.throws(() => parseNleProject(JSON.stringify({
    ...withTrack,
    tracks: [{ ...withTrack.tracks[0], locked: false }],
  })), /lock belongs to hypit\.nle-view@1/u);
});

test("move, trim and split are atomic direct NLE edits", () => {
  const base = applyNleTransaction(createNleProject({
    id: "edit-proof", name: "Edit proof",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: { id: "picture-main", name: "Picture", kind: "picture",
      muted: false, items: [mediaItem, componentItem] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.trim", id: "interview-use", edge: "start", at: frame(1) },
    { kind: "item.split", id: "interview-use", at: frame(3), rightId: "interview-use-right" },
    { kind: "item.move", ids: ["title-card"], delta: frame(2) },
  ] });

  assert.deepEqual(findNleItem(edited, "interview-use").item,
    { ...mediaItem, start: frame(1), duration: frame(2), sourceTime: linear(frame(2), frame(1)) });
  assert.deepEqual(findNleItem(edited, "interview-use-right").item,
    { ...mediaItem, id: "interview-use-right", start: frame(3), duration: frame(3),
      sourceTime: linear(frame(3), frame(3)) });
  assert.deepEqual(findNleItem(edited, "title-card").item.start, frame(2));

  assert.throws(() => applyNleTransaction(edited, { revision: 2, commands: [
    { kind: "item.move", ids: ["title-card"], delta: frame(10) },
    { kind: "item.add", track: "picture-main", item: { ...captionItem, id: "title-card" } },
  ] }));
  assert.deepEqual(findNleItem(edited, "title-card").item.start, frame(2));
  assert.throws(() => applyNleTransaction(edited, { revision: 1, commands: [] }), NleRevisionConflict);
});

test("an Item occurrence name can override and restore its inferred author-facing label", () => {
  const base = applyNleTransaction(createNleProject({
    id: "named-item", name: "Named Item",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [mediaItem] },
  }] });
  const renamed = applyNleTransaction(base, { revision: 1, commands: [{
    kind: "item.update", id: mediaItem.id, name: "Opening interview",
  }] });
  assert.equal(findNleItem(parseNleProject(serializeNleProject(renamed)), mediaItem.id).item.name,
    "Opening interview");

  const restored = applyNleTransaction(renamed, { revision: 2, commands: [{
    kind: "item.update", id: mediaItem.id, name: null,
  }] });
  assert.equal(Object.hasOwn(findNleItem(restored, mediaItem.id).item, "name"), false);
  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [{
    kind: "item.update", id: mediaItem.id, name: "   ",
  }] }), /Item interview-use name is empty/u);
});

test("split exactly subdivides Source and occurrence-local Operator clocks", () => {
  const at = (ticks: number, denominator = 1) => ({
    ticks: String(ticks), timeBase: { numerator: 1, denominator },
  });
  const curved: NleComponentItem = {
    ...componentItem,
    id: "curved",
    duration: at(4),
    sourceTime: { pieces: [{
      target: { start: at(0), end: at(4) },
      sourceAtStart: at(0), sourceControl1: at(1), sourceControl2: at(3), sourceAtEnd: at(4),
    }] },
    picture: {
      ...fullPicture,
      operators: [{
        id: "fade",
        operator: { module: { name: "@example/filter" }, name: "fade" },
        parameters: {},
        controlTime: { pieces: [{
          target: { start: at(0), end: at(4) },
          sourceAtStart: at(0), sourceControl1: at(1), sourceControl2: at(3), sourceAtEnd: at(4),
        }] },
      }],
    },
  };
  const base = applyNleTransaction(createNleProject({
    id: "cubic-split", name: "Cubic split",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add", track: { id: "picture", name: "Picture", kind: "picture",
      muted: false, items: [curved] },
  }] });
  const edited = applyNleTransaction(base, { revision: 1, commands: [{
    kind: "item.split", id: "curved", at: at(2), rightId: "curved-right",
  }] });

  const left = findNleItem(edited, "curved").item;
  const right = findNleItem(edited, "curved-right").item;
  if (left.kind !== "present" || right.kind !== "present") throw new Error("Split changed Present Items into Adjustments.");
  assert.deepEqual(left.sourceTime, { pieces: [{
    target: { start: at(0), end: at(2) },
    sourceAtStart: at(0), sourceControl1: at(1, 2), sourceControl2: at(5, 4), sourceAtEnd: at(2),
  }] });
  assert.deepEqual(right.sourceTime, { pieces: [{
    target: { start: at(0), end: at(2) },
    sourceAtStart: at(2), sourceControl1: at(11, 4), sourceControl2: at(7, 2), sourceAtEnd: at(4),
  }] });
  assert.deepEqual(left.picture?.operators?.[0]?.controlTime, left.sourceTime);
  assert.deepEqual(right.picture?.operators?.[0]?.controlTime, right.sourceTime);
});

test("retime replaces direct source-time facts and slip shifts every source coordinate", () => {
  const sourceTime = { pieces: [{
    target: { start: frame(0), end: frame(2) },
    sourceAtStart: frame(4), rate: { numerator: -1, denominator: 1 },
  }, {
    target: { start: frame(2), end: frame(4) },
    sourceAtStart: frame(1), rate: { numerator: 0, denominator: 1 },
  }] } as const;
  const base = applyNleTransaction(createNleProject({
    id: "retime-edit", name: "Retime edit",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add", track: { id: "picture", name: "Picture", kind: "picture",
      muted: false, items: [componentItem] },
  }] });
  const retimed = applyNleTransaction(base, { revision: 1, commands: [{
    kind: "item.retime", id: "title-card", time: sourceTime,
  }] });
  const retimedItem = findNleItem(retimed, "title-card").item;
  if (retimedItem.kind !== "present") throw new Error("Retime target changed into an Adjustment.");
  assert.deepEqual(retimedItem.sourceTime, sourceTime);

  const slipped = applyNleTransaction(retimed, { revision: 2, commands: [{
    kind: "item.slip", id: "title-card", delta: frame(1),
  }] });
  const slippedItem = findNleItem(slipped, "title-card").item;
  if (slippedItem.kind !== "present") throw new Error("Slip target changed into an Adjustment.");
  assert.deepEqual(slippedItem.sourceTime, { pieces: [{
    ...sourceTime.pieces[0], sourceAtStart: frame(5),
  }, {
    ...sourceTime.pieces[1], sourceAtStart: frame(2),
  }] });
});

test("Operator Applications have direct ordered and revisioned edit commands", () => {
  const base = applyNleTransaction(createNleProject({
    id: "operator-edits", name: "Operator edits",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [componentItem] },
  }] });
  const symbol = (name: string) => ({ module: { name: `@example/${name}` }, name });
  const fade = {
    id: "fade", operator: symbol("fade"), parameters: { amount: 1 },
    controlTime: nleLinearTimeMapping(frame(4)),
  };
  const frameApplication = {
    id: "frame", operator: symbol("frame"), parameters: { width: 2 },
    controlTime: nleLinearTimeMapping(frame(4)),
  };
  const added = applyNleTransaction(base, { revision: 1, commands: [{
    kind: "operator-application.add", item: "title-card", medium: "picture", application: fade,
  }, {
    kind: "operator-application.add", item: "title-card", medium: "picture",
    application: frameApplication, before: "fade",
  }, {
    kind: "operator-application.retime", item: "title-card", medium: "picture", id: "fade",
    controlTime: nleLinearTimeMapping(frame(4), frame(1)),
  }] });
  const addedItem = findNleItem(added, "title-card").item;
  if (addedItem.kind !== "present") throw new Error("Operator edit target changed kind.");
  assert.deepEqual(addedItem.picture?.operators?.map((application) => application.id), ["frame", "fade"]);
  assert.deepEqual(addedItem.picture?.operators?.[1]?.controlTime,
    nleLinearTimeMapping(frame(4), frame(1)));

  const edited = applyNleTransaction(added, { revision: 2, commands: [{
    kind: "operator-application.move", item: "title-card", medium: "picture", id: "fade", before: "frame",
  }, {
    kind: "operator-application.replace", item: "title-card", medium: "picture",
    application: { ...fade, parameters: { amount: 0.5 } },
  }, {
    kind: "operator-application.remove", item: "title-card", medium: "picture", id: "frame",
  }] });
  const editedItem = findNleItem(edited, "title-card").item;
  if (editedItem.kind !== "present") throw new Error("Operator edit target changed kind.");
  assert.deepEqual(editedItem.picture?.operators, [{ ...fade, parameters: { amount: 0.5 } }]);
});

test("project, Media Item and Track facts remain directly editable", () => {
  const base = applyNleTransaction(createNleProject({
    id: "direct-facts", name: "Before",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: { id: "picture", name: "V1", kind: "picture",
      muted: false, items: [mediaItem] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "project.update", name: "After",
      canvas: { width: 200, height: 100, clearColor: "transparent" } },
    { kind: "item.replace", item: { ...mediaItem, asset: { path: "./media/relinked.media.json" } } },
    { kind: "track.update", id: "picture", name: "Primary picture", muted: true },
  ] });

  assert.equal(edited.name, "After");
  assert.deepEqual(edited.canvas, { width: 200, height: 100, clearColor: "transparent" });
  assert.deepEqual((edited.tracks[0]?.items[0] as NleMediaItem).asset,
    { path: "./media/relinked.media.json" });
  assert.deepEqual(edited.tracks[0], {
    id: "picture", name: "Primary picture", kind: "picture", muted: true,
    items: [{ ...mediaItem, asset: { path: "./media/relinked.media.json" } }],
  });

});

test("slip and detach-audio preserve direct programme and source time facts", () => {
  const base = applyNleTransaction(createNleProject({
    id: "source-time-edits", name: "Source time edits",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: { id: "picture", name: "V1", kind: "picture",
      muted: false, items: [mediaItem] } },
    { kind: "track.add", track: { id: "audio", name: "A1", kind: "audio",
      muted: false, items: [] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.slip", id: "interview-use", delta: frame(1) },
    { kind: "item.detach-audio", id: "interview-use", audioItemId: "interview-audio", track: "audio" },
  ] });
  const picture = findNleItem(edited, "interview-use");
  const audio = findNleItem(edited, "interview-audio");
  if (picture.item.kind !== "present" || audio.item.kind !== "present") {
    throw new Error("Detached Media Items changed role.");
  }

  assert.equal(picture.track.id, "picture");
  assert.equal(picture.item.picture !== undefined, true);
  assert.equal(picture.item.audio, undefined);
  assert.equal(audio.track.id, "audio");
  assert.equal(audio.item.picture, undefined);
  assert.deepEqual(audio.item.audio, { });
  assert.deepEqual(picture.item.sourceTime, linear(frame(6), frame(1)));
  assert.deepEqual(audio.item.sourceTime, linear(frame(6), frame(1)));
  assert.deepEqual(audio.item.start, picture.item.start);
  assert.deepEqual(audio.item.duration, picture.item.duration);
});

test("roll moves one shared cut while preserving the two outer Item edges", () => {
  const left: NleComponentItem = {
    ...componentItem, id: "left", start: frame(0), duration: frame(4), sourceTime: linear(frame(4)),
  };
  const right: NleComponentItem = {
    ...componentItem, id: "right", start: frame(4), duration: frame(4), sourceTime: linear(frame(4), frame(2)),
  };
  const base = applyNleTransaction(createNleProject({
    id: "roll-edit", name: "Roll edit",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "V1", kind: "picture", muted: false,
      items: [left, right] },
  }] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.roll", left: "left", right: "right", at: frame(5) },
  ] });

  assert.deepEqual(findNleItem(edited, "left").item, {
    ...left, duration: frame(5), sourceTime: linear(frame(5)),
  });
  assert.deepEqual(findNleItem(edited, "right").item, {
    ...right, start: frame(5), duration: frame(3), sourceTime: linear(frame(3), frame(3)),
  });
  assert.deepEqual(nleProjectDuration(edited), frame(8));
  assert.throws(() => applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.roll", left: "left", right: "right", at: frame(8) },
  ] }), /outer Item edges/u);
});

test("ripple-trim moves only the caller's explicit scope", () => {
  const target: NleComponentItem = {
    ...componentItem, id: "target", start: frame(0), duration: frame(4), sourceTime: linear(frame(4)),
  };
  const following: NleComponentItem = {
    ...componentItem, id: "following", start: frame(4), duration: frame(2), sourceTime: linear(frame(2)),
  };
  const overlay: NleComponentItem = {
    ...componentItem, id: "overlay", start: frame(6), duration: frame(2), sourceTime: linear(frame(2)),
  };
  const untouched: NleComponentItem = {
    ...componentItem, id: "untouched", start: frame(8), duration: frame(2), sourceTime: linear(frame(2)),
  };
  const base = applyNleTransaction(createNleProject({
    id: "ripple-edit", name: "Ripple edit",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: { id: "main", name: "V1", kind: "picture",
      muted: false, items: [target, following, untouched] } },
    { kind: "track.add", track: { id: "overlay-track", name: "V2", kind: "picture",
      muted: false, items: [overlay] } },
  ] });

  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "item.ripple-trim", id: "target", edge: "end", at: frame(3),
      scope: ["following", "overlay"] },
  ] });
  assert.deepEqual(findNleItem(edited, "target").item.duration, frame(3));
  assert.deepEqual(findNleItem(edited, "following").item.start, frame(3));
  assert.deepEqual(findNleItem(edited, "overlay").item.start, frame(5));
  assert.deepEqual(findNleItem(edited, "untouched").item.start, frame(8));
});

test("Transition and matte remain direct composition relations", () => {
  const operator = { module: { name: "@example/relations" }, name: "default" } as const;
  const item = (id: string, start: number, duration: number): NleComponentItem => ({
    ...componentItem, id, start: frame(start), duration: frame(duration),
  });
  const base = applyNleTransaction(createNleProject({
    id: "locked-relations", name: "Locked relations",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "V1", kind: "picture", muted: false, items: [
      item("outgoing", 0, 4), item("incoming", 2, 4), item("matte-source", 0, 8),
    ] },
  }] });
  const transition = { id: "transition", outgoing: "outgoing", incoming: "incoming",
    operator, parameters: {} } as const;
  const matte = { id: "matte", content: "incoming", matte: "matte-source",
    operator, parameters: {} } as const;
  const edited = applyNleTransaction(base, { revision: 1, commands: [
    { kind: "transition.add", transition },
    { kind: "matte.add", matte },
  ] });
  assert.equal(edited.transitions.length, 1);
  assert.equal(edited.mattes.length, 1);
});

test("Media Assets, Present Components and Adjustments materialize as inspectable NLE transactions", () => {
  const empty = createNleProject({
    id: "materialization", name: "Materialization",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const withTrack = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "main", name: "Main", kind: "picture", muted: false, items: [] },
  }] });
  const resolved = prepared();
  const { source: _source, ...interpretation } = resolved;
  const mediaTransaction = createMediaAssetMaterialization(withTrack, {
    itemId: "interview-use",
    asset: interviewAsset, interpretation,
    track: "main", at: frame(2), picture: fullPicture,
  });
  assert.deepEqual(mediaTransaction.commands.map((command) => command.kind), ["item.add"]);
  const withMedia = applyNleTransaction(withTrack, mediaTransaction);
  assert.deepEqual(findNleItem(withMedia, "interview-use").item, {
    id: "interview-use", kind: "present", source: "media", asset: interviewAsset,
    start: frame(2), duration: frame(8),
    sourceTime: linear(frame(8)), enabled: true, audio: { }, picture: fullPicture,
  });
  const { source: _wideSource, ...wideInterpretation } = prepared(160, 90);
  const wideTransaction = createMediaAssetMaterialization(withMedia, {
    itemId: "wide-use",
    asset: interviewAsset,
    interpretation: wideInterpretation,
    track: "main",
    at: frame(0),
  });
  const withWideMedia = applyNleTransaction(withMedia, wideTransaction);
  const wideItem = findNleItem(withWideMedia, "wide-use").item;
  assert(wideItem.kind === "present");
  assert.deepEqual(wideItem.picture, {
    layout: { x: 0, y: 21.875, width: 100, height: 56.25, fit: "contain" },
  });

  const componentTransaction = createComponentMaterialization(withWideMedia, {
    id: "title", track: "main", at: frame(1), duration: frame(4),
    component: { module: { name: "@example/title" }, name: "card" },
    parameters: { title: "Already materialized" }, layout: fullPicture.layout,
  });
  const finished = applyNleTransaction(withWideMedia, componentTransaction);
  assert.deepEqual(findNleItem(finished, "title").item, {
    id: "title", kind: "present", source: "component", start: frame(1), duration: frame(4), sourceTime: linear(frame(4)),
    enabled: true,
    component: { module: { name: "@example/title" }, name: "card" },
    parameters: { title: "Already materialized" }, picture: fullPicture,
  });

  const adjustmentTransaction = createAdjustmentMaterialization(finished, {
    id: "grade", track: "main", at: frame(1), duration: frame(4),
    operator: { module: { name: "@example/color" }, name: "grade" },
    parameters: { contrast: 1.2 },
  });
  const adjusted = applyNleTransaction(finished, adjustmentTransaction);
  assert.deepEqual(findNleItem(adjusted, "grade").item, {
    id: "grade", kind: "adjustment", start: frame(1), duration: frame(4), controlTime: linear(frame(4)),
    enabled: true,
    operator: { module: { name: "@example/color" }, name: "grade" },
    parameters: { contrast: 1.2 },
  });
});

test("Project parsing rejects unknown fields instead of preserving ghost state", () => {
  const project = createNleProject({ id: "strict-project", name: "Strict Project" });
  assert.throws(() => parseNleProject(JSON.stringify({ ...project, obsoleteState: true })),
    /unknown fields: obsoleteState/u);

  const withTrack = applyNleTransaction(project, { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [componentItem] },
  }] });
  const invalid = structuredClone(withTrack) as unknown as {
    tracks: Array<{ items: Array<Record<string, unknown>> }>;
  };
  invalid.tracks[0]!.items[0]!.obsoleteState = true;
  assert.throws(() => parseNleProject(JSON.stringify(invalid)), /unknown fields: obsoleteState/u);
});
