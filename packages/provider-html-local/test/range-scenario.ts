import {
  compileHtmlPictureProgram,
  htmlVisual,
  type HtmlPictureElement,
} from "@hypit/html-program";
import type { BlobRef } from "@hypit/protocol";
import type { PictureInterpretation, PreparedVisualSource } from "@hypit/media";
import {
  exactTemporalZero,
} from "@hypit/temporal";

import { frameSamplingMapFixture } from "../../../test/exact-temporal-fixture.js";

const frameRate = { numerator: 30, denominator: 1 } as const;
const picture: PictureInterpretation = {
  colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
  colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
};

function preparedSource(artifact: BlobRef, sourceDomain: PreparedVisualSource["sourceDomain"]): PreparedVisualSource {
  return {
    source: artifact,
    streamIndex: 0,
    presentationStart: exactTemporalZero(),
    sourceDomain: structuredClone(sourceDomain),
    interpretation: {
      codedWidth: 64,
      codedHeight: 64,
      sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0,
      picture,
    },
  };
}

function sampledVideoRoot(artifact: BlobRef, targetFrames: number, sourceFrames: number,
  pieces: Parameters<typeof frameSamplingMapFixture>[0]["pieces"]): HtmlPictureElement {
  const complete = frameSamplingMapFixture({ targetFrameRate: frameRate, targetFrames,
    sourceFrameRate: frameRate, sourceFrames, pieces });
  const sourceDomain = complete.stages.at(-1)!.source;
  const source = preparedSource(artifact, sourceDomain);
  const programme = htmlVisual({
    html: '<div class="source">{{source}}</div>',
    css: ".source{position:absolute;inset:0;width:64px;height:64px}.source video{position:absolute;inset:0;width:64px;height:64px}",
  });
  const video: HtmlPictureElement = {
      id: "video",
      kind: "video",
      spans: [{ startFrame: 0, endFrameExclusive: targetFrames }],
      source,
      sampling: complete,
      muted: true,
      style: [],
  };
  return {
      id: "video-layout",
      kind: "program",
      spans: [{ startFrame: 0, endFrameExclusive: targetFrames }],
      style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      program: programme,
      slots: [{ name: "source", element: video }],
  };
}

export function htmlRangeDocument(artifact: BlobRef) {
  return compileHtmlPictureProgram({
    id: "range-video",
    frameRate,
    frameCount: 18,
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    root: sampledVideoRoot(artifact, 18, 4, [
      { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
        rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
      { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 },
        rate: { numerator: 0, denominator: 1 } },
      { target: { startFrame: 8, endFrameExclusive: 12 }, sourceAtStart: { numerator: 0, denominator: 1 },
        rate: { numerator: 1, denominator: 2 } },
      { target: { startFrame: 12, endFrameExclusive: 18 }, sourceAtStart: { numerator: 4, denominator: 1 },
        rate: { numerator: -1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
    ]),
  });
}

export function htmlRetiringSourceDocument(artifact: BlobRef) {
  return compileHtmlPictureProgram({
    id: "retiring-source-video",
    frameRate,
    frameCount: 8,
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    root: { id: "retiring-root", kind: "box", spans: [{ startFrame: 0, endFrameExclusive: 8 }],
      style: [], children: [sampledVideoRoot(artifact, 4, 4, [{
        target: { startFrame: 0, endFrameExclusive: 4 },
        sourceAtStart: { numerator: 0, denominator: 1 },
        rate: { numerator: 1, denominator: 1 },
      }])] },
  });
}
