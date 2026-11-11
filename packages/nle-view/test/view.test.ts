import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleProject,
  nleLinearSourceTime,
  type NleComponentItem,
} from "@hypit/nle";

import {
  applyNleTimelineViewTransaction,
  assertNleTimelineViewAllowsTransaction,
  createNleTimelineView,
  parseNleTimelineView,
  projectNleCanvas,
  projectNleTimeline,
  serializeNleTimelineView,
} from "../src/index.js";

const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

function project() {
  const item: NleComponentItem = {
    id: "title",
    kind: "present", source: "component",
    component: { module: { name: "@example/title", version: "1" }, name: "default" },
    parameters: { text: "Title" },
    start: second(0),
    duration: second(2),
    sourceTime: nleLinearSourceTime(second(2)),
    enabled: true,
    picture: {
      layout: { x: 0, y: 0, width: 100, height: 100, fit: "contain" },
    },
  };
  return applyNleTransaction(createNleProject({
    id: "film",
    name: "Film",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [item, { ...item, id: "title-copy", start: second(2) }] },
  }] });
}

test("edit grid, Track guards and Groups persist outside audiovisual composition", () => {
  const document = project();
  const initial = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: ["picture"],
  });
  const view = applyNleTimelineViewTransaction(initial, document, { revision: 0, commands: [
    { kind: "track-lock.set", track: "picture", locked: true },
    { kind: "track-height.set", track: "picture", heightPx: 96 },
    { kind: "group.add", group: { id: "titles", name: "Titles", items: ["title", "title-copy"] } },
  ] });

  const reopened = parseNleTimelineView(serializeNleTimelineView(view));
  assert.deepEqual(reopened.groups[0]?.items, ["title", "title-copy"]);
  assert.deepEqual(reopened.tracks[0], { track: "picture", locked: true, heightPx: 96 });
  assert.equal(Object.hasOwn(document, "editRate"), false);
  assert.equal(Object.hasOwn(document.tracks[0]!, "locked"), false);
  assert.equal(Object.hasOwn(document, "groups"), false);
});

test("a Timeline Track lock guards edits at the surface boundary without entering NLE Core", () => {
  const document = project();
  const initial = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    tracks: ["picture"],
  });
  const view = applyNleTimelineViewTransaction(initial, document, { revision: 0, commands: [
    { kind: "track-lock.set", track: "picture", locked: true },
  ] });
  const edit = {
    revision: document.revision,
    commands: [{ kind: "item.move" as const, ids: ["title"], delta: second(1) }],
  };
  assert.throws(() => assertNleTimelineViewAllowsTransaction(view, document, edit), /Track picture is locked/u);
  assert.throws(() => assertNleTimelineViewAllowsTransaction(view, document, {
    revision: document.revision,
    commands: [{ kind: "item.update", id: "title", name: "Opening" }],
  }), /Track picture is locked/u);
  assert.doesNotThrow(() => applyNleTransaction(document, edit));

  const reopened = parseNleTimelineView(serializeNleTimelineView(view));
  assert.deepEqual(reopened.editRate, { numerator: 30, denominator: 1 });
  assert.equal(reopened.tracks[0]?.locked, true);
});

test("the Timeline surface reserves source-time cutting for Media Items", () => {
  const componentDocument = project();
  const componentView = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: ["picture"],
  });
  const componentScene = projectNleTimeline(componentDocument, componentView);
  assert.deepEqual(componentScene.tracks[0]?.items[0]?.editing,
    { move: true, trimStart: false, trimEnd: false, split: false });

  const componentSplit = {
    revision: componentDocument.revision,
    commands: [{ kind: "item.split" as const, id: "title", at: second(1), rightId: "title-right" }],
  };
  assert.throws(() => assertNleTimelineViewAllowsTransaction(
    componentView, componentDocument, componentSplit,
  ), /split is available only for Media Items/u);
  assert.doesNotThrow(() => applyNleTransaction(componentDocument, componentSplit));

  const mediaDocument = applyNleTransaction(componentDocument, {
    revision: componentDocument.revision,
    commands: [{
      kind: "item.add",
      track: "picture",
      item: {
        id: "camera-use",
        kind: "present",
        source: "media",
        asset: { path: "media/camera.media.json" },
        start: second(4),
        duration: second(2),
        sourceTime: nleLinearSourceTime(second(2)),
        enabled: true,
        picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "cover" } },
      },
    }],
  });
  const mediaView = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: ["picture"],
  });
  const mediaScene = projectNleTimeline(mediaDocument, mediaView);
  assert.deepEqual(mediaScene.tracks[0]?.items.find((item) => item.id === "camera-use")?.editing,
    { move: true, trimStart: true, trimEnd: true, split: true });
  assert.doesNotThrow(() => assertNleTimelineViewAllowsTransaction(mediaView, mediaDocument, {
    revision: mediaDocument.revision,
    commands: [{ kind: "item.split", id: "camera-use", at: second(5), rightId: "camera-right" }],
  }));
});

test("projects Project, View and transient observations into one read-only Timeline Scene", () => {
  const document = applyNleTransaction(project(), { revision: 1, commands: [{
    kind: "item.update", id: "title", name: "My opening",
  }, {
    kind: "track.add",
    track: { id: "foreground", name: "Foreground", kind: "picture", muted: false, items: [] },
  }, {
    kind: "track.add",
    track: { id: "audio", name: "Audio", kind: "audio", muted: false, items: [] },
  }] });
  const initial = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: ["picture"],
  });
  const view = applyNleTimelineViewTransaction(initial, document, { revision: 0, commands: [
    { kind: "track-lock.set", track: "picture", locked: true },
    { kind: "track-height.set", track: "picture", heightPx: 96 },
  ] });
  const scene = projectNleTimeline(document, view, [{
    item: "title",
    title: "Opening title",
    layers: [{ kind: "text", role: "content", text: "Title" }],
  }]);

  assert.equal(scene.maximumFrame, 96);
  assert.deepEqual(scene.tracks.map((track) => [track.id, track.heightPx, track.locked]),
    [["foreground", 52, false], ["picture", 96, true], ["audio", 48, false]]);
  assert.deepEqual(scene.tracks.find((track) => track.id === "picture")?.items[0], {
    id: "title",
    track: "picture",
    role: "present",
    source: "component",
    enabled: true,
    startFrame: 0,
    durationFrames: 48,
    display: {
      title: "My opening",
      layers: [{ kind: "text", role: "content", text: "Title" }],
    },
    presentation: { tone: "magenta", chrome: "standard" },
    editing: { move: false, trimStart: false, trimEnd: false, split: false },
  });
  assert.equal(Object.hasOwn(document.tracks[0]!.items[0]!, "display"), false);
  assert.throws(() => projectNleTimeline(document, view, [
    { item: "title" }, { item: "title" },
  ]), /repeat Item title/u);
});

test("projects only Item-level Picture layers into one Canvas Scene", () => {
  const document = applyNleTransaction(project(), { revision: 1, commands: [{
    kind: "picture-layout.add",
    value: { id: "shared-title", name: "Shared title", layout: {
      x: 10, y: 20, width: 80, height: 60, fit: "cover",
    } },
  }, {
    kind: "item.replace",
    item: {
      ...documentItem(project(), "title-copy"),
      picture: { layout: { ref: "shared-title" } },
    },
  }] });
  const view = applyNleTimelineViewTransaction(createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: ["picture"],
  }), document, { revision: 0, commands: [{ kind: "track-lock.set", track: "picture", locked: true }] });
  const scene = projectNleCanvas(document, view, [{ item: "title", title: "Opening title" }]);

  assert.deepEqual(scene.canvas, { width: 100, height: 100, clearColor: "black" });
  assert.deepEqual(scene.layers.map((layer) => ({
    id: layer.id, title: layer.title, layout: layer.layout, owner: layer.owner, transform: layer.editing.transform,
  })), [{
    id: "title",
    title: "Opening title",
    layout: { x: 0, y: 0, width: 100, height: 100, fit: "contain" },
    owner: { kind: "item" },
    transform: false,
  }, {
    id: "title-copy",
    title: "default",
    layout: { x: 10, y: 20, width: 80, height: 60, fit: "cover" },
    owner: { kind: "picture-layout", ref: "shared-title", name: "Shared title", sharedBy: ["title-copy"] },
    transform: false,
  }]);
  assert.throws(() => assertNleTimelineViewAllowsTransaction(view, document, {
    revision: document.revision,
    commands: [{ kind: "picture-layout.replace", value: {
      id: "shared-title", name: "Shared title", layout: {
        x: 5, y: 10, width: 90, height: 80, fit: "contain",
      },
    } }],
  }), /Track picture is locked/u);
});

function documentItem(document: ReturnType<typeof project>, id: string): NleComponentItem {
  const item = document.tracks.flatMap((track) => track.items).find((candidate) => candidate.id === id);
  assert(item?.kind === "present" && item.source === "component");
  return item;
}
