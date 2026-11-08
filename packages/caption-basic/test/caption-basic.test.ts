import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCaptionCuePayload,
  replaceCaptionWord,
  retimeCaptionUnit,
  type CaptionDocument,
  type LocalCaptionTiming,
} from "@hypit/caption";
import {
  createNleTerminalLinkHostFromFacets,
  lowerNleProjectToHtmlProgram,
} from "../../html-video/src/index.js";
import { applyNleTransaction, createNleProject } from "@hypit/nle";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import { hypitPackage } from "../src/activation.js";
import {
  appendCaptionHiddenOverride,
  appendCaptionStyleOverride,
  createCaptionNleMaterialization,
  createCaptionPresentation,
  scheduleCaptionPresentation,
  type CaptionStyle,
} from "../src/index.js";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const domain = sealLocalTemporalDomain({ id: "interview:source-time", duration: at(6) });

const document: CaptionDocument = {
  id: "transcript",
  words: [
    { id: "word-one", unitId: "unit-one", text: "First", separatorBefore: "", attributes: [] },
    { id: "word-two", unitId: "unit-two", text: "Second", separatorBefore: "", attributes: [] },
    { id: "word-three", unitId: "unit-three", text: "Third", separatorBefore: "", attributes: [] },
  ],
  units: [
    { id: "unit-one", wordIds: ["word-one"] },
    { id: "unit-two", wordIds: ["word-two"] },
    { id: "unit-three", wordIds: ["word-three"] },
  ],
  cues: [
    { id: "cue-one", unitIds: ["unit-one"], role: "HOST" },
    { id: "cue-two", unitIds: ["unit-two"], role: "GUEST" },
    { id: "cue-three", unitIds: ["unit-three"], role: "HOST" },
  ],
};

const timing: LocalCaptionTiming = {
  documentId: document.id,
  domain,
  units: [
    { unitId: "unit-one", regions: [{ start: { position: at(0), side: "after" },
      end: { position: at(1), side: "before" } }] },
    { unitId: "unit-two", regions: [{ start: { position: at(2), side: "after" },
      end: { position: at(3), side: "before" } }] },
    { unitId: "unit-three", regions: [{ start: { position: at(4), side: "after" },
      end: { position: at(5), side: "before" } }] },
  ],
};

const base: CaptionStyle = { id: "base", family: "basic", parameters: {
  color: "#ffffff", karaoke: { mode: "trail", transition: "wipe", activeColor: "#ffd54a" },
} };
const host: CaptionStyle = { id: "host", family: "basic", parameters: { color: "#7dd3fc" } };

test("Basic Caption schedules role, hidden and one-Cue presentation without changing content timing", () => {
  const presentation = appendCaptionHiddenOverride(appendCaptionStyleOverride(
    createCaptionPresentation(base),
    { id: "host-role", selector: { roles: ["HOST"] } },
    host,
  ), { id: "hide-middle", selector: { cues: ["cue-two"] } });
  const schedule = scheduleCaptionPresentation(document, timing, presentation);
  assert.deepEqual(schedule.cues.map((cue) => cue.presentation), [
    { kind: "style", styleId: "host" },
    { kind: "hidden" },
    { kind: "style", styleId: "host" },
  ]);
  assert.deepEqual(schedule.cues.map((cue) => cue.regions), timing.units.map((unit) => unit.regions));
});

test("Basic Caption materializes complete editable Karaoke Items and registers only NLE terminal facets", () => {
  const empty = createNleProject({
    id: "caption-project", name: "Captions", editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
  });
  const project = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [],
    },
  }] });
  const materialized = applyNleTransaction(project, createCaptionNleMaterialization(project, {
    id: "story", track: "captions", document, timing, presentation: base, at: at(0),
    picture: { layout: { x: 0, y: 800, width: 1920, height: 280, fit: "fill" }, effects: [] },
  }));
  assert.equal(hypitPackage.modules.length, 0);
  assert.equal(materialized.tracks[0]?.items.length, 3);
  const first = materialized.tracks[0]!.items[0]!;
  assert.equal(first.kind, "component");
  if (first.kind !== "component") throw new Error("Caption did not materialize as a Component Item.");
  const parameters = first.parameters as Record<string, unknown>;
  assertCaptionCuePayload(parameters.caption, first.duration);
  const renamed = replaceCaptionWord(parameters.caption, "word-one", "Changed");
  assert.equal(renamed.words[0]?.text, "Changed");
  const retimed = retimeCaptionUnit(renamed, "unit-one", at(0), at(1), first.duration);
  assert.deepEqual(retimed.units[0]?.end, at(1));
  const html = lowerNleProjectToHtmlProgram(materialized,
    createNleTerminalLinkHostFromFacets(hypitPackage.facets),
    { numerator: 30, denominator: 1 });
  assert.match(html.html, /data-caption-unit="unit-one"/u);
  assert.match(html.html, /linear-gradient\(90deg/u);
});

test("Caption Cue payload rejects invalid family-defined Word attributes", () => {
  assert.throws(() => assertCaptionCuePayload({
    documentId: "transcript",
    cueId: "cue-one",
    words: [{
      id: "word-one",
      unitId: "unit-one",
      text: "First",
      separatorBefore: "",
      attributes: [{ name: "face", value: Number.NaN }],
    }],
    units: [{ id: "unit-one", wordIds: ["word-one"], start: at(0), end: at(1) }],
  }), /attribute face value is invalid/u);
});
