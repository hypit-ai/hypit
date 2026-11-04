import assert from "node:assert/strict";
import test from "node:test";

import {
  createTemporalMapEvaluator,
  exactTemporalValue,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
} from "@hypit/temporal/algebra";

import { sourceFrameAt } from "../src/sampling.js";
import type { VideoSlot } from "../src/sampling.js";

const seconds = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

function slot(reconstruction: VideoSlot["reconstruction"]): VideoSlot {
  const target = sealLocalTemporalDomain({ id: "output", duration: seconds(1) });
  const source = sealLocalTemporalDomain({ id: "source", duration: seconds(2) });
  const sampling = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: seconds(0), end: seconds(1) },
    sourceAtStart: seconds(3, 5),
    rate: { numerator: 0, denominator: 1 },
  }] }] });
  return {
    id: "slot", elementId: "slot-element", kind: "media",
    startFrame: 0, endFrameExclusive: 1,
    usage: { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 1 }] },
    src: "source.mp4", sourceKey: "source", streamIndex: 0,
    picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    codedWidth: 16, codedHeight: 16,
    sampleAspectRatio: { numerator: 1, denominator: 1 }, rotation: 0,
    presentationStart: exactTemporalZero(),
    evaluateSampling: createTemporalMapEvaluator(sampling),
    samplingGrid: { frameRate: { numerator: 1, denominator: 1 } },
    reconstruction,
  };
}

test("nearest Picture reconstruction selects the closest discrete source frame", () => {
  const frames = { timestamps: [0n, 10n], timeBase: { numerator: 1n, denominator: 10n } };
  assert.equal(sourceFrameAt(slot(undefined), 0, frames), 0);
  assert.equal(sourceFrameAt(slot({ kind: "nearest" }), 0, frames), 1);
});
