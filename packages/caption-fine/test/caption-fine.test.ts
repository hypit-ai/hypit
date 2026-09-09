import assert from "node:assert/strict";
import test from "node:test";

import type { CaptionProgram, TimedCaptionProjection } from "@hypit/caption";
import type { FontArtifactRef } from "@hypit/media";
import { sealProgramSpace } from "@hypit/program-space";
import { captionDocument, parseScript } from "@hypit/script";
import type { SpatialRegionTimeline } from "@hypit/spatial";
import type { SvsRecipe } from "@hypit/svs";

import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  fineCaptionParameters,
  fineCaptionStyle,
  renderFineCaption,
  scheduleFineCaption,
} from "../src/index.js";

const font: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    resource: fixtureResource("caption-fine-font"),
    size: 1_024,
    mediaType: "font/woff2",
  } }],
  weight: 800,
  style: "normal",
};

const recipe: SvsRecipe = {
  path: "caption.base",
  properties: {
    "stack-order": 70,
    x: 0.5,
    y: 0.9,
    width: 0.8,
    height: 0.24,
    "anchor-x": "center",
    "anchor-y": "bottom",
    align: "center",
    "block-align": "end",
    "inline-size": "fixed",
    wrap: "word",
    "max-lines": 2,
    "max-words-per-line": 1,
    size: 56,
    "line-height": 1.05,
    fill: "#FFFFFF",
    "stroke-width": 2,
    "shadow-color": "#000000",
    "shadow-opacity": 0.7,
    "shadow-blur": 8,
    "shadow-spread": 1,
    background: "#000000CC",
    padding: "8 12",
    radius: 10,
    "cue-shadow-color": "#000000",
    "cue-shadow-opacity": 0.4,
    "cue-shadow-y": 4,
    "cue-shadow-blur": 10,
    "lead-frames": 4,
    "tail-frames": 6,
    handoff: "cut",
  },
};

function fixture(script = "<line>one two || three four</line>") {
  const parsed = parseScript("caption-fine.svml", script);
  const document = captionDocument(parsed, "story.caption", "story");
  const style = fineCaptionStyle("plain", recipe, [font]);
  const program: CaptionProgram = {
    id: "captions",
    documentId: document.id,
    styles: [style],
    runs: [{ id: "captions:run:1", styleId: style.id, unitIds: document.units.map((unit) => unit.id) }],
    wordRuns: [],
    mutedUnitIds: [],
  };
  const [first, second, third, fourth] = document.units;
  assert.ok(first && second && third && fourth);
  const projection: TimedCaptionProjection = {
    spaceId: "test-space",
    narrativeId: "story",
    documentId: document.id,
    cues: [
      {
        id: "captions:cue:1", styleId: style.id, startFrame: 10, endFrameExclusive: 30,
        units: [
          { unitId: first.id, startFrame: 10, endFrameExclusive: 20 },
          { unitId: second.id, startFrame: 20, endFrameExclusive: 30 },
        ],
      },
      {
        id: "captions:cue:2", styleId: style.id, startFrame: 36, endFrameExclusive: 56,
        units: [
          { unitId: third.id, startFrame: 36, endFrameExclusive: 46 },
          { unitId: fourth.id, startFrame: 46, endFrameExclusive: 56 },
        ],
      },
    ],
  };
  return { document, program, projection };
}

test("Fine Caption freezes complete Where, How and visible-envelope parameters", () => {
  const parameters = fineCaptionParameters(recipe, [font]);
  assert.deepEqual(parameters.placement, {
    x: 0.5, y: 0.9, width: 0.8, height: 0.24, anchorX: "center", anchorY: "bottom",
  });
  assert.equal(parameters.layout.maxLines, 2);
  assert.equal(parameters.layout.maxWordsPerLine, 1);
  assert.equal(parameters.typography.exactFonts[0]?.weight, 800);
  assert.equal(parameters.basePaint.shadow.spreadPx, 1);
  assert.deepEqual(parameters.timing, { leadFrames: 4, tailFrames: 6, handoff: "cut" });

});

test("Fine Caption schedules visibility outside semantic Word timing and cuts only the handoff", () => {
  const { document, program, projection } = fixture();
  const schedule = scheduleFineCaption(projection, program, document);
  assert.deepEqual(schedule.cues.map((cue) => ({
    semantic: [cue.semanticStartFrame, cue.semanticEndFrameExclusive],
    visible: [cue.visibleStartFrame, cue.visibleEndFrameExclusive],
  })), [
    { semantic: [10, 30], visible: [6, 36] },
    { semantic: [36, 56], visible: [36, 62] },
  ]);

  const track = renderFineCaption(schedule, program, document,
    sealProgramSpace({ id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  assert.deepEqual(track.presents.map((present) => present.span), [
    { startFrame: 6, endFrameExclusive: 36 },
    { startFrame: 36, endFrameExclusive: 62 },
  ]);
  assert.ok(track.presents[0]?.elements.some((element) => element.id === "line-break-1"));
  const cue = track.presents[0]?.elements.find((element) => element.id === "cue");
  assert.equal(cue?.style.find((declaration) => declaration.name === "overflow")?.value, "visible");
  assert.equal(cue?.style.some((declaration) => declaration.name === "max-height"), false);
  const atom = track.presents[0]?.elements.find((element) => element.id === "atom-1");
  assert.equal(atom?.style.find((declaration) => declaration.name === "white-space")?.value, "normal");
  assert.equal(atom?.style.find((declaration) => declaration.name === "overflow-wrap")?.value, "anywhere");
});

test("Fine Caption uniformly springs the whole Cue through exact scales", () => {
  const { document, program, projection } = fixture();
  const style = fineCaptionStyle("plain", {
    ...recipe,
    properties: {
      ...recipe.properties,
      "cue-enter": "spring",
      "cue-enter-frames": 4,
      "cue-enter-start-scale": 0.75,
    },
  }, [font]);
  const animatedProgram: CaptionProgram = { ...program, styles: [style] };
  const track = renderFineCaption(
    scheduleFineCaption(projection, animatedProgram, document),
    animatedProgram,
    document,
    sealProgramSpace({ id: "test-space", durationSec: 3,
      frameRate: { numerator: 30, denominator: 1 } }),
  );
  const cueMotion = track.presents[0]?.elements.find((element) => element.id === "cue-motion");
  const cueLoop = track.presents[0]?.elements.find((element) => element.id === "cue-loop");
  const cue = track.presents[0]?.elements.find((element) => element.id === "cue");
  const declarationAt = (frame: number, name: string): string | number | undefined =>
    cueMotion?.animation?.keyframes.find((keyframe) => keyframe.atFrame === frame)
      ?.style.find((declaration) => declaration.name === name)?.value;
  const scaleAt = (frame: number): number => {
    const transform = declarationAt(frame, "transform");
    assert.ok(typeof transform === "string");
    const match = /^scale\(([^)]+)\)$/u.exec(transform);
    assert.ok(match);
    return Number(match[1]);
  };

  assert.equal(declarationAt(0, "opacity"), 1);
  assert.equal(scaleAt(0), 0.75);
  assert.equal(scaleAt(2), 1.05);
  assert.equal(scaleAt(3), 0.95);
  assert.equal(declarationAt(0, "filter"), "none");
  assert.equal(cueLoop?.parent, cueMotion?.id);
  assert.equal(cue?.parent, cueLoop?.id);
  assert.equal(declarationAt(4, "transform"), "none");
  assert.equal(declarationAt(4, "filter"), "none");
});

test("Fine Caption follows measured Role regions and hides null Frames", () => {
  const { document, program, projection } = fixture(`<line>
  <BOY>one two || three four
</line>`);
  const space = sealProgramSpace({ id: "test-space", durationSec: 3,
    frameRate: { numerator: 30, denominator: 1 } });
  const regions: SpatialRegionTimeline = {
    canvas: { widthPx: 1080, heightPx: 1920, origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square" },
    frameCount: 90,
    tracks: [{
      id: "BOY",
      frames: Array.from({ length: 90 }, (_, frame) => frame === 7 ? null : ({
        xPx: 100 + frame, yPx: 300 + frame, widthPx: 200, heightPx: 240,
      })),
    }],
  };
  const track = renderFineCaption(scheduleFineCaption(projection, program, document), program, document, space, regions);
  const placement = track.presents[0]?.elements.find((element) => element.id === "placement");
  const declarationAt = (frame: number, name: string): string | number | undefined =>
    placement?.animation?.keyframes[frame]?.style.find((declaration) => declaration.name === name)?.value;
  assert.equal(placement?.style.find((declaration) => declaration.name === "left")?.value, "0px");
  assert.equal(placement?.style.find((declaration) => declaration.name === "top")?.value, "0px");
  assert.equal(declarationAt(0, "transform"), "translate(206px,306px) translate(-50%,-100%)");
  assert.equal(declarationAt(0, "opacity"), 1);
  assert.equal(declarationAt(1, "opacity"), 0);
  assert.equal(declarationAt(2, "opacity"), 1);
});

test("Fine Caption keeps authored placement when a Cue Role has no measured track", () => {
  const { document, program, projection } = fixture(`<line>
  <BOY>one two || three four
</line>`);
  const space = sealProgramSpace({ id: "test-space", durationSec: 3,
    frameRate: { numerator: 30, denominator: 1 } });
  const regions: SpatialRegionTimeline = {
    canvas: { widthPx: 1080, heightPx: 1920, origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square" },
    frameCount: 90,
    tracks: [{ id: "WIFE", frames: Array.from({ length: 90 }, () => null) }],
  };
  const track = renderFineCaption(scheduleFineCaption(projection, program, document), program, document, space, regions);
  const placement = track.presents[0]?.elements.find((element) => element.id === "placement");
  assert.equal(placement?.style.find((declaration) => declaration.name === "left")?.value, "50%");
  assert.equal(placement?.style.find((declaration) => declaration.name === "top")?.value, "90%");
  assert.equal(placement?.animation, undefined);
});

test("Fine Caption rejects a Cue that exceeds its structural row budget instead of clipping Paint", () => {
  const { document, program, projection } = fixture();
  const constrained = fineCaptionStyle("plain", {
    ...recipe,
    properties: { ...recipe.properties, "max-lines": 1 },
  }, [font]);
  const constrainedProgram: CaptionProgram = { ...program, styles: [constrained] };
  const schedule = scheduleFineCaption(projection, constrainedProgram, document);
  assert.throws(
    () => renderFineCaption(schedule, constrainedProgram, document,
      sealProgramSpace({ id: "test-space", durationSec: 3,
        frameRate: { numerator: 30, denominator: 1 } })),
    /constructs 2 rows.+maximum is 1/u,
  );
});

test("Fine Caption applies authored mute before it schedules the visible envelope", () => {
  const { document, program, projection } = fixture();
  const muted: CaptionProgram = { ...program, mutedUnitIds: [projection.cues[0]!.units[0]!.unitId] };
  const schedule = scheduleFineCaption(projection, muted, document);
  assert.deepEqual(schedule.cues[0]?.units, [projection.cues[0]!.units[1]]);
  assert.equal(schedule.cues[0]?.semanticStartFrame, projection.cues[0]!.units[1]!.startFrame);
});

test("Fine Caption gives overlapping acoustic Words one current Karaoke owner", () => {
  const { document, program, projection } = fixture();
  const style = fineCaptionStyle("plain", {
    ...recipe,
    properties: { ...recipe.properties, karaoke: "current", "karaoke-transition": "step" },
  }, [font]);
  const karaokeProgram: CaptionProgram = { ...program, styles: [style] };
  const firstCue = projection.cues[0]!;
  const overlapped: TimedCaptionProjection = {
    ...projection,
    cues: [{
      ...firstCue,
      units: [
        { ...firstCue.units[0]!, endFrameExclusive: 21 },
        firstCue.units[1]!,
      ],
    }, projection.cues[1]!],
  };
  const track = renderFineCaption(
    scheduleFineCaption(overlapped, karaokeProgram, document),
    karaokeProgram,
    document,
    sealProgramSpace({ id: "test-space", durationSec: 3,
      frameRate: { numerator: 30, denominator: 1 } }),
  );
  const firstActive = track.presents[0]?.elements.find((element) => element.id === "atom-1-active");
  const secondActive = track.presents[0]?.elements.find((element) => element.id === "atom-2-active");
  const opacityAt = (element: typeof firstActive, frame: number): string | number | undefined =>
    element?.animation?.keyframes.find((keyframe) => keyframe.atFrame === frame)
      ?.style.find((declaration) => declaration.name === "opacity")?.value;
  // Cue visibility starts at Frame 6, so global handoff Frame 20 is local Frame 14.
  assert.equal(opacityAt(firstActive, 14), 0);
  assert.equal(opacityAt(secondActive, 14), 1);
});

test("Fine Caption rejects token-specific Style runs instead of disguising a structural caption", () => {
  const { document, program, projection } = fixture();
  const word = document.words[0]!;
  const styled: CaptionProgram = {
    ...program,
    wordRuns: [{ id: "captions:word-run:1", styleId: "plain", wordIds: [word.id] }],
  };
  assert.throws(
    () => scheduleFineCaption(projection, styled, document),
    /one uniform token rule/u,
  );
});
