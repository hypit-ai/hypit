import assert from "node:assert/strict";
import test from "node:test";

import { sealComposition, sealVisualTrack } from "@hypit/composition";
import type { Composition, Track } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";

import { assertHtmlProgram, compileHtmlProgram, restrictCompositionToBand } from "../src/document.js";

function composition(): Composition {
  return {
    id: "main",
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    tracks: [
      {
        kind: "visual", timelineId: "film", visualIr: "hypit.visual-ir@1", id: "background",
        presents: [
          { id: "bg", order: 0, z: 0, span: { startFrame: 0, endFrameExclusive: 90 }, elements: [] },
          { id: "captions", order: 1, z: 5, span: { startFrame: 0, endFrameExclusive: 90 }, elements: [] },
          { id: "badge", order: 2, z: 10, span: { startFrame: 0, endFrameExclusive: 90 }, elements: [] },
        ],
      },
      {
        kind: "visual", timelineId: "film", visualIr: "hypit.visual-ir@1", id: "overlay-only",
        presents: [
          { id: "above", order: 3, z: 20, span: { startFrame: 0, endFrameExclusive: 90 }, elements: [] },
        ],
      },
      {
        kind: "audio", timelineId: "film", id: "voice",
        clips: [],
      } as unknown as Track,
    ],
  } as unknown as Composition;
}

test("a z band keeps only the presents painted under the subject", () => {
  const restricted = restrictCompositionToBand(composition(), {
    minInclusive: Number.MIN_SAFE_INTEGER,
    maxExclusive: 10,
  });
  const visual = restricted.tracks.filter((track) => track.kind === "visual");
  assert.deepEqual(visual.map((track) => track.id), ["background"]);
  assert.deepEqual(
    (visual[0] as { presents: readonly { id: string }[] }).presents.map((present) => present.id),
    ["bg", "captions"],
  );
  // A visual track whose every Present is outside the band disappears completely.
  assert.equal(restricted.tracks.some((track) => "id" in track && track.id === "overlay-only"), false);
});

test("a z band leaves audio tracks untouched", () => {
  const restricted = restrictCompositionToBand(composition(), { minInclusive: 0, maxExclusive: 1 });
  assert.equal(restricted.tracks.filter((track) => track.kind === "audio").length, 1);
  const visual = restricted.tracks.filter((track) => track.kind === "visual");
  assert.equal(visual.length, 1, "only the track holding z=0 survives the 0..1 band");
  assert.deepEqual((visual[0] as { presents: readonly { id: string }[] }).presents.map((p) => p.id), ["bg"]);
});

test("a compiled pass contains only the presents inside its band", () => {
  const timeline = sealTimeline({ id: "band", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const lower = sealVisualTrack({
    timelineId: "band", visualIr: "hypit.visual-ir@1", id: "lower",
    presents: [{ id: "background", order: 0, z: 10, span: { startFrame: 0, endFrameExclusive: 30 },
      elements: [{ id: "bg", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] }] }],
  });
  const upper = sealVisualTrack({
    timelineId: "band", visualIr: "hypit.visual-ir@1", id: "upper",
    presents: [{ id: "badge", order: 0, z: 20, span: { startFrame: 0, endFrameExclusive: 30 },
      elements: [{ id: "mark", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] }] }],
  });
  const composition = sealComposition({
    id: "main", canvas: { width: 64, height: 64, clearColor: "#000000" }, tracks: [upper, lower],
  });

  const full = compileHtmlProgram(composition, timeline);
  assert.ok(full.html.includes('data-hypit-present-id="badge"'));
  const below = compileHtmlProgram(
    restrictCompositionToBand(composition, { minInclusive: Number.MIN_SAFE_INTEGER, maxExclusive: 15 }),
    timeline,
  );
  assert.ok(below.html.includes('data-hypit-present-id="background"'));
  assert.equal(below.html.includes('data-hypit-present-id="badge"'), false);
  // A restricted programme is still a valid programme: placeholders match its declared Artifacts.
  assert.doesNotThrow(() => assertHtmlProgram(below));
});

test("a z band refuses an empty or inverted window", () => {
  assert.throws(
    () => restrictCompositionToBand(composition(), { minInclusive: 5, maxExclusive: 5 }),
    /maxExclusive above minInclusive/u,
  );
  assert.throws(
    () => restrictCompositionToBand(composition(), { minInclusive: 9, maxExclusive: 2 }),
    /maxExclusive above minInclusive/u,
  );
});
