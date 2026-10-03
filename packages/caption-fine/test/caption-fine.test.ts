import { projectProgramWindow } from "../../../test/temporal-fixture.js";
import { sealTimeline } from "@hypit/timeline";
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

function fixture(script = "<line>one two || three four</line>", styleRecipe: SvsRecipe = recipe) {
  const parsed = parseScript("caption-fine.svml", script);
  const document = captionDocument(parsed, "story.caption", "story");
  const style = fineCaptionStyle("plain", styleRecipe, [font]);
  const program: CaptionProgram = {
    id: "captions",
    documentId: document.id,
    styles: [style],
    uses: [{ styleId: style.id, window: projectProgramWindow({ itemId: "captions.use.1",
      semantic: sealTimeline({ id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 }, items: [] }),
      projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
    }) }],
  };
  const [first, second, third, fourth] = document.units;
  assert.ok(first && second && third && fourth);
  const projection: TimedCaptionProjection = {
    spaceId: "test-space",
    narrativeId: "story",
    documentId: document.id,
    cues: [
      {
        id: "captions:cue:1", startFrame: 10, endFrameExclusive: 30,
        units: [
          { unitId: first.id, startFrame: 10, endFrameExclusive: 20 },
          { unitId: second.id, startFrame: 20, endFrameExclusive: 30 },
        ],
      },
      {
        id: "captions:cue:2", startFrame: 36, endFrameExclusive: 56,
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
    sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
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
    sealTimeline({ items: [], id: "test-space", durationSec: 3,
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
  const space = sealTimeline({ items: [], id: "test-space", durationSec: 3,
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
  const space = sealTimeline({ items: [], id: "test-space", durationSec: 3,
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
      sealTimeline({ items: [], id: "test-space", durationSec: 3,
        frameRate: { numerator: 30, denominator: 1 } })),
    /constructs 2 rows.+maximum is 1/u,
  );
});

test("Fine Caption gives a hidden Style no Cue, background or decoration", () => {
  const { document, program, projection } = fixture();
  const hidden = { id: "hidden", rendering: null };
  const hiddenProgram: CaptionProgram = { ...program, styles: [hidden],
    uses: program.uses.map(use => ({ ...use, styleId: hidden.id })) };
  const hiddenProjection = { ...projection, cues: [] };
  const schedule = scheduleFineCaption(hiddenProjection, hiddenProgram, document);
  const visual = renderFineCaption(schedule, hiddenProgram, document,
    sealTimeline({ items: [], id: "test-space", durationSec: 3,
      frameRate: { numerator: 30, denominator: 1 } }));
  assert.deepEqual(schedule.cues, []);
  assert.deepEqual(visual.presents, []);
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
    sealTimeline({ items: [], id: "test-space", durationSec: 3,
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

function unevenChineseCaption(properties: SvsRecipe["properties"] = {}) {
  const { document, program, projection } = fixture("<line>你真好看</line>");
  const { "max-lines": _lines, "max-words-per-line": _words, ...flow } = recipe.properties;
  const style = fineCaptionStyle("plain", {
    ...recipe, properties: { ...flow, ...properties },
  }, [font]);
  const windows = [[10, 13], [13, 32], [36, 42], [42, 55]] as const;
  const timed: TimedCaptionProjection = {
    ...projection,
    cues: [{ ...projection.cues[0]!, endFrameExclusive: 55,
      units: document.units.map((unit, index) => ({ unitId: unit.id,
        startFrame: windows[index]![0], endFrameExclusive: windows[index]![1] })),
    }],
  };
  const styled = { ...program, styles: [style] };
  const track = renderFineCaption(scheduleFineCaption(timed, styled, document), styled, document,
    sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  return { track, windows };
}

function numericStyleAt(element: import("@hypit/composition").VisualElement, frame: number, name: string): number {
  const frames = element.animation!.keyframes;
  const left = [...frames].reverse().find((item) => item.atFrame <= frame)!;
  const right = frames.find((item) => item.atFrame > frame) ?? left;
  const value = (item: typeof left) => Number(item.style.find((item) => item.name === name)!.value);
  return left === right ? value(left)
    : value(left) + (value(right) - value(left)) * (frame - left.atFrame) / (right.atFrame - left.atFrame);
}

for (const mode of ["current", "trail"] as const) test(`shared-text groups use existing ${mode} whole-unit caption effects`, () => {
  const make = (script: string) => {
    const { document, program, projection } = fixture(script);
    const style = fineCaptionStyle("plain", { ...recipe, properties: { ...recipe.properties,
      karaoke: mode, "karaoke-transition": "step", "active-box": mode, "active-underline": mode,
    } }, [font]);
    const styled = { ...program, styles: [style] };
    return renderFineCaption(scheduleFineCaption(projection, styled, document), styled, document,
      sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  };
  const track = make('<line><动效|><组件化|> || <直接|><复用|></line>');
  assert.deepEqual(track, make('<line><动效|动效><组件化|组件化> || <直接|直接><复用|复用></line>'));
  const present = track.presents[0]!;
  for (const [index, [start, end]] of [[10, 20], [20, 30]].entries()) {
    for (const suffix of ["active", "underline", "box"]) {
      const element = present.elements.find(item => item.id === `atom-${index + 1}-${suffix}`)!;
      assert.ok(element);
      for (let frame = present.span.startFrame; frame < present.span.endFrameExclusive; frame++) {
        assert.equal(numericStyleAt(element, frame - present.span.startFrame, "opacity"),
          Number(frame >= start! && (mode === "trail" || frame < end!)));
      }
    }
  }
});

for (const mode of ["current", "trail"] as const) {
  test(`Chinese ${mode} karaoke, underline and boxes follow unequal character times and pauses`, () => {
    const { track, windows } = unevenChineseCaption({
      karaoke: mode, "active-underline": mode, "active-box": mode,
    });
    const present = track.presents[0]!;
    for (const [index, [start, end]] of windows.entries()) {
      for (const suffix of ["active", "underline", "box"]) {
        const element = present.elements.find((item) => item.id === `atom-${index + 1}-${suffix}`)!;
        assert.ok(element);
        for (let frame = present.span.startFrame; frame < present.span.endFrameExclusive; frame++) {
          const active = frame >= start && (mode === "trail" || frame < end);
          assert.equal(numericStyleAt(element, frame - present.span.startFrame, "opacity"), Number(active),
            `${suffix} character ${index + 1} at frame ${frame}`);
        }
        assert.equal(element.animation!.keyframes.some((keyframe) =>
          keyframe.style.some(({ name }) => name === "clip-path")), false);
      }
    }
    assert.equal(present.elements.find((item) => item.id === "cue")!.style
      .some(({ name }) => name === "column-gap"), false);
  });
}

test("Chinese wipe remains an explicit within-character effect with each character's own interval", () => {
  const { track, windows } = unevenChineseCaption({ karaoke: "trail", "karaoke-transition": "wipe" });
  const present = track.presents[0]!;
  for (const [index, [start, end]] of windows.entries()) {
    const active = present.elements.find((item) => item.id === `atom-${index + 1}-active`)!;
    const clip = (frame: number) => active.animation!.keyframes
      .find((item) => item.atFrame === frame - present.span.startFrame)!.style[0]!.value;
    assert.equal(clip(start), "inset(0 100% 0 0)");
    assert.equal(clip(end), "inset(0 0% 0 0)");
  }
});

test("Chinese typewriter reveals whole characters at their own starts, including uneven holds", () => {
  const { track, windows } = unevenChineseCaption({ "atom-reveal": "typewriter", karaoke: "trail" });
  const present = track.presents[0]!;
  for (const [index, [start]] of windows.entries()) {
    for (const layer of ["base", "active"]) {
      const glyph = present.elements.find((item) => item.id === `atom-${index + 1}-${layer}-1-grapheme-1`)!;
      assert.ok(glyph);
      for (let frame = present.span.startFrame; frame < present.span.endFrameExclusive; frame++) {
        assert.equal(numericStyleAt(glyph, frame - present.span.startFrame, "opacity"), Number(frame >= start));
      }
    }
  }
  assert.equal(present.elements.some((element) => element.animation?.keyframes.some((keyframe) =>
    keyframe.style.some(({ name }) => name === "clip-path"))), false);
});

test("Typewriter keeps combining graphemes whole and preserves unequal-width Latin letters", () => {
  const { document, program, projection } = fixture("<line>Wi e\u0301 || 繁體</line>");
  const style = fineCaptionStyle("plain", { ...recipe,
    properties: { ...recipe.properties, "atom-reveal": "typewriter" } }, [font]);
  const styled = { ...program, styles: [style] };
  const track = renderFineCaption(scheduleFineCaption(projection, styled, document), styled, document,
    sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  const text = track.presents[0]!.elements.filter((element) => element.kind === "text");
  assert.deepEqual(text.map((element) => element.text), ["W", "i", "e\u0301"]);
  assert.equal(numericStyleAt(text[0]!, 4, "opacity"), 1);
  assert.equal(numericStyleAt(text[1]!, 8, "opacity"), 0);
  assert.equal(numericStyleAt(text[1]!, 9, "opacity"), 1);
  assert.equal(numericStyleAt(text[2]!, 14, "opacity"), 1);
});

test("Caption handoff follows placed time and retains simultaneous spoken envelopes", () => {
  const { document, program, projection } = fixture();
  const first = projection.cues[0]!;
  const second = projection.cues[1]!;
  const overlapping = { ...second, startFrame: 20, endFrameExclusive: 40,
    units: second.units.map(unit => ({ ...unit, startFrame: unit.startFrame - 16,
      endFrameExclusive: unit.endFrameExclusive - 16 })) };
  // Reverse declaration order: placement decides temporal neighbors, not Script order.
  const schedule = scheduleFineCaption({ ...projection, cues: [overlapping, first] }, program, document);
  assert.deepEqual(schedule.cues.map(cue => [cue.semanticStartFrame, cue.semanticEndFrameExclusive]), [[10, 30], [20, 40]]);
  assert.deepEqual(schedule.cues.map(cue => [cue.visibleStartFrame, cue.visibleEndFrameExclusive]), [[6, 36], [16, 46]]);
  const track = renderFineCaption(schedule, program, document,
    sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  assert.equal(track.presents.filter(present => present.span.startFrame <= 25 && present.span.endFrameExclusive > 25).length, 2);
});


test("Caption Surface wires one Timeline to both ordinary and tracked-region rendering", async () => {
  const { decodeFineCaptionTrackSurface } = await import("../src/surface.js");
  const { timelineTypes } = await import("@hypit/timeline");
  const { narrativeTypes } = await import("@hypit/narrative");
  const { captionTypes } = await import("@hypit/caption");
  const { spatialTypes } = await import("@hypit/spatial");
  const types = { timeline: timelineTypes.track, document: narrativeTypes.captionDocument,
    program: captionTypes.program, regions: spatialTypes.regionTimeline };
  for (const tracking of [false, true]) {
    const names = tracking ? ["timeline", "document", "regions"] as const
      : ["timeline", "document"] as const;
    const attributes = Object.fromEntries(names.map(name => [name, { kind: "reference" as const, path: name }]));
    const result = await decodeFineCaptionTrackSurface({ sourceName: "caption.svml",
      element: { kind: "element", name: "fine:Track", attributes: { id: "captions", ...attributes },
        children: [], range: { start: 0, end: 1 } },
      resolveReference(path) {
        const type = types[path as keyof typeof types];
        return type === undefined ? undefined : { path, type, ref: { kind: "record", id: path } };
      },
      resolveAsset() { throw new Error("Caption assembly uses declared inputs."); },
    });
    const component = result.components[0]!;
    const fragment = result.fragments!.find(fragment => fragment.id === component.fragment)!;
    assert.deepEqual(Object.keys(component.inputs).sort(), fragment.inputs.map(input => input.name).sort());
    assert.deepEqual(component.inputs.timeline, { kind: "record", id: "timeline" });
    assert.equal(fragment.operations.some(operation => operation.producer.name === "project-program-space"), false);
  }
});

test("a Use beginning inside a Cue changes presentation without changing words or animation time", () => {
  const { document, program } = fixture("<line>test1 || test2 @{select} test3 || test4 @{/select}</line>");
  const timeline = sealTimeline({ id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 }, items: [] });
  const unit = (index: number) => ({ unitId: document.units[index]!.id, startFrame: 10 + index * 10, endFrameExclusive: 20 + index * 10 });
  const projection: TimedCaptionProjection = { spaceId: timeline.id, narrativeId: "story", documentId: document.id, cues: [
    { id: "c1", startFrame: 10, endFrameExclusive: 20, units: [unit(0)] },
    { id: "c2", startFrame: 20, endFrameExclusive: 40, units: [unit(1), unit(2)] },
    { id: "c3", startFrame: 40, endFrameExclusive: 50, units: [unit(3)] },
  ] };
  const emphasis = fineCaptionStyle("emphasis", { ...recipe, properties: { ...recipe.properties, "active-fill": "#FF6347", karaoke: "trail" } }, [font]);
  const window = (id:string,start:number,end:number) => projectProgramWindow({itemId:id,semantic:timeline,projection:{start:{ref:"absolute",at:{unit:"frames",value:start}},end:{ref:"absolute",at:{unit:"frames",value:end}}}});
  const changed: CaptionProgram = { ...program, styles: [...program.styles, emphasis], uses: [...program.uses, { styleId: emphasis.id, window: window("emphasis",30,50) }] };
  const schedule = scheduleFineCaption(projection, changed, document);
  const parts = schedule.cues.filter(cue=>cue.cueId==="c2");
  assert.equal(parts.length,2);
  assert.deepEqual(parts.map(cue=>cue.units), [[unit(1),unit(2)],[unit(1),unit(2)]]);
  assert.deepEqual(parts.map(cue=>cue.visibility), [[{startFrame:20,endFrameExclusive:30}],[{startFrame:30,endFrameExclusive:40}]]);
  assert.deepEqual(parts.map(cue=>cue.visibleStartFrame),[20,20]);
  const track = renderFineCaption(schedule,changed,document,timeline);
  const entered = track.presents.find(present=>present.id === parts[1]!.id)!;
  assert.equal(entered.span.startFrame,20);
  assert.deepEqual(entered.visibility,[{startFrame:30,endFrameExclusive:40}]);
  // Rendering the same Style over the whole timeline has identical animation data for this Cue.
  const whole: CaptionProgram = {...changed,uses:[{styleId:emphasis.id,window:window("whole",0,90)}]};
  const original = renderFineCaption(scheduleFineCaption(projection,whole,document),whole,document,timeline).presents.find(p=>p.id.endsWith(":c2"))!;
  assert.deepEqual(entered.elements,original.elements);

  const hidden: CaptionProgram = {...changed,styles:[...changed.styles,{id:"hidden",rendering:null}],uses:[...changed.uses,{styleId:"hidden",window:window("hide",32,35)}]};
  const resumed = scheduleFineCaption(projection,hidden,document).cues.find(cue=>cue.id===parts[1]!.id)!;
  assert.deepEqual(resumed.visibility,[{startFrame:30,endFrameExclusive:32},{startFrame:35,endFrameExclusive:40}]);
  assert.deepEqual(resumed.units,parts[1]!.units);
  assert.equal(resumed.visibleStartFrame,20);
});

test("Caption time windows select presentation, while Role filters preserve simultaneous speakers", () => {
  const { document, program, projection } = fixture("<line><A>one two || <B>three four</line>");
  const timeline = sealTimeline({id:"test-space",durationSec:3,frameRate:{numerator:30,denominator:1},items:[]});
  const overlap: TimedCaptionProjection = {...projection,cues:[projection.cues[0]!,{
    ...projection.cues[1]!,startFrame:15,endFrameExclusive:35,
    units:projection.cues[1]!.units.map((u,i)=>({...u,startFrame:15+i*10,endFrameExclusive:25+i*10})),
  }]};
  const hidden: CaptionProgram = {...program,styles:[...program.styles,{id:"hidden",rendering:null}],uses:[...program.uses,{
    role:"A",styleId:"hidden",window:projectProgramWindow({itemId:"hideA",semantic:timeline,projection:{start:{ref:"program.start"},end:{ref:"program.end"}}}),
  }]};
  const schedule = scheduleFineCaption(overlap,hidden,document);
  assert.equal(schedule.cues.length,1);
  assert.deepEqual(schedule.cues[0]!.units,overlap.cues[1]!.units);
  const noContent = scheduleFineCaption({...projection,cues:[]},program,document);
  assert.deepEqual(noContent.cues,[]);
  assert.deepEqual(scheduleFineCaption(projection,{...program,uses:[],styles:[]},document).cues,[]);
});

test("Caption Track Uses share the temporal author language and reject the removed Program edge", async () => {
  const { decodeFineCaptionTrackSurface } = await import("../src/surface.js");
  const { parseStructuredElement } = await import("@hypit/markup");
  const { timelineTypes } = await import("@hypit/timeline");
  const { narrativeTypes } = await import("@hypit/narrative");
  const { captionTypes } = await import("@hypit/caption");
  const refs: Record<string, import("@hypit/protocol").TypeRef> = { timeline: timelineTypes.track, document: narrativeTypes.captionDocument, style: captionTypes.style, selection:narrativeTypes.selection, moment:narrativeTypes.moment };
  const decode = async (body:string,extra="") => decodeFineCaptionTrackSurface({sourceName:"caption.svml",
    element:parseStructuredElement({name:"caption.svml",text:`<fine:Track id="captions" document={document} timeline={timeline} ${extra}>${body}</fine:Track>`},0).element,
    resolveReference(path){const type=refs[path];return type===undefined?undefined:{path,type,ref:{kind:"record" as const,id:path}};},
    resolveAsset(){throw new Error("No assets");},
  });
  for (const time of ['', 'during={selection}', 'at={moment} for="2s"', 'until={moment} for="12f"', 'start="2s" end="5s"']) {
    const result=await decode(`<fine:Use style={style} ${time}/>`);
    const track=result.components.find(component=>component.id==="captions")!;
    assert.ok(track.outputs.program);
    assert.ok(track.outputs.content);
    const fragment=result.fragments!.find(fragment=>fragment.id===track.fragment)!;
    assert.equal(fragment.operations.find(op=>op.id==="content")?.result.name,"caption");
    assert.ok(fragment.inputs.some(port=>port.name.endsWith("-window")));
    assert.equal(fragment.inputs.some(port=>port.name==="program"),false);
  }
  await assert.rejects(()=>decode('', 'program={old}'),/requires id, document, timeline/);
  await assert.rejects(()=>decode('<fine:Use style={style} selection={selection}/>'),/requires exactly one/);
});

test("Fine uses author separators in ordinary text, shared groups, active copies and joined boxes", () => {
  const { program, projection } = fixture();
  const { "max-lines": _lines, "max-words-per-line": _words, ...flow } = recipe.properties;
  const style = fineCaptionStyle("plain", { ...recipe, properties: { ...flow,
    karaoke: "trail", "active-underline": "trail", "active-box": "trail", "active-box-continuity": "joined",
  } }, [font]);
  const styled = { ...program, styles: [style] };
  const render = (source: string) => {
    const document = captionDocument(parseScript("spacing", `<line>${source}</line>`), "story.caption", "story");
    const timed: TimedCaptionProjection = { ...projection, cues: [{ ...projection.cues[0]!,
      startFrame: 10, endFrameExclusive: 70,
      units: document.units.map((unit, index) => ({ unitId: unit.id, startFrame: 10 + index * 5, endFrameExclusive: 15 + index * 5 })),
    }] };
    return renderFineCaption(scheduleFineCaption(timed, styled, document), styled, document,
      sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } })).presents[0]!.elements;
  };
  const grouped = render("<3개월 만에|> 완료했습니다");
  for (const id of ["atom-1-base-2", "atom-1-active-2", "atom-1-underline-2"]) {
    assert.equal(grouped.find(element => element.id === id)!.style.some(style => style.name === "margin-left"), false);
  }
  for (const id of ["atom-1-base-3", "atom-1-active-3", "atom-1-underline-3"]) {
    assert.equal(grouped.find(element => element.id === id)!.style.find(style => style.name === "margin-left")?.value, "14px");
  }
  const backgroundWords = grouped.filter(element => element.id.startsWith("joined-group-") && element.kind === "text");
  assert.deepEqual(backgroundWords.map(element => element.kind === "text" && element.text), ["3", "개월", "만에", "완료했습니다"]);
  assert.equal(grouped.find(element => element.id === "joined-group-0-word-2")!.style.find(style => style.name === "margin-left")?.value, "14px");
  assert.equal(grouped.find(element => element.id === "joined-gap-1")!.kind, "text");
  const chinese = render("是的 就是这样");
  assert.equal(chinese.find(element => element.id === "gap-2")!.style.find(style => style.name === "letter-spacing")?.value, "14px");
  assert.equal(chinese.find(element => element.id === "atom-2-entry")!.style.some(style => style.name === "margin-left"), false);
  const joined = render("3D");
  assert.equal(joined.some(element => element.style.some(style => (style.name === "column-gap" || style.name === "margin-left") && style.value !== "0px")), false);
});

test("Fine Caption paints emphasis keywords on the displayed text, independent of the spoken Word", () => {
  const emphasized: SvsRecipe = { ...recipe, properties: { ...recipe.properties,
    "emphasis-words": "two|three four", "emphasis-fill": "#FF3B30" } };
  assert.deepEqual(fineCaptionParameters(emphasized, [font]).emphasis.words, ["two", "three four"]);
  const { document, program, projection } = fixture(undefined, emphasized);
  const track = renderFineCaption(scheduleFineCaption(projection, program, document), program, document,
    sealTimeline({ items: [], id: "test-space", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  const bases = track.presents.flatMap((present) => present.elements)
    .filter((element) => /-base-\d+$/u.test(element.id) && element.kind === "text");
  const painted = (word: string) => JSON.stringify(bases.find((element) => "text" in element && element.text === word))
    .includes("#FF3B30");
  assert.equal(painted("one"), false, "a Word outside every keyword keeps the base fill");
  assert.equal(painted("two"), true);
  // A keyword spanning two Words paints both of them.
  assert.equal(painted("three"), true);
  assert.equal(painted("four"), true);
});

test("Fine Caption without emphasis keywords paints every Word with the base fill", () => {
  assert.deepEqual(fineCaptionParameters(recipe, [font]).emphasis.words, []);
});
