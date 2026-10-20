import { sealComposition, sealVisualTrack } from "@hypit/composition";
import { compileHtmlProgram } from "@hypit/html-program";
import type { BlobRef } from "@hypit/protocol";
import { sealTimeline } from "@hypit/timeline";

export function htmlRangeDocument(artifact: BlobRef) {
  const space = sealTimeline({ id: "range-space", frameCount: 12, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealVisualTrack({ id: "video", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 12 },
      order: 0, z: 0, elements: [{ id: "video", order: 0, kind: "video", artifact,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: "64px" }, { name: "height", value: "64px" }],
        sourceTime: { sourceFrameRate: space.frameRate, sourceFrameCount: 4, pieces: [
          { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
            rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
          { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 },
            rate: { numerator: 0, denominator: 1 } },
          { target: { startFrame: 8, endFrameExclusive: 12 }, sourceAtStart: { numerator: 0, denominator: 1 },
            rate: { numerator: 1, denominator: 2 } },
        ] },
      }] }],
  });
  return compileHtmlProgram(sealComposition({ id: "range-video",
    canvas: { width: 64, height: 64, clearColor: "#000000" }, tracks: [track] }), space);
}
