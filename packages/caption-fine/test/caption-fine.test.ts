import assert from "node:assert/strict";
import test from "node:test";

import type { CaptionDocument, LocalCaptionTiming } from "@hypit/caption";
import { readHtmlVisual } from "@hypit/html-program";
import {
  createNleTerminalLinkHostFromFacets,
  lowerNleProjectToHtmlProgram,
} from "../../html-video/src/index.js";
import {
  applyNleTransaction,
  createNleAuthoringHostFromFacets,
  createNleProject,
  findNleItem,
} from "@hypit/nle";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import { hypitPackage } from "../src/activation.js";
import {
  appendCaptionHiddenOverride,
  appendCaptionStyleOverride,
  captionFineNleComponentSymbol,
  captionFineNleHtmlVideoResolver,
  captionFineNleResolver,
  createCaptionFineNleMaterialization,
  createCaptionPresentation,
  type CaptionStyle,
} from "../src/index.js";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const domain = sealLocalTemporalDomain({ id: "dialogue:source-time", duration: at(7) });

const document: CaptionDocument = {
  id: "dialogue",
  words: [
    { id: "alice-a", unitId: "unit-a", text: "Fine", separatorBefore: "", attributes: [] },
    { id: "alice-b", unitId: "unit-b", text: "Caption", separatorBefore: " ",
      attributes: [{ name: "face", value: "serif" }] },
    { id: "bob-a", unitId: "unit-c", text: "changes", separatorBefore: "", attributes: [] },
    { id: "hidden-a", unitId: "unit-d", text: "hidden", separatorBefore: "", attributes: [] },
  ],
  units: [
    { id: "unit-a", wordIds: ["alice-a"] },
    { id: "unit-b", wordIds: ["alice-b"] },
    { id: "unit-c", wordIds: ["bob-a"] },
    { id: "unit-d", wordIds: ["hidden-a"] },
  ],
  cues: [
    { id: "cue-alice", unitIds: ["unit-a", "unit-b"], role: "ALICE" },
    { id: "cue-bob", unitIds: ["unit-c"], role: "BOB" },
    { id: "cue-hidden", unitIds: ["unit-d"], role: "BOB" },
  ],
};

const timing: LocalCaptionTiming = {
  documentId: document.id,
  domain,
  units: [
    { unitId: "unit-a", regions: [{ start: { position: at(0), side: "after" },
      end: { position: at(1), side: "before" } }] },
    { unitId: "unit-b", regions: [{ start: { position: at(1), side: "after" },
      end: { position: at(2), side: "before" } }] },
    { unitId: "unit-c", regions: [{ start: { position: at(3), side: "after" },
      end: { position: at(4), side: "before" } }] },
    { unitId: "unit-d", regions: [{ start: { position: at(5), side: "after" },
      end: { position: at(6), side: "before" } }] },
  ],
};

const exactFont = {
  faces: [{
    sources: [{ artifact: {
      kind: "blob" as const,
      resource: "res_caption_font" as const,
      size: 32,
      mediaType: "font/woff2",
    } }],
    weight: 800,
    style: "normal" as const,
  }],
};

const base: CaptionStyle = { id: "base", family: "fine", parameters: {
  fonts: exactFont,
  color: "#ffffff",
  fontFamily: "Arial, sans-serif",
  language: "en",
  direction: "ltr",
  textTransform: "uppercase",
  variantCaps: "small-caps",
  kerning: "normal",
  blockAlign: "end",
  inlineSize: "fixed",
  wrap: "word",
  maxWordsPerLine: 1,
  maxLines: 2,
  overflow: "shrink",
  minimumScale: 0.65,
  outlineColor: "#000000",
  outlineWidth: 4,
  gradient: { from: "#ffffff", to: "#67e8f9", angleDeg: 90 },
  karaoke: { mode: "trail", transition: "wipe", activeColor: "#ffd54a" },
  activePaint: {
    color: "#fef08a",
    gradient: { from: "#fef08a", to: "#fb7185", angleDeg: 30 },
    outlineColor: "#7f1d1d",
    outlineWidth: 5,
    shadowColor: "#450a0aaa",
    shadowBlur: 8,
    shadowOffsetX: 2,
    shadowOffsetY: 4,
    shadowSpread: 2,
    glow: { color: "#facc15", opacity: 0.8, blur: 14, spread: 2 },
    longShadow: { color: "#7c2d12", opacity: 0.7, distance: 10, angleDeg: 35, steps: 10 },
  },
  cueBox: { continuity: "joined", background: "#111827cc", paddingX: 14, paddingY: 8,
    shadow: { color: "#000000", opacity: 0.65, blur: 12, offsetY: 5, spread: 2 } },
  activeBox: { mode: "current", continuity: "joined", background: "#2563eb88", borderRadius: 8,
    enter: "pop", exit: "fade", transitionFrames: 3 },
  underline: { mode: "always", color: "#ffffff", thickness: 2, offset: 4 },
  activeUnderline: { mode: "current", color: "#ffd54a", thickness: 3, offset: 5, style: "wavy" },
  entry: { kind: "elastic", frames: 8, startScale: 0.4 },
  exit: { kind: "wipe-right", frames: 6 },
  atom: { enter: "spring", enterFrames: 5, exit: "fade", exitFrames: 4, reveal: "typewriter" },
  activeResponse: { kind: "bounce", frames: 4, scale: 1.08 },
  loop: { kind: "float", target: "active-atom", periodFrames: 24, intensity: 2 },
  slideDistance: 36,
  shadowSpread: 1,
  glow: { color: "#22d3ee", opacity: 0.5, blur: 10, spread: 2 },
  longShadow: { color: "#082f49", opacity: 0.7, distance: 8, angleDeg: 45, steps: 8 },
  attributeFaces: [{ attribute: "face", value: "serif", fontFamily: "Georgia, serif", fontWeight: 700 }],
} };

const bob: CaptionStyle = { id: "bob", family: "fine", parameters: {
  color: "#f0abfc",
  outlineColor: "#4a044e",
  outlineWidth: 5,
  karaoke: { mode: "current", transition: "step", activeColor: "#86efac" },
  entry: { kind: "slide-up", frames: 6 },
} };

test("Fine Caption materializes role styles, hidden Cues and complete local word timing", () => {
  const presentation = appendCaptionHiddenOverride(appendCaptionStyleOverride(
    createCaptionPresentation(base),
    { id: "bob-role", selector: { roles: ["BOB"] } },
    bob,
  ), { id: "hide-one", selector: { cues: ["cue-hidden"] } });
  let project = createNleProject({
    id: "fine-caption", name: "Fine Caption", editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1080, height: 1920, clearColor: "#111827" },
  });
  project = applyNleTransaction(project, { revision: project.revision, commands: [{
    kind: "track.add",
    track: { id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [] },
  }] });
  project = applyNleTransaction(project, createCaptionFineNleMaterialization(project, {
    id: "dialogue-captions",
    track: "captions",
    document,
    timing,
    presentation,
    at: at(0),
    picture: { layout: { x: 60, y: 1380, width: 960, height: 340, fit: "fill" }, effects: [] },
  }));

  assert.equal(hypitPackage.modules.length, 1);
  assert.equal(project.tracks[0]!.items.length, 3);
  const [alice, bobItem, hidden] = project.tracks[0]!.items;
  assert.deepEqual(alice?.kind === "component" ? alice.component : undefined, captionFineNleComponentSymbol);
  assert.equal(hidden?.enabled, false);
  assert.equal((bobItem?.kind === "component" ? bobItem.parameters : null as unknown) !== null, true);
  assert.equal(alice?.kind === "component" ? captionFineNleResolver.resolve(alice, {
    project,
    track: project.tracks[0]!,
  }).source.outputs.picture?.kind : undefined, "signal");

  const html = lowerNleProjectToHtmlProgram(project,
    createNleTerminalLinkHostFromFacets(hypitPackage.facets),
    { numerator: 30, denominator: 1 });
  assert.match(html.html, /data-hypit-text-node="unit-a"/u);
  assert.ok(html.artifacts.some((entry) => entry.artifact.resource === "res_caption_font"));
  assert.match(html.html, /font-family:Georgia, serif/u);
  assert.match(html.html, /-webkit-text-stroke:8px #000000/u);
  assert.match(html.html, /linear-gradient\(90deg/u);
  assert.match(html.html, /data\.activeBox\.mode/u);
  assert.match(html.html, /data-caption-cue-union/u);
  assert.match(html.html, /hypitPaintLineUnion/u);
  assert.match(html.html, /textDecorationThickness/u);
  assert.match(html.html, /data-hypit-text-paint="long-shadow"/u);
  assert.match(html.html, /data-hypit-text-paint="glow"/u);
  assert.match(html.html, /data-caption-layout/u);
  assert.match(html.html, /font-variant-caps:small-caps/u);
  assert.match(html.html, /<br data-hypit-text-node="caption-row-/u);
  if (alice?.kind !== "component") throw new Error("Fine Caption fixture is not a Component.");
  const terminal = captionFineNleHtmlVideoResolver.resolve(alice, {
    project,
    track: project.tracks[0]!,
  }, captionFineNleResolver.resolve(alice, { project, track: project.tracks[0]! }));
  if (terminal.html?.implementation.kind !== "program") throw new Error("Fine Caption terminal is not a Program.");
  const visual = readHtmlVisual(terminal.html.implementation.program);
  const setup = visual.setup ?? "";
  assert.doesNotThrow(() => new Function("root", "data", "context", setup));
  assert.match(setup, /easeOutElastic/u);
  assert.match(setup, /data\.atom\.reveal === 'typewriter'/u);
  assert.match(setup, /data\.loop\.target === 'active-atom'/u);
  assert.match(setup, /data\.layout\.overflow !== 'shrink'/u);
  assert.match(setup, /data\.activePaint\.outline\.width/u);
  assert.match(setup, /data\.activePaint\.longShadow\.steps/u);
  assert.match(setup, /const activeBoxAt/u);
  assert.match(setup, /data\.entry\.startScale/u);
  const visualData = visual.data as {
    activePaint: { outline: { width: number } };
    cueBox: { shadow: { opacity: number } };
    activeBox: { enter: string; exit: string; transitionFrames: number };
    entry: { startScale: number };
  };
  assert.equal(visualData.activePaint.outline.width, 5);
  assert.equal(visualData.cueBox.shadow.opacity, 0.65);
  assert.deepEqual([visualData.activeBox.enter, visualData.activeBox.exit,
    visualData.activeBox.transitionFrames], ["pop", "fade", 3]);
  assert.equal(visualData.entry.startScale, 0.4);

  const authoring = createNleAuthoringHostFromFacets(hypitPackage.facets);
  const restyled = applyNleTransaction(project, authoring.planComponentParameterEdit(project, alice.id, {
    kind: "set-style",
    styleId: "manual",
    style: { color: "#22d3ee", outlineWidth: 0 },
  }));
  const restyledItem = findNleItem(restyled, alice.id).item;
  if (restyledItem.kind !== "component") throw new Error("Restyled Caption changed Item kind.");
  assert.deepEqual(restyledItem.parameters, {
    ...(alice.parameters as Record<string, unknown>),
    styleId: "manual",
    style: { color: "#22d3ee", outlineWidth: 0 },
  });
});

test("Fine Caption rejects family parameters the package does not own", () => {
  const project = applyNleTransaction(createNleProject({
    id: "invalid-fine", name: "Invalid Fine", editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [] },
  }] });
  const invalid: CaptionStyle = { id: "invalid", family: "fine", parameters: { semanticFollow: "forbidden" } };
  const materialized = applyNleTransaction(project, createCaptionFineNleMaterialization(project, {
    id: "invalid", track: "captions", document, timing, presentation: invalid, at: at(0),
    picture: { layout: { x: 0, y: 0, width: 1080, height: 300, fit: "fill" }, effects: [] },
  }));
  assert.throws(() => lowerNleProjectToHtmlProgram(materialized,
    createNleTerminalLinkHostFromFacets(hypitPackage.facets),
    { numerator: 30, denominator: 1 }), /field semanticFollow is unknown/u);
});

test("Caption visibility policy bakes lead, tail and same-role handoff into direct Item times", () => {
  const style: CaptionStyle = {
    id: "visible",
    family: "fine",
    parameters: { color: "#ffffff" },
    visibility: { lead: at(1), tail: at(2), handoff: "cut" },
  };
  const presentation = appendCaptionHiddenOverride(createCaptionPresentation(style), {
    id: "hide-last",
    selector: { cues: ["cue-hidden"] },
  });
  let project = createNleProject({
    id: "caption-envelope", name: "Caption envelope", editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
  });
  project = applyNleTransaction(project, { revision: project.revision, commands: [{
    kind: "track.add",
    track: { id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [] },
  }] });
  project = applyNleTransaction(project, createCaptionFineNleMaterialization(project, {
    id: "dialogue", track: "captions", document, timing, presentation, at: at(0),
    picture: { layout: { x: 0, y: 0, width: 1080, height: 320, fit: "fill" }, effects: [] },
  }));

  const [alice, bobItem, hidden] = project.tracks[0]!.items;
  assert.deepEqual([alice?.start, alice?.duration], [at(0), at(4)]);
  assert.deepEqual([bobItem?.start, bobItem?.duration], [at(2), at(3)]);
  assert.deepEqual([hidden?.start, hidden?.duration, hidden?.enabled], [at(5), at(3), false]);
  if (bobItem?.kind !== "component") throw new Error("Bob Caption is not a Component.");
  const bobCaption = (bobItem.parameters as { caption: { units: readonly { start: unknown }[] } }).caption;
  assert.deepEqual(bobCaption.units[0]?.start, at(1));
});
