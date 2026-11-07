import assert from "node:assert/strict";
import test from "node:test";

import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import {
  compileAudiovisualAuthorSpec,
} from "../../audiovisual-author/src/index.js";
import {
  compileAudiovisualHtmlProgram,
  visualProgramHtmlSource,
} from "@hypit/audiovisual-html";
import {
  createNleTerminalLinkHostFromFacets,
  lowerNleProjectToHtmlProgram,
} from "../../html-video/src/index.js";
import { htmlVisual } from "@hypit/html-program";
import {
  applyNleTransaction,
  createNleProject,
} from "@hypit/nle";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  appendCaptionHiddenOverride,
  appendCaptionStyleOverride,
  assertCaptionDocument,
  captionHtmlSource,
  captionProgramSource,
  captionUnitEvent,
  createCaptionPresentation,
  createCaptionNleMaterialization,
  projectCaptionCues,
  scheduleCaptionPresentation,
  type CaptionComponentSpec,
  type CaptionDocument,
  type CaptionStyle,
  type LocalCaptionTiming,
} from "../src/index.js";
import { hypitPackage as captionHypitPackage } from "../src/activation.js";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const domain = sealLocalTemporalDomain({ id: "interview:source-time", duration: at(6) });
const pictureDomain = sealLocalSpatialDomain({ id: "main:picture", region: {
  x: 0, y: 0, width: 1920, height: 1080,
} });

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

const style: CaptionStyle = { id: "main", family: "basic", parameters: {} };
const hostStyle: CaptionStyle = { id: "host", family: "basic", parameters: { color: "#7dd3fc" } };
const guestStyle: CaptionStyle = { id: "guest", family: "basic", parameters: { color: "#f0abfc" } };
const impactStyle: CaptionStyle = { id: "impact", family: "basic", parameters: { fontSizePx: 72 } };
const spec: CaptionComponentSpec = { id: "captions", pictureDomain, selection: { kind: "all" } };

const rolePresentation = appendCaptionStyleOverride(appendCaptionStyleOverride(
  createCaptionPresentation(style),
  { id: "host-role", selector: { roles: ["HOST"] } }, hostStyle,
), { id: "guest-role", selector: { roles: ["GUEST"] } }, guestStyle);
const finalPresentation = appendCaptionStyleOverride(appendCaptionHiddenOverride(
  rolePresentation,
  { id: "pause-middle", selector: { cues: ["cue-two"] } },
), { id: "impact-ending", selector: { cues: ["cue-three"] } }, impactStyle);

test("three cues remain one data-driven ProgramSource and publish typed events", () => {
  assert.doesNotThrow(() => assertCaptionDocument(document));
  const source = captionProgramSource(spec, document, timing, style);
  assert.deepEqual(Object.keys(source.outputs), ["picture"]);
  const picture = source.outputs.picture;
  assert.equal(picture?.kind, "signal");
  if (picture?.kind !== "signal") throw new Error("Caption Picture output is not a signal.");
  assert.deepEqual(picture.domain, domain);
  assert.deepEqual(captionUnitEvent(timing, { unitId: "unit-two", edge: "start" }), {
    domain,
    regions: [{ start: { position: at(2), side: "after" },
      end: { position: at(2), side: "after" } }],
  });
});

test("ordered source-local rules cover roles, temporary silence and one-off restyling", () => {
  const roles = scheduleCaptionPresentation(spec, document, timing, rolePresentation);
  assert.deepEqual(roles.cues.map((cue) => cue.presentation), [
    { kind: "style", styleId: "host" },
    { kind: "style", styleId: "guest" },
    { kind: "style", styleId: "host" },
  ]);
  const final = scheduleCaptionPresentation(spec, document, timing, finalPresentation);
  assert.deepEqual(final.cues.map((cue) => [cue.cueId, cue.presentation, cue.overrideId]), [
    ["cue-one", { kind: "style", styleId: "host" }, "host-role"],
    ["cue-two", { kind: "hidden" }, "pause-middle"],
    ["cue-three", { kind: "style", styleId: "impact" }, "impact-ending"],
  ]);
});

test("Caption timing and presentation bake once into ordinary editable NLE blocks", () => {
  const base: CaptionStyle = { id: "editorial", family: "basic", parameters: {
    color: "#ffffff", background: "#000000cc", fontSize: 40,
  } };
  const impact: CaptionStyle = { id: "editorial-impact", family: "basic", parameters: {
    color: "#ff0000", background: "#000000cc", fontSize: 56,
  } };
  const presentation = appendCaptionStyleOverride(appendCaptionHiddenOverride(
    createCaptionPresentation(base),
    { id: "hide-middle", selector: { cues: ["cue-two"] } },
  ), { id: "style-ending", selector: { cues: ["cue-three"] } }, impact);
  const empty = createNleProject({
    id: "caption-materialization", name: "Caption materialization",
    editRate: { numerator: 2, denominator: 1 },
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
  });
  const project = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [],
    },
  }] });
  const transaction = createCaptionNleMaterialization(project, {
    id: "transcript-use", track: "captions", document, timing, presentation, at: at(3),
    picture: {
      layout: { x: 0, y: 800, width: 1920, height: 280, fit: "fill" }, effects: [],
    },
  });
  assert.deepEqual(transaction.commands.map((command) => command.kind), ["item.add", "item.add"]);
  const materialized = applyNleTransaction(project, transaction);
  assert.deepEqual(materialized.tracks[0]?.items.map((item) => [
    item.id, item.kind, item.start, item.duration,
  ]), [
    ["transcript-use:cue-one", "component", at(3), at(1)],
    ["transcript-use:cue-three", "component", at(7), at(1)],
  ]);

  const html = lowerNleProjectToHtmlProgram(materialized,
    createNleTerminalLinkHostFromFacets(captionHypitPackage.facets),
    { numerator: 2, denominator: 1 });
  assert.match(html.html, />First</u);
  assert.doesNotMatch(html.html, />Second</u);
  assert.match(html.html, />Third</u);
  assert.match(html.html, /#ff0000/u);
});

test("one source-bound Caption occurrence renders all three internal cues", () => {
  const video: ProgramSource = { id: "video", outputs: { picture: {
    kind: "signal", type: pictureType, domain, spatialDomain: pictureDomain,
  } } };
  const captions = captionProgramSource(spec, document, timing, finalPresentation);
  const program = compileAudiovisualAuthorSpec({
    id: "main", duration: at(6), pictureDomain,
    sources: { video: { binding: "video" }, captions: { binding: "captions" } },
    occurrences: {
      video: { source: "video", at: at(0), outputs: { picture: {} } },
      captions: { source: "captions", time: { kind: "source", occurrence: "video", output: "picture" },
        outputs: { picture: {} } },
    },
    picture: { output: { kind: "over", inputs: [
      { kind: "use", occurrence: "video", output: "picture" },
      { kind: "use", occurrence: "captions", output: "picture" },
    ] } },
  }, { sources: { video, captions } });
  assert.deepEqual(Object.keys(program.occurrences).sort(), ["captions", "video"]);
  const mapping = program.occurrences.captions?.selections.picture;
  assert(mapping?.kind === "signal");
  const projection = projectCaptionCues(spec, document, timing, finalPresentation, mapping.mapping);
  assert.equal(projection.cues.length, 3);
  assert.deepEqual(projection.cues.map((cue) => [cue.cueId, cue.text, cue.occurrenceRegions?.length]), [
    ["cue-one", "First", 1], ["cue-two", "Second", 1], ["cue-three", "Third", 1],
  ]);
  assert.deepEqual(Object.keys(program.occurrences).sort(), ["captions", "video"]);
  const html = compileAudiovisualHtmlProgram(program, { sources: [
    visualProgramHtmlSource("video", "picture", htmlVisual({ html: "<div></div>" })),
    captionHtmlSource(spec, document, timing, finalPresentation),
  ] }, {
    id: "captions-test", sampling: { frameRate: { numerator: 2, denominator: 1 } },
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    pictureMapping: sealSpatialMap({ target: pictureDomain, source: pictureDomain,
      transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 } }),
  });
  assert.equal((html.html.match(/<div data-caption-cue=/gu) ?? []).length, 3);
  assert.match(html.html, /data-caption-presentation="hidden"/u);
  assert.match(html.html, /data-caption-presentation="impact"/u);
  assert.match(html.html, /frameRate/u);
});

test("a caption event can place another component through the video occurrence mapping", () => {
  const video: ProgramSource = { id: "video", outputs: { picture: {
    kind: "signal", type: pictureType, domain, spatialDomain: pictureDomain,
  } } };
  const calloutDomain = sealLocalTemporalDomain({ id: "callout:source-time", duration: at(1) });
  const callout: ProgramSource = { id: "callout", outputs: { picture: {
    kind: "signal", type: pictureType, domain: calloutDomain, spatialDomain: pictureDomain,
  } } };
  const program = compileAudiovisualAuthorSpec({
    id: "event-follow", duration: at(6), pictureDomain,
    sources: { video: { binding: "video" }, callout: { binding: "callout" } },
    occurrences: {
      video: { source: "video", at: at(0), outputs: { picture: {} } },
      callout: { source: "callout", time: {
        kind: "event", occurrence: "video", output: "picture",
        event: captionUnitEvent(timing, { unitId: "unit-two", edge: "start" }),
        require: "unique",
      }, outputs: { picture: {} } },
    },
    picture: { output: { kind: "over", inputs: [
      { kind: "use", occurrence: "video", output: "picture" },
      { kind: "use", occurrence: "callout", output: "picture" },
    ] } },
  }, { sources: { video, callout } });
  assert.deepEqual(program.occurrences.callout?.placement.start, at(2));
});
