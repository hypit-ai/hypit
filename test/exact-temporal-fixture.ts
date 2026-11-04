import {
  exactTemporalValueFromFrames,
  scaleExactTemporalValue,
  sealTemporalMap,
} from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";

type FrameRate = { readonly numerator: number; readonly denominator: number };
type FrameRational = { readonly numerator: number; readonly denominator: number };

export function frameRangeFixture(startFrame: number, endFrameExclusive: number, frameRate: FrameRate) {
  return {
    start: exactTemporalValueFromFrames(startFrame, { frameRate }),
    end: exactTemporalValueFromFrames(endFrameExclusive, { frameRate }),
  };
}

function exactFramePosition(value: FrameRational, frameRate: FrameRate) {
  return scaleExactTemporalValue(exactTemporalValueFromFrames(value.numerator, { frameRate }),
    { numerator: 1, denominator: value.denominator });
}

/** Build exact test data from human-readable frame coordinates; production code never uses this adapter. */
export function frameSamplingMapFixture(input: {
  readonly targetId?: string;
  readonly sourceId?: string;
  readonly targetFrameRate: FrameRate;
  readonly targetFrames: number;
  readonly sourceFrameRate: FrameRate;
  readonly sourceFrames: number;
  readonly pieces: readonly {
    readonly target: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly sourceAtStart: FrameRational;
    readonly rate: FrameRational;
    readonly wrap?: { readonly startFrame: number; readonly endFrameExclusive: number };
  }[];
}): TemporalMap {
  const targetId = input.targetId ?? "fixture-occurrence";
  const sourceId = input.sourceId ?? "fixture-materialization";
  const target = { id: targetId,
    duration: exactTemporalValueFromFrames(input.targetFrames, { frameRate: input.targetFrameRate }) };
  const source = { id: sourceId,
    duration: exactTemporalValueFromFrames(input.sourceFrames, { frameRate: input.sourceFrameRate }) };
  return sealTemporalMap({ stages: [{ target, source,
    pieces: input.pieces.map((piece) => ({
      target: {
        start: exactTemporalValueFromFrames(piece.target.startFrame, { frameRate: input.targetFrameRate }),
        end: exactTemporalValueFromFrames(piece.target.endFrameExclusive, { frameRate: input.targetFrameRate }),
      },
      sourceAtStart: exactFramePosition(piece.sourceAtStart, input.sourceFrameRate),
      rate: piece.rate,
      ...(piece.wrap === undefined ? {} : { wrap: {
        start: exactTemporalValueFromFrames(piece.wrap.startFrame, { frameRate: input.sourceFrameRate }),
        end: exactTemporalValueFromFrames(piece.wrap.endFrameExclusive, { frameRate: input.sourceFrameRate }),
      } }),
    })),
  }] });
}
