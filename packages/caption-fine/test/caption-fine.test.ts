import assert from "node:assert/strict";
import test from "node:test";

import type { CaptionDocument, LocalCaptionTiming } from "@hypit/caption";
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
  outlineColor: "#000000",
  outlineWidth: 4,
  karaoke: { mode: "trail", transition: "wipe", activeColor: "#ffd54a" },
  cueBox: { continuity: "joined", background: "#111827cc", paddingX: 14, paddingY: 8 },
  activeBox: { mode: "current", continuity: "joined", background: "#2563eb88", borderRadius: 8 },
  underline: { mode: "always", color: "#ffffff", thickness: 2, offset: 4 },
  activeUnderline: { mode: "current", color: "#ffd54a", thickness: 3, offset: 5, style: "wavy" },
  entry: { kind: "pop", frames: 5 },
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

  if (alice?.kind !== "component") throw new Error("Fine Caption fixture is not a Component.");
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
