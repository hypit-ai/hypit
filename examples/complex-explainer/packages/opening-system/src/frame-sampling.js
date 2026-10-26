import { exactTemporalValueFromFrames, sealTemporalMap } from "@hypit/temporal";

/** Relate Film-frame positions to an already prepared exact media domain. */
export function preparedSampling(id, targetFrameRate, targetFrames, sourceDomain, pieces) {
  const target = { id: `${id}:occurrence`, duration: exactTemporalValueFromFrames(targetFrames,
    { frameRate: targetFrameRate }) };
  return sealTemporalMap({ stages: [{ target, source: structuredClone(sourceDomain), pieces: pieces.map((piece) => ({
    target: {
      start: exactTemporalValueFromFrames(piece.target.startFrame, { frameRate: targetFrameRate }),
      end: exactTemporalValueFromFrames(piece.target.endFrameExclusive, { frameRate: targetFrameRate }),
    },
    sourceAtStart: exactTemporalValueFromFrames(piece.sourceAtStartFrame, { frameRate: targetFrameRate }),
    rate: piece.rate,
  })) }] });
}
