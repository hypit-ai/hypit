import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { compileHtmlProgram, htmlVisual, htmlVisualElement } from "@hypit/html-program";
import type { BlobRef } from "@hypit/protocol";
import type { PictureInterpretation } from "@hypit/media";
import { sealTimeline } from "@hypit/timeline";
import { frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { exactTemporalValueFromFrames, exactTemporalZero, sealLocalTemporalDomain, sealTemporalMap } from "@hypit/temporal";

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
      css: ".source,.source>*{position:absolute;inset:0;width:64px;height:64px}.source [data-hypit-source-frame-image]{width:64px;height:64px}",
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

function hdr10VideoElement(artifact: BlobRef, sampling: ReturnType<typeof frameSamplingMapFixture>) {
  return videoElement(artifact, sampling, {
    colorPrimaries: "bt2020", colorTransfer: "pq", colorMatrix: "bt2020-ncl",
    colorRange: "limited", bitDepth: 10, alphaMode: "opaque",
  });
}

export function htmlHdr10SourceDocument(artifact: BlobRef) {
  const space = sealTimeline({ id: "hdr10-source-space", frameCount: 1,
    frameRate: { numerator: 30, denominator: 1 } });
  const sampling = frameSamplingMapFixture({ targetFrameRate: space.frameRate, targetFrames: 1,
    sourceFrameRate: space.frameRate, sourceFrames: 1, pieces: [{
      target: { startFrame: 0, endFrameExclusive: 1 }, sourceAtStart: { numerator: 0, denominator: 1 },
      rate: { numerator: 1, denominator: 1 },
    }] });
  const track = sealPresentVisualTrack({ id: "hdr10-video", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 1 },
      root: hdr10VideoElement(artifact, sampling) }],
  });
  return compileHtmlProgram(sealComposition({ id: "hdr10-source", visual: { picture: {
    colorPrimaries: "bt709", colorTransfer: "linear", referenceWhiteNits: 203,
    alphaMode: "premultiplied",
  } as const, canvas: { width: 64, height: 64, clearColor: "#000000" },
  root: { members: [{ kind: "track", id: track.id, track }] } }, audio: { contributions: [] } }, space));
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
  return sealComposition({ id: "range-video", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space);
}

export function htmlRangeDocument(artifact: BlobRef) {
  return compileHtmlProgram(rangeComposition(artifact));
}

export function htmlNestedRangeDocument(artifact: BlobRef) {
  const child = rangeComposition(artifact);
  const timeline = sealTimeline({ id: "nested-range-space", frameCount: 36,
    frameRate: { numerator: 30, denominator: 1 } });
  const target = sealLocalTemporalDomain({ id: "nested-range-occurrence",
    duration: exactTemporalValueFromFrames(timeline.frameCount, timeline) });
  const source = sealLocalTemporalDomain({ id: child.timeline.id,
    duration: exactTemporalValueFromFrames(child.timeline.frameCount, child.timeline) });
  const sampling = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: exactTemporalZero(), end: target.duration },
    sourceAtStart: exactTemporalZero(), rate: { numerator: 1, denominator: 2 },
  }] }] });
  const track = sealPresentVisualTrack({ id: "nested-range",
    timelineId: timeline.id, presents: [{ id: "nested-range-use",
      span: { startFrame: 0, endFrameExclusive: timeline.frameCount }, root: {
        id: "nested-range-composition", kind: "composition", composition: child, sampling,
      } }],
  });
  return compileHtmlProgram(sealComposition({ id: "nested-range-video", visual: {
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100,
      alphaMode: "premultiplied" } as const,
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    root: { members: [{ kind: "track", id: track.id, track }] },
  }, audio: { contributions: [] } }, timeline));
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
  return compileHtmlProgram(sealComposition({ id: "retiring-source-video", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [{ kind: "track", id: track.id, track }] } }, audio: { contributions: [] } }, space));
}
