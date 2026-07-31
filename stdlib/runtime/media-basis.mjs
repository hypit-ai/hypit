import { material, numberAttr, resolveAttr, stringAttr } from "./helpers.mjs";

function seconds(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(String(value).trim());
  if (!match) throw new Error(`invalid duration "${String(value)}"`);
  return Number(match[1]) * (match[2] === "ms" ? 0.001 : 1);
}

function canonicalFacet(value) {
  if (Array.isArray(value)) return value.map(canonicalFacet);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["source", "absoluteSource", "basisDigest"].includes(key))
    .map(([key, nested]) => [key, canonicalFacet(nested)]));
}

function frameRate(fps) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be positive and finite");
  if (Number.isInteger(fps)) return { numerator: fps, denominator: 1 };
  let numerator = Math.round(fps * 1_000_000);
  let denominator = 1_000_000;
  let left = numerator;
  let right = denominator;
  while (right) [left, right] = [right, left % right];
  numerator /= left;
  denominator /= left;
  return { numerator, denominator };
}

export default {
  abiVersion: "1",
  project(context) {
    const fps = numberAttr(context.element, "fps", 30);
    const rationalFps = frameRate(fps);
    const durationSec = seconds(stringAttr(context.element, "duration"));
    const sourceStartSec = seconds(stringAttr(context.element, "sourceStart", "0ms"));
    const durationFrames = Math.round(durationSec * fps);
    if (durationFrames <= 0) throw new Error("media-basis duration must resolve to positive frames");
    const sourceStartFrame = Math.round(sourceStartSec * fps);
    const sourceEndFrameExclusive = sourceStartFrame + durationFrames;
    const audioValue = material(resolveAttr(context, context.element, "audio"), "audio");
    const visualValue = context.element.attributes.visual
      ? material(resolveAttr(context, context.element, "visual"), "video")
      : undefined;
    const sourceMaps = [{
      id: "program:audio-map",
      sourceId: audioValue.id,
      sourceDigest: audioValue.contentDigest,
      sourceStartFrame,
      sourceEndFrameExclusive,
      programStartFrame: 0,
      programEndFrameExclusive: durationFrames,
    }];
    if (visualValue) {
      sourceMaps.push({
        id: "program:visual-map",
        sourceId: visualValue.id,
        sourceDigest: visualValue.contentDigest,
        sourceStartFrame,
        sourceEndFrameExclusive,
        programStartFrame: 0,
        programEndFrameExclusive: durationFrames,
      });
    }
    const alignmentSubjects = [{
      id: "program:audio",
      sourceId: audioValue.id,
      sourceDigest: audioValue.contentDigest,
      sourceMapId: "program:audio-map",
    }];
    const audio = [{
      id: "program:audio",
      sourceId: audioValue.id,
      sourceDigest: audioValue.contentDigest,
      source: audioValue.source,
      sourceMapId: "program:audio-map",
      sourceStartFrame,
      sourceEndFrameExclusive,
      programStartFrame: 0,
      programEndFrameExclusive: durationFrames,
      gain: 1,
    }];
    const unboundVisual = visualValue ? {
      type: "ProgramBoundVideo",
      source: visualValue.source,
      sourceId: visualValue.id,
      sourceDigest: visualValue.contentDigest,
      range: {
        startFrame: 0,
        endFrameExclusive: durationFrames,
        startSec: 0,
        endSec: durationFrames / fps,
      },
      mediaStartSec: sourceStartSec,
      playbackRate: 1,
      sourceMapId: "program:visual-map",
    } : undefined;
    const outcome = {
      contract: "svml.program-basis-outcome.v1",
      frameRate: rationalFps,
      originFrame: 0,
      durationFrames,
      alignmentSubjects,
      sourceMaps,
      audio: audio.map(({ source: _source, ...contribution }) => contribution),
      facets: canonicalFacet({ ...(unboundVisual ? { visual: unboundVisual } : {}) }),
    };
    const basisDigest = context.digest(outcome);
    const basis = {
      contract: "svml.program-basis.v1",
      frameRate: outcome.frameRate,
      originFrame: 0,
      durationFrames,
      basisDigest,
    };
    const facets = unboundVisual
      ? { visual: { ...unboundVisual, basisDigest } }
      : {};
    const production = {
      contract: "svml.temporal-basis-production.v1",
      basis,
      alignmentSubjects,
      sourceMaps,
      audio,
      facets,
      productionDigest: context.digest({
        implementation: context.instance.executionDigest,
        outcome,
      }),
    };
    return { outputs: { production, facets } };
  },
};
