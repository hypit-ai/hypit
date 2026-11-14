import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringHost,
  createNleProject,
  nleLinearTimeMapping,
  type NleComponentItem,
} from "@hypit/nle";

import {
  applyNleTimelineViewTransaction,
  assertNleSpatialEditAllowed,
  assertNleTimelineViewAllowsTransaction,
  createNleTimelineView,
  parseNleTimelineView,
  projectNleCanvas,
  projectNleTimeline,
  allNleTimelineAffordances,
  allNleCanvasAffordances,
  resolveNleTimelineItemCapabilities,
  resolveNleSpatialItemCapabilities,
  serializeNleTimelineView,
} from "../src/index.js";

const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

function project() {
  const item: NleComponentItem = {
    id: "title",
    kind: "present", source: "component",
    component: { module: { name: "@example/title" }, name: "default" },
    parameters: { text: "Title" },
    start: second(0),
    duration: second(2),
    sourceTime: nleLinearTimeMapping(second(2)),
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

test("a View may reference an NLE document in a sibling owner directory", () => {
  const view = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "../edits/film.nle.json" },
  });
  assert.equal(parseNleTimelineView(serializeNleTimelineView(view)).project.path,
    "../edits/film.nle.json");
  assert.throws(() => createNleTimelineView({
    id: "invalid-main",
    name: "Invalid timeline",
    project: { path: "../edits/../film.nle.json" },
  }), /parent segments only before its owned path/u);
});

test("a Timeline Track lock guards edits at the surface boundary without entering NLE domain model", () => {
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

test("Timeline cutting is offered by invocation-local Item capabilities", () => {
  const componentDocument = project();
  const componentView = createNleTimelineView({
    id: "film-main",
    name: "Film timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: ["picture"],
  });
  const componentCapabilities = resolveNleTimelineItemCapabilities(componentDocument, componentView);
  const componentScene = projectNleTimeline(
    componentDocument, componentView, [], componentCapabilities, allNleTimelineAffordances,
  );
  assert.deepEqual(componentScene.tracks[0]?.items[0]?.affordances,
    { select: true, move: true, trimStart: false, trimEnd: false, split: false });

  const componentSplit = {
    revision: componentDocument.revision,
    commands: [{ kind: "item.split" as const, id: "title", at: second(1), rightId: "title-right" }],
  };
  assert.throws(() => assertNleTimelineViewAllowsTransaction(
    componentView, componentDocument, componentSplit, componentCapabilities,
  ), /does not offer split/u);
  assert.doesNotThrow(() => applyNleTransaction(componentDocument, componentSplit));
  const component = componentDocument.tracks[0]!.items[0]!;
  assert.equal(component.kind, "present");
  assert.equal(component.source, "component");
  if (component.kind !== "present" || component.source !== "component") throw new Error("fixture");
  const authoring = createNleAuthoringHost([{ componentOccurrences: [{
    component: component.component,
    temporalSupport: () => ({ timeWindow: true }),
  }] }]);
  const componentEditing = resolveNleTimelineItemCapabilities(componentDocument, componentView, authoring);
  const editableComponentScene = projectNleTimeline(
    componentDocument,
    componentView,
    [],
    componentEditing,
    { move: true, trimStart: true, trimEnd: true, split: true },
  );
  assert.equal(editableComponentScene.tracks[0]?.items[0]?.affordances.split, true);
  assert.doesNotThrow(() => assertNleTimelineViewAllowsTransaction(
    componentView, componentDocument, componentSplit, componentEditing,
  ));
  const fixedComponent = [{
    item: "title", move: false, trimStart: false, trimEnd: false, split: false,
  }] as const;
  assert.throws(() => assertNleTimelineViewAllowsTransaction(componentView, componentDocument, {
    revision: componentDocument.revision,
    commands: [{ kind: "item.move", ids: ["title"], delta: second(1) }],
  }, fixedComponent), /does not offer move/u);

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
        sourceTime: nleLinearTimeMapping(second(2)),
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
  const mediaCapabilities = resolveNleTimelineItemCapabilities(mediaDocument, mediaView);
  const mediaScene = projectNleTimeline(
    mediaDocument, mediaView, [], mediaCapabilities,
    { move: true, trimStart: true, trimEnd: true, split: true },
  );
  assert.deepEqual(mediaScene.tracks[0]?.items.find((item) => item.id === "camera-use")?.affordances,
    { select: true, move: true, trimStart: true, trimEnd: true, split: true });
  assert.doesNotThrow(() => assertNleTimelineViewAllowsTransaction(mediaView, mediaDocument, {
    revision: mediaDocument.revision,
    commands: [{ kind: "item.split", id: "camera-use", at: second(5), rightId: "camera-right" }],
  }, mediaCapabilities));

  const filter = { module: { name: "@example/filter" }, name: "default" } as const;
  const mediaWithFilter = applyNleTransaction(mediaDocument, {
    revision: mediaDocument.revision,
    commands: [{
      kind: "operator-application.add",
      item: "camera-use",
      medium: "picture",
      application: {
        id: "camera-filter", operator: filter, parameters: {},
        controlTime: nleLinearTimeMapping(second(2)),
      },
    }],
  });
  assert.equal(resolveNleTimelineItemCapabilities(mediaWithFilter, mediaView)
    .find((capability) => capability.item === "camera-use")?.trimEnd, false);
  const filterAuthoring = createNleAuthoringHost([{ operatorOccurrences: [{
    operator: filter,
    temporalSupport: () => ({ timeWindow: true }),
  }] }]);
  assert.equal(resolveNleTimelineItemCapabilities(mediaWithFilter, mediaView, filterAuthoring)
    .find((capability) => capability.item === "camera-use")?.trimEnd, true);
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
    affordances: { select: true, move: false, trimStart: false, trimEnd: false, split: false },
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
  const spatialCapabilities = resolveNleSpatialItemCapabilities(document, view);
  const scene = projectNleCanvas(document, view, [{
    item: "title",
    title: "Opening title",
    picture: { sourceExtent: { width: 200, height: 100 } },
  }], spatialCapabilities, allNleCanvasAffordances);

  assert.deepEqual(scene.canvas, { width: 100, height: 100, clearColor: "black" });
  assert.deepEqual(scene.layers.map((layer) => ({
    id: layer.id, title: layer.title, layout: layer.layout, content: layer.content, owner: layer.owner,
    transform: layer.affordances.translate || layer.affordances.resize !== false,
    aspectRatio: layer.affordances.resize === false ? undefined : layer.affordances.resize.aspectRatio,
  })), [{
    id: "title",
    title: "Opening title",
    layout: { x: 0, y: 0, width: 100, height: 100, fit: "contain" },
    content: { x: 0, y: 25, width: 100, height: 50 },
    owner: { kind: "item" },
    transform: false,
    aspectRatio: undefined,
  }, {
    id: "title-copy",
    title: "default",
    layout: { x: 10, y: 20, width: 80, height: 60, fit: "cover" },
    content: undefined,
    owner: { kind: "picture-layout", ref: "shared-title", name: "Shared title", sharedBy: ["title-copy"] },
    transform: false,
    aspectRatio: undefined,
  }]);
  assert.throws(() => assertNleTimelineViewAllowsTransaction(view, document, {
    revision: document.revision,
    commands: [{ kind: "picture-layout.replace", value: {
      id: "shared-title", name: "Shared title", layout: {
        x: 5, y: 10, width: 90, height: 80, fit: "contain",
      },
    } }],
  }), /Track picture is locked/u);
  assert.equal(spatialCapabilities.find((capability) => capability.item === "title-copy")?.translateFrame, false);
  assert.throws(() => assertNleSpatialEditAllowed(spatialCapabilities, "title-copy", {
    kind: "frame.translate", deltaX: 1, deltaY: 1,
  }), /does not allow spatial edit/u);
});

function documentItem(document: ReturnType<typeof project>, id: string): NleComponentItem {
  const item = document.tracks.flatMap((track) => track.items).find((candidate) => candidate.id === id);
  assert(item?.kind === "present" && item.source === "component");
  return item;
}
