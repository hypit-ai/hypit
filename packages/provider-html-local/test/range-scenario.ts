import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { compileHtmlProgram, htmlVisual, htmlVisualElement } from "@hypit/html-program";
import type { BlobRef } from "@hypit/protocol";
import type { PictureInterpretation } from "@hypit/media";
import { sealTimeline } from "@hypit/timeline";
import { frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { exactTemporalZero } from "@hypit/temporal";

function videoElement(
  artifact: BlobRef,
  sampling: ReturnType<typeof frameSamplingMapFixture>,
  picture: PictureInterpretation = {
    colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
  },
) {
  return htmlVisualElement({
    id: "video-layout",
    kind: "program",
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    program: htmlVisual({
      html: '<div class="source">{{source}}</div>',
      css: ".source{position:absolute;inset:0;width:64px;height:64px}.source video{position:absolute;inset:0;width:64px;height:64px}",
    }),
    slots: [{ name: "source", element: {
      id: "video", kind: "video" as const,
      source: { source: artifact, streamIndex: 0, presentationStart: exactTemporalZero(),
        sourceDomain: structuredClone(sampling.stages.at(-1)!.source),
        interpretation: { codedWidth: 64, codedHeight: 64, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const, picture } },
      style: [], muted: true, sampling,
    } }],
  });
}

function rangeComposition(artifact: BlobRef) {
  const space = sealTimeline({ id: "range-space", frameCount: 18, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "video", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 18 },
      root: videoElement(artifact, frameSamplingMapFixture({ targetFrameRate: space.frameRate, targetFrames: 18,
        sourceFrameRate: space.frameRate, sourceFrames: 4, pieces: [
          { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
            rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
          { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 }, rate: { numerator: 0, denominator: 1 } },
          { target: { startFrame: 8, endFrameExclusive: 12 }, sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 2 } },
          { target: { startFrame: 12, endFrameExclusive: 18 }, sourceAtStart: { numerator: 4, denominator: 1 },
            rate: { numerator: -1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
        ] })) }],
  });
  return sealComposition({ id: "range-video", visual: { canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space);
}

export function htmlRangeDocument(artifact: BlobRef) {
  return compileHtmlProgram(rangeComposition(artifact));
}

export function htmlRetiringSourceDocument(artifact: BlobRef) {
  const space = sealTimeline({ id: "retiring-source-space", frameCount: 8,
    frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "retiring-video", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 4 },
      root: videoElement(artifact, frameSamplingMapFixture({ targetFrameRate: space.frameRate, targetFrames: 4,
        sourceFrameRate: space.frameRate, sourceFrames: 4, pieces: [{
          target: { startFrame: 0, endFrameExclusive: 4 }, sourceAtStart: { numerator: 0, denominator: 1 },
          rate: { numerator: 1, denominator: 1 },
        }] })) }],
  });
  return compileHtmlProgram(sealComposition({ id: "retiring-source-video", visual: { canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [{ kind: "track", id: track.id, track }] } }, audio: { contributions: [] } }, space));
}
