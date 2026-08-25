import assert from "node:assert/strict";
import test from "node:test";

import type { FineCaptionSchedule } from "@hypit/caption-fine";
import { compositionTypes } from "@hypit/composition";
import { narrativeTypes } from "@hypit/narrative";
import type { CaptionDocument } from "@hypit/narrative";
import type { StudioTrackCompanionContext, StudioEntityDraft } from "@hypit/studio-adapter";

import { captionFineInspectorFields, captionFineStudioTrackCompanions } from "../src/index.js";

test("Caption Companion owns Inspector grouping", () => {
  const declared = (name: string) => captionFineInspectorFields.find((field) => field.binding === `program.${name}`);
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
      id: "cue-1",
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
      { id: "word-1", unitId: "unit-1", segmentId: "segment-1", turnId: "turn-1", text: "真实", attributes: [] },
      { id: "word-2", unitId: "unit-1", segmentId: "segment-1", turnId: "turn-1", text: "字幕", attributes: [] },
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
        outputPorts: [{ name: "schedule", ref: "captions.schedule", type: "FineCaptionSchedule" }],
        references: [{
          input: "document", name: "story.caption", ref: "story.caption", type: "CaptionDocument",
          typeRef: narrativeTypes.captionDocument,
        }],
      },
      value: { visualIr: "hypit.visual-ir@1", id: "captions", presents: [] },
    },
    spans: [{ id: "cue-1", startFrame: 8, endFrameExclusive: 24, stackOrder: 70 }],
    values: new Map<string, unknown>([["captions.schedule", schedule], ["story.caption", document]]),
    temporalBindings: [],
    semantic: { spaceId: "speech", narrativeId: "story", presentation: { family: "speech", tone: "teal", icon: "timeline", lane: { heightPx: 45 } }, anchors: [], segments: [], tokens: [], selections: [], moments: [], provenance: { output: "speech", outputRef: "speech", origin: "source", status: "resolved", errors: [] } },
    generic: () => [base],
  } satisfies StudioTrackCompanionContext;
  const adapter = captionFineStudioTrackCompanions.find((candidate) => candidate.id === "track")!;
  const [cue] = adapter.project!(context);
  assert.deepEqual(cue?.display, {
    title: "Caption",
    layers: [{ kind: "text", role: "content", text: "真实字幕" }],
  });
  assert.deepEqual(cue?.parameterReferences, { program: "caption-alt" });
  assert.deepEqual([cue?.startFrame, cue?.endFrameExclusive], [8, 24]);
});
