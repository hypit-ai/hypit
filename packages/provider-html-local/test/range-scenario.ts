import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { compileHtmlProgram } from "@hypit/html-program";
import type { BlobRef } from "@hypit/protocol";
import { sealTimeline } from "@hypit/timeline";
import { frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { exactTemporalZero } from "@hypit/temporal";

function videoElement(artifact: BlobRef, sampling: ReturnType<typeof frameSamplingMapFixture>, style: readonly { name: string; value: string | number }[]) {
  return { id: "video", kind: "video" as const,
    source: { source: artifact, streamIndex: 0, presentationStart: exactTemporalZero(),
      sourceDomain: structuredClone(sampling.stages.at(-1)!.source),
      interpretation: { codedWidth: 64, codedHeight: 64, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const } },
    style, muted: true, sampling };
}

export function htmlRangeDocument(artifact: BlobRef) {
  const space = sealTimeline({ id: "range-space", frameCount: 18, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "video", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 18 },
      root: videoElement(artifact, frameSamplingMapFixture({ targetFrameRate: space.frameRate, targetFrames: 18,
        sourceFrameRate: space.frameRate, sourceFrames: 4, pieces: [
          { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
            rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
          { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 }, rate: { numerator: 0, denominator: 1 } },
          { target: { startFrame: 8, endFrameExclusive: 12 }, sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 2 } },
          { target: { startFrame: 12, endFrameExclusive: 18 }, sourceAtStart: { numerator: 4, denominator: 1 },
            rate: { numerator: -1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
        ] }), [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: "64px" }, { name: "height", value: "64px" }],
      ) }],
  });
  return compileHtmlProgram(sealComposition({ id: "range-video",
    canvas: { width: 64, height: 64, clearColor: "#000000" }, visual: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [] }), space);
}

export function htmlRetiringSourceDocument(artifact: BlobRef) {
  const space = sealTimeline({ id: "retiring-source-space", frameCount: 8,
    frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "retiring-video", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 4 },
      root: videoElement(artifact, frameSamplingMapFixture({ targetFrameRate: space.frameRate, targetFrames: 4,
        sourceFrameRate: space.frameRate, sourceFrames: 4, pieces: [{
          target: { startFrame: 0, endFrameExclusive: 4 }, sourceAtStart: { numerator: 0, denominator: 1 },
          rate: { numerator: 1, denominator: 1 },
        }] }), [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: "64px" }, { name: "height", value: "64px" }],
      ) }],
  });
  return compileHtmlProgram(sealComposition({ id: "retiring-source-video",
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    visual: { members: [{ kind: "track", id: track.id, track }] }, audio: [] }), space);
}
