import assert from "node:assert/strict";
import test from "node:test";

import type { FineCaptionSchedule } from "../src/index.js";
import { captionTypes } from "@hypit/caption";
import type { CaptionDocument } from "@hypit/caption";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanionContext, StudioItemDraft } from "@hypit/studio-companion";

import { captionFineInspectorFields, projectCaptionContents, projectCaptionUses } from "../src/studio.js";

test("Caption Companion owns Inspector grouping", () => {
  const declared = (name: string) => captionFineInspectorFields.find((field) => field.binding === `style.${name}`);
  assert.equal(declared("x")?.domain, "where");
  assert.equal(declared("x")?.section.id, "region");
  assert.equal(declared("cue-shadow-blur")?.domain, "how");
  assert.equal(declared("active-box-enter")?.domain, "when");
  assert.equal(declared("lead-frames")?.section.id, "envelope");
});

test("Caption Companion projects Cue text and Style from public domain values", () => {
  const schedule: FineCaptionSchedule = {
    timelineId: "speech",
    documentId: "story.caption",
    cues: [{
      id: "cue-1", cueId: "cue-1", visibility: [{startFrame:8,endFrameExclusive:24}],
      styleId: "caption-alt",
      timedStartFrame: 10,
      timedEndFrameExclusive: 20,
      visibleStartFrame: 8,
      visibleEndFrameExclusive: 24,
      units: [{ unitId: "unit-1", startFrame: 10, endFrameExclusive: 20 }],
    }],
  };
  const document: CaptionDocument = {
    id: "story.caption",
    units: [{ id: "unit-1", wordIds: ["word-1", "word-2"] }],
    words: [
      { id: "word-1", unitId: "unit-1", text: "真实", separatorBefore: "", attributes: [] },
      { id: "word-2", unitId: "unit-1", text: "字幕", separatorBefore: "", attributes: [] },
    ],
    cues: [{ id: "cue-1", unitIds: ["unit-1"] }],
  };
  const base: StudioItemDraft = {
    id: "captions.track:cue-1", authoredId: "captions", display: { title: "cue-1", layers: [] },
    startFrame: 8, endFrameExclusive: 24, stackOrder: 70,
    terminalLinks: [{ spanId: "cue-1" }],
    elementLocation: { path: "captions.svml", range: { start: 0, end: 80 } },
  };
  const context = {
    track: {
      name: "captions.track", type: "VisualTrack", typeRef: compositionTypes.visualTrack, outputRef: "captions.track",
      role: "track",
      trace: {
        surface: "caption", module: { name: "@hypit/caption-fine", version: "1" }, authoredId: "captions",
        outputPorts: [{ name: "schedule", ref: "captions.schedule", type: "FineCaptionSchedule" }, { name: "timing", ref: "captions.timing", type: "CaptionTiming" }],
        references: [{
          input: "document", name: "story.caption", ref: "story.caption", type: "CaptionDocument",
          typeRef: captionTypes.document,
        }, {
          input: "timing", name: "story-captions", ref: "captions.timing", type: "CaptionTiming",
          typeRef: captionTypes.timing,
        }],
      },
      value: { visualIr: "hypit.visual-ir@1", id: "captions", items: [] },
    },
    spans: [{ id: "cue-1", startFrame: 8, endFrameExclusive: 24, stackOrder: 70 }],
    values: new Map<string, unknown>([["captions.schedule", schedule], ["captions.timing", {timelineId:"speech",documentId:document.id,units:schedule.cues[0]!.units}], ["story.caption", document]]),
    temporalBindings: [],
    temporalDomains: [],
    generic: () => [base],
  } satisfies StudioTrackCompanionContext;
  const [cue] = projectCaptionContents(context);
  assert.deepEqual(cue?.display, {
    title: "#1",
    layers: [{ kind: "text", role: "content", text: "真实字幕" }],
  });
  for (const [texts, separators, expected] of [
    [["3", "D"], ["", ""], "3D"],
    [["3", "개월"], ["", ""], "3개월"],
    [["是的", "就是这样"], ["", " "], "是的 就是这样"],
    [["hello", "world"], [" ", " "], "hello world"],
  ] as const) {
    const variant = { ...document, words: document.words.map((word, index) => ({ ...word,
      text: texts[index]!, separatorBefore: separators[index]!,
    })) };
    const values = new Map(context.values);
    values.set("story.caption", variant);
    assert.equal(projectCaptionContents({ ...context, values })[0]!.display.layers[0]!.kind, "text");
    assert.deepEqual(projectCaptionContents({ ...context, values })[0]!.display.layers,
      [{ kind: "text", role: "content", text: expected }]);
  }
  assert.equal(cue?.presentation?.chrome, "standard");
  assert.equal(cue?.parameterReferences, undefined);
  assert.deepEqual([cue?.startFrame, cue?.endFrameExclusive], [10, 20]);
});

test("Caption Uses stay in Inspector while Cues remain independent of rendered content", async () => {
  const { projectCaption } = await import("../src/studio.js");
  const { timelineFixture } = await import("../../../test/timeline-fixture.js");
  const { projectProgramWindow } = await import("../../../test/temporal-fixture.js");
  const timeline = timelineFixture({id:"film",frameCount: 180, frameRate: { numerator: 30, denominator: 1 }}, {segments:[{id:"a",frameCount:90},{id:"b",frameCount:90}]});
  const uses = [
    { id: "base", styleId: "base" },
    { id: "hidden", styleId: "hidden", window: projectProgramWindow({itemId:"hidden",semantic:timeline,projection:{start:{ref:"timeline.start"},end:{ref:"timeline.end"}}}) },
  ];
  const context = {
    track: {
      name: "captions.track", type: "VisualTrack", typeRef: compositionTypes.visualTrack,
      outputRef: "captions.track", role: "track", value: undefined,
      trace: {
        references: [
          { input: "document", name: "document", type: "CaptionDocument", typeRef: captionTypes.document, ref: "document" },
          { input: "timing", name: "timing", type: "CaptionTiming", typeRef: captionTypes.timing, ref: "timing" },
        ],
        outputPorts: [{ name: "schedule", ref: "schedule" }, { name: "program", ref: "program" }],
      },
    },
    placement: {
      sourcePath: "captions.svml", tag: "Caption", module: { name: "@hypit/caption-fine", version: "1" },
      surface: "caption", range: { start: 0, end: 20 }, records: [], values: [], outputs: [], outputPorts: [],
      attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: {}, referenceTypes: {},
      children: uses.map((use, i) => ({
        sourcePath: "captions.svml", tag: "Use", id: use.id, range: { start: i * 10, end: i * 10 + 8 },
        attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: { style: use.styleId },
        referenceTypes: {}, values: [],
      })),
    },
    values:new Map<string,unknown>([["document",{id:"document",units:[],words:[],cues:[]}],["timing",{timelineId:"film",documentId:"document",units:[]}],["schedule",{cues:[]}],["program",{uses}]]),
    spans: [], temporalBindings: [], temporalDomains: [], generic: () => [],
  } satisfies StudioTrackCompanionContext;
  assert.deepEqual(projectCaption(context), []);
  const objects=projectCaptionUses(context);
  assert.deepEqual(objects.map(item=>[item.title,item.elementLocation,item.inspector?.find(field=>field.id==="scope")?.value]),[
    ["base",{path:"captions.svml",range:{start:0,end:8}},"All matching cues"],["hidden",{path:"captions.svml",range:{start:10,end:18}},"hidden"],
  ]);
  assert.ok(objects.every(item=>item.parameterReferences?.style===item.title));
});
