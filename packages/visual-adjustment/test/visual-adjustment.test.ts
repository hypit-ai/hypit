import assert from "node:assert/strict";
import test from "node:test";

import { sealComposition } from "@hypit/composition";
import { compileHtmlProgram, readHtmlAdjustment } from "@hypit/html-program";
import { composeTemporalWindow } from "@hypit/temporal";
import { sealTimeline } from "@hypit/timeline";
import {
  appendVisualAdjustment,
  assertVisualAdjustmentSet,
  createVisualAdjustmentSet,
  decodeVisualAdjustmentSurface,
  finalizeVisualAdjustmentTrack,
  visualAdjustmentMarkupSurfaces,
  visualAdjustmentSpecFromRecipe,
  visualAdjustmentTypes,
} from "../src/index.js";
import { compositionTypes } from "@hypit/composition";
import { recipeType } from "@hypit/recipe";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import { visualAdjustmentStudioTrackCompanions } from "../src/studio.js";
import { studioContributionFromPackage } from "@hypit/studio-companion";
import hypitPackage from "../src/activation.js";

const timeline = sealTimeline({ id: "story", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } });
const window = composeTemporalWindow({ id: "look.window", subjectId: "look" },
  { id: "look.start", subjectId: "look", timelineId: timeline.id, frame: 10 },
  { id: "look.end", subjectId: "look", timelineId: timeline.id, frame: 80 });

test("one orthogonal Recipe produces one renderer programme and one Adjustment-only Track", () => {
  const spec = visualAdjustmentSpecFromRecipe("look", { path: "look.cinematic", properties: {
    blur: 3, contrast: 1.08, saturation: 0.9, opacity: 0.95,
    "translate-x": 12, rotation: -2, "scale-x": 1.03, "scale-y": 1.03,
  } });
  assert.deepEqual(readHtmlAdjustment(spec.program), {
    filter: "blur(3px) contrast(1.08) saturate(0.9)",
    opacity: 0.95,
    transform: "translate(12px, 0px) rotate(-2deg) scale(1.03, 1.03)",
    transformOrigin: "50% 50%",
  });
  const track = finalizeVisualAdjustmentTrack(
    appendVisualAdjustment(createVisualAdjustmentSet(), { id: "look" }, timeline, spec, window),
    { id: "look" }, timeline,
  );
  assert.equal(track.items[0]?.kind, "adjustment");
  const document = compileHtmlProgram(sealComposition({
    id: "film", canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    visual: { members: [{ kind: "track", id: "picture", track }] }, audio: [],
  }), timeline);
  assert.match(document.html, /data-hypit-adjustment-id="look"/u);
  assert.match(document.html, /entry\.element\.style\.transform/u);
});

test("one resolved Window can time distinct visual Adjustments", () => {
  const first = visualAdjustmentSpecFromRecipe("first", { path: "look.first", properties: { contrast: 1.1 } });
  const second = visualAdjustmentSpecFromRecipe("second", { path: "look.second", properties: { saturation: 0.8 } });
  let set = appendVisualAdjustment(createVisualAdjustmentSet(), { id: "look" }, timeline, first, window);
  set = appendVisualAdjustment(set, { id: "look" }, timeline, second, window);
  assert.deepEqual(set.items.map((item) => item.id), ["first", "second"]);
  assert.deepEqual(set.items.map((item) => item.span), [window.span, window.span]);
});

test("VisualAdjustmentSet refinement validates every accumulated renderer programme", () => {
  const spec = visualAdjustmentSpecFromRecipe("look", { path: "look.cinematic", properties: { contrast: 1.1 } });
  const set = appendVisualAdjustment(createVisualAdjustmentSet(), { id: "look" }, timeline, spec, window);
  assert.doesNotThrow(() => assertVisualAdjustmentSet(set));
  assert.throws(() => assertVisualAdjustmentSet({ items: [set.items[0]!, structuredClone(set.items[0]!)] }),
    /duplicate Visual Item look/u);
  assert.throws(() => assertVisualAdjustmentSet({ items: [{ ...set.items[0]!, program: {
    format: "example.adjustment@1", payload: {}, artifacts: [],
  } }] }), /does not support Visual Adjustment format/u);
});

test("Visual Adjustment Recipes reject unknown centralized effect names", () => {
  assert.throws(() => visualAdjustmentSpecFromRecipe("look", {
    path: "look.invalid", properties: { "cinematic-blue": 1 },
  }), /unknown properties/u);
});

test("Visual Adjustment Surface requires authored identity and declares its complete author path", async () => {
  assert.deepEqual(visualAdjustmentMarkupSurfaces[0]?.outputs,
    [visualAdjustmentTypes.header, visualAdjustmentTypes.spec, compositionTypes.visualTrack]);
  const range = { source: "adjust.svml", start: 0, end: 1 };
  const child = { kind: "element" as const, name: "adjust:Adjustment", range, children: [], attributes: {
    id: "grade", during: { kind: "reference" as const, path: "story.window" },
    appearance: { kind: "reference" as const, path: "recipes.grade" },
  } };
  const decode = (attributes = child.attributes) => decodeVisualAdjustmentSurface({ sourceName: "adjust.svml", element: {
    kind: "element", name: "adjust:Track", range,
    attributes: { id: "look", timeline: { kind: "reference", path: "story.timeline" } },
    children: [{ ...child, attributes }],
  }, resolveReference: (path) => {
    if (path === "story.timeline") return { path, type: timelineTypes.timeline, ref: { kind: "record", id: path } };
    if (path === "story.window") return { path, type: temporalTypes.window, ref: { kind: "record", id: path } };
    if (path === "recipes.grade") return { path, type: recipeType, ref: { kind: "record", id: path },
      record: { id: path, type: recipeType, value: { path: "grade", properties: { contrast: 1.1 } } } };
    return undefined;
  }, resolveAsset: () => { throw new Error("Visual Adjustment reads explicit references only"); } });
  const output = await decode();
  assert.deepEqual(output.records.map((record) => record.type), [visualAdjustmentTypes.header, visualAdjustmentTypes.spec]);
  const { id: _id, ...withoutId } = child.attributes;
  await assert.rejects(async () => decode(withoutId as typeof child.attributes), /id must be text/u);
});

test("Visual Adjustment owns one editable Recipe vocabulary across Where and How", () => {
  const companion = visualAdjustmentStudioTrackCompanions[0]!;
  const recipe = companion.bindings?.find((binding) => binding.name === "appearance")?.recipe;
  assert.equal(recipe?.bindings.length, 16);
  assert.ok(recipe?.bindings.every((binding) => binding.writable === true));
  assert.deepEqual(new Set(companion.inspector?.map((field) => field.domain)), new Set(["where", "how"]));
  assert.equal(companion.inspector?.some((field) => field.binding === "appearance.contrast"), true);
  assert.equal(companion.inspector?.some((field) => field.binding === "appearance.rotation"), true);
  assert.equal(studioContributionFromPackage("@hypit/visual-adjustment", hypitPackage.facets).tracks.length, 1);
});
