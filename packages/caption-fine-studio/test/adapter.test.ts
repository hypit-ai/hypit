import assert from "node:assert/strict";
import test from "node:test";

import type { FineCaptionSchedule } from "@hypit/caption-fine";
import { compositionTypes } from "@hypit/composition";
import { narrativeTypes } from "@hypit/narrative";
import type { CaptionDocument } from "@hypit/narrative";
import type { StudioTrackCompanionContext, StudioEntityDraft } from "@hypit/studio-adapter";

import { captionFineInspectorFields, projectCaptionContents } from "../src/index.js";

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
    spaceId: "speech",
    narrativeId: "story",
    documentId: "story.caption",
    cues: [{
      id: "cue-1", cueId: "cue-1", visibility: [{startFrame:8,endFrameExclusive:24}],
      styleId: "caption-alt",
      semanticStartFrame: 10,
      semanticEndFrameExclusive: 20,
      visibleStartFrame: 8,
      visibleEndFrameExclusive: 24,
      units: [{ unitId: "unit-1", startFrame: 10, endFrameExclusive: 20 }],
    }],
  };
  const document: CaptionDocument = {
    id: "story.caption",
    narrativeId: "story",
    units: [{ id: "unit-1", segmentId: "segment-1", turnId: "turn-1", wordIds: ["word-1", "word-2"], sourceTokenIds: ["token-1"] }],
    words: [
      { id: "word-1", unitId: "unit-1", segmentId: "segment-1", turnId: "turn-1", text: "真实", spacedBefore: false, attributes: [] },
      { id: "word-2", unitId: "unit-1", segmentId: "segment-1", turnId: "turn-1", text: "字幕", spacedBefore: false, attributes: [] },
    ],
    cueBreaks: [],
  };
  const base: StudioEntityDraft = {
    id: "captions.track:cue-1", authoredId: "captions", display: { title: "cue-1", layers: [] },
    startFrame: 8, endFrameExclusive: 24, stackOrder: 70, presentId: "cue-1",
    elementRange: { start: 0, end: 80 },
  };
  const context = {
    track: {
      name: "captions.track", type: "VisualTrack", typeRef: compositionTypes.visualTrack, outputRef: "captions.track",
      candidateOrigin: "source", role: "track",
      trace: {
        surface: "track", module: { name: "@hypit/caption-fine", version: "1" }, authoredId: "captions",
        outputPorts: [{ name: "schedule", ref: "captions.schedule", type: "FineCaptionSchedule" }, { name: "content", ref: "captions.content", type: "TimedCaptionProjection" }],
        references: [{
          input: "document", name: "story.caption", ref: "story.caption", type: "CaptionDocument",
          typeRef: narrativeTypes.captionDocument,
        }],
      },
      value: { visualIr: "hypit.visual-ir@1", id: "captions", presents: [] },
    },
    spans: [{ id: "cue-1", startFrame: 8, endFrameExclusive: 24, stackOrder: 70 }],
    values: new Map<string, unknown>([["captions.schedule", schedule], ["captions.content", {documentId:document.id, cues:[{id:"cue-1",startFrame:10,endFrameExclusive:20,units:schedule.cues[0]!.units}]}], ["story.caption", document]]),
    temporalBindings: [],
    semantic: { spaceId: "speech", narrativeId: "story", presentation: { family: "speech", tone: "teal", icon: "timeline", lane: { heightPx: 45 } }, anchors: [], segments: [], tokens: [], selections: [], moments: [], provenance: { output: "speech", outputRef: "speech", origin: "source", status: "resolved", errors: [] } },
    generic: () => [base],
  } satisfies StudioTrackCompanionContext;
  const [cue] = projectCaptionContents(context);
  assert.deepEqual(cue?.display, {
    title: "#1",
    layers: [{ kind: "text", role: "content", text: "真实字幕" }],
  });
  assert.equal(cue?.presentation?.chrome, "standard");
  assert.equal(cue?.parameterReferences, undefined);
  assert.deepEqual([cue?.startFrame, cue?.endFrameExclusive], [10, 20]);
});

test("Caption Uses keep authored windows and child ownership even with no rendered content", async () => {
  const { projectCaption } = await import("../src/index.js");
  const { temporalTypes } = await import("@hypit/temporal");
  const { timelineFixture } = await import("../../../test/timeline-fixture.js");
  const { projectProgramWindow } = await import("../../../test/temporal-fixture.js");
  const timeline = timelineFixture({id:"film",durationSec:6,frameRate:{numerator:30,denominator:1}}, {segments:[{id:"a",frameCount:90},{id:"b",frameCount:90}]});
  const uses = ["base", "hidden"].map(id=>({styleId:id,window:projectProgramWindow({itemId:id,semantic:timeline,projection:{start:{ref:"program.start"},end:{ref:"program.end"}}})}));
  const context = {
    track:{outputRef:"captions.track",trace:{references:[{input:"document",typeRef:narrativeTypes.captionDocument,ref:"document"}],outputPorts:[{name:"content",ref:"content"},{name:"schedule",ref:"schedule"},{name:"program",ref:"program"}]}},
    placement:{children:uses.map((use,i)=>({range:{start:i*10,end:i*10+8},referenceAttributes:{style:use.styleId},values:[{type:temporalTypes.windowSpec,value:{id:use.window.subjectId}}]}))},
    values:new Map<string,unknown>([["document",{id:"document",units:[],words:[]}],["content",{documentId:"document",cues:[]}],["schedule",{cues:[]}],["program",{uses}]]),
    spans:[],temporalBindings:[],
  } as unknown as StudioTrackCompanionContext;
  const entities=projectCaption(context);
  assert.deepEqual(entities.map(item=>[item.display.title,item.startFrame,item.endFrameExclusive,item.elementRange]),[
    ["base",0,180,{start:0,end:8}],["hidden",0,180,{start:10,end:18}],
  ]);
  assert.ok(entities.every(item=>item.band==="uses" && item.presentation?.chrome==="standard"));
});
