import { elements, material, numberAttr, resolveAttr, stringAttr } from "./helpers.mjs";

function seconds(raw) {
  const match = /^([+-]?\d+(?:\.\d+)?)(ms|s)$/u.exec(String(raw).trim());
  if (!match) throw new Error(`invalid duration "${String(raw)}"`);
  return Number(match[1]) * (match[2] === "ms" ? 0.001 : 1);
}

function sourceWindow(raw) {
  const parts = String(raw).split("..");
  if (parts.length !== 2) throw new Error(`sourceWindow requires start .. end, received "${raw}"`);
  const startSec = seconds(parts[0]);
  const endSec = seconds(parts[1]);
  if (startSec < 0 || endSec <= startSec) throw new Error(`invalid sourceWindow "${raw}"`);
  return { startSec, endSec, durationSec: endSec - startSec };
}

function defaultJoin(element) {
  const kind = stringAttr(element, "defaultJoin", "cut");
  const duration = seconds(stringAttr(element, "defaultJoinDuration", "0ms"));
  if (kind === "cut") return { temporal: "cut", durationSec: 0, audio: "cut", visual: "cut" };
  if (kind === "crossfade") {
    if (duration <= 0) throw new Error("crossfade defaultJoinDuration must be positive");
    return { temporal: "overlap", durationSec: duration, audio: "crossfade", visual: "dissolve" };
  }
  if (kind === "gap") {
    if (duration <= 0) throw new Error("gap defaultJoinDuration must be positive");
    return { temporal: "gap", durationSec: duration, audio: "cut", visual: "cut" };
  }
  throw new Error(`unsupported defaultJoin "${kind}"`);
}

function explicitJoin(element, fallback) {
  const overlap = element.attributes.overlap;
  const gap = element.attributes.gap;
  if (overlap !== undefined && gap !== undefined) {
    throw new Error(`<join after="${stringAttr(element, "after")}"> cannot declare both overlap and gap`);
  }
  const temporal = overlap !== undefined ? "overlap" : gap !== undefined ? "gap" : "cut";
  const durationSec = overlap !== undefined
    ? seconds(overlap)
    : gap !== undefined
      ? seconds(gap)
      : 0;
  if (temporal !== "cut" && durationSec <= 0) throw new Error(`${temporal} duration must be positive`);
  const audio = stringAttr(element, "audio", temporal === "overlap" ? fallback.audio : "cut");
  const visual = stringAttr(element, "visual", temporal === "overlap" ? fallback.visual : "cut");
  if (!["cut", "crossfade"].includes(audio)) throw new Error(`unsupported audio join "${audio}"`);
  if (!["cut", "dissolve"].includes(visual)) throw new Error(`unsupported visual join "${visual}"`);
  if (temporal !== "overlap" && (audio === "crossfade" || visual === "dissolve")) {
    throw new Error(`${audio}/${visual} requires a temporal overlap`);
  }
  return {
    temporal,
    durationSec,
    audio,
    visual,
  };
}

function frame(secondsValue, fps) {
  return Math.round(secondsValue * fps);
}

function rationalFrameRate(fps) {
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

function canonicalFacet(value) {
  if (Array.isArray(value)) return value.map(canonicalFacet);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["source", "absoluteSource", "basisDigest"].includes(key))
    .map(([key, nested]) => [key, canonicalFacet(nested)]));
}

export default {
  abiVersion: "1",
  project(context) {
    const fps = numberAttr(context.element, "fps", 30);
    const rationalFps = rationalFrameRate(fps);
    const segmentElements = elements(context, "segment");
    const ids = segmentElements.map(segment => stringAttr(segment, "id"));
    if (new Set(ids).size !== ids.length) throw new Error("speech-assemble Segment ids must be unique");
    const fallback = defaultJoin(context.element);
    const overrides = new Map();
    for (const join of elements(context, "join")) {
      const after = stringAttr(join, "after");
      if (overrides.has(after)) throw new Error(`duplicate join after "${after}"`);
      if (!ids.includes(after) || ids.at(-1) === after) {
        throw new Error(`join after "${after}" must name a non-final Segment`);
      }
      overrides.set(after, explicitJoin(join, fallback));
    }

    const segments = [];
    const joins = [];
    let nextStartSec = 0;
    for (const [index, element] of segmentElements.entries()) {
      const id = ids[index];
      const script = resolveAttr(context, element, "script");
      if (!script || script.id !== id) throw new Error(`Segment "${id}" does not match its ScriptSegment`);
      const audio = material(resolveAttr(context, element, "audio"), "audio");
      const visual = element.attributes.visual
        ? material(resolveAttr(context, element, "visual"), "video")
        : undefined;
      const window = sourceWindow(stringAttr(element, "sourceWindow"));
      const startSec = nextStartSec;
      const endSec = startSec + window.durationSec;
      segments.push({ id, script, audio, visual, window, startSec, endSec });
      if (index >= segmentElements.length - 1) continue;
      const join = overrides.get(id) ?? fallback;
      joins.push({ after: id, ...join });
      nextStartSec = join.temporal === "overlap"
        ? endSec - join.durationSec
        : join.temporal === "gap"
          ? endSec + join.durationSec
          : endSec;
      if (nextStartSec < startSec) throw new Error(`join after "${id}" overlaps more than the Segment duration`);
    }

    const durationFrames = Math.max(...segments.map(segment => frame(segment.endSec, fps)));
    const frameRate = rationalFps;
    const sourceMaps = [];
    const alignmentSubjects = [];
    const audio = [];
    const unboundSegmentOutputs = {};
    for (const [index, segment] of segments.entries()) {
      const programStartFrame = frame(segment.startSec, fps);
      const programEndFrameExclusive = frame(segment.endSec, fps);
      const sourceStartFrame = frame(segment.window.startSec, fps);
      const sourceEndFrameExclusive = frame(segment.window.endSec, fps);
      const previousJoin = joins[index - 1];
      const nextJoin = joins[index];
      const audioMap = {
        id: `segment:${segment.id}:audio-map`,
        sourceId: segment.audio.id,
        sourceDigest: segment.audio.contentDigest,
        sourceStartFrame,
        sourceEndFrameExclusive,
        programStartFrame,
        programEndFrameExclusive,
      };
      sourceMaps.push(audioMap);
      alignmentSubjects.push({
        id: `segment:${segment.id}:speech`,
        sourceId: segment.audio.id,
        sourceDigest: segment.audio.contentDigest,
        sourceMapId: audioMap.id,
      });

      let audioEndFrameExclusive = programEndFrameExclusive;
      if (nextJoin?.temporal === "overlap" && nextJoin.audio === "cut") {
        audioEndFrameExclusive = frame(segments[index + 1].startSec, fps);
      }
      const fadeInFrames = previousJoin?.temporal === "overlap" && previousJoin.audio === "crossfade"
        ? frame(previousJoin.durationSec, fps)
        : 0;
      const fadeOutFrames = nextJoin?.temporal === "overlap" && nextJoin.audio === "crossfade"
        ? frame(nextJoin.durationSec, fps)
        : 0;
      const audioContribution = {
        id: `segment:${segment.id}:program-audio`,
        sourceId: segment.audio.id,
        sourceDigest: segment.audio.contentDigest,
        source: segment.audio.source,
        sourceMapId: audioMap.id,
        sourceStartFrame,
        sourceEndFrameExclusive: sourceStartFrame + (audioEndFrameExclusive - programStartFrame),
        programStartFrame,
        programEndFrameExclusive: audioEndFrameExclusive,
        gain: 1,
        ...(fadeInFrames ? { fadeInFrames } : {}),
        ...(fadeOutFrames ? { fadeOutFrames } : {}),
      };
      audio.push(audioContribution);

      const audioRange = {
        startFrame: programStartFrame,
        endFrameExclusive: audioEndFrameExclusive,
        startSec: programStartFrame / fps,
        endSec: audioEndFrameExclusive / fps,
      };
      const output = {
        audio: {
          type: "ProgramBoundAudio",
          source: segment.audio.source,
          sourceId: segment.audio.id,
          sourceDigest: segment.audio.contentDigest,
          range: audioRange,
          mediaStartSec: segment.window.startSec,
          playbackRate: 1,
          sourceMapId: audioMap.id,
          ...(fadeInFrames ? { fadeInFrames } : {}),
          ...(fadeOutFrames ? { fadeOutFrames } : {}),
        },
      };
      if (segment.visual) {
        const visualMap = {
          id: `segment:${segment.id}:visual-map`,
          sourceId: segment.visual.id,
          sourceDigest: segment.visual.contentDigest,
          sourceStartFrame,
          sourceEndFrameExclusive,
          programStartFrame,
          programEndFrameExclusive,
        };
        sourceMaps.push(visualMap);
        let visualEndFrameExclusive = programEndFrameExclusive;
        if (nextJoin?.temporal === "overlap" && nextJoin.visual === "cut") {
          visualEndFrameExclusive = frame(segments[index + 1].startSec, fps);
        }
        const visualFadeInFrames = previousJoin?.temporal === "overlap" && previousJoin.visual === "dissolve"
          ? frame(previousJoin.durationSec, fps)
          : 0;
        const visualFadeOutFrames = nextJoin?.temporal === "overlap" && nextJoin.visual === "dissolve"
          ? frame(nextJoin.durationSec, fps)
          : 0;
        output.visual = {
          type: "ProgramBoundVideo",
          source: segment.visual.source,
          sourceId: segment.visual.id,
          sourceDigest: segment.visual.contentDigest,
          range: {
            startFrame: programStartFrame,
            endFrameExclusive: visualEndFrameExclusive,
            startSec: programStartFrame / fps,
            endSec: visualEndFrameExclusive / fps,
          },
          mediaStartSec: segment.window.startSec,
          playbackRate: 1,
          sourceMapId: visualMap.id,
          ...(visualFadeInFrames ? { fadeInFrames: visualFadeInFrames } : {}),
          ...(visualFadeOutFrames ? { fadeOutFrames: visualFadeOutFrames } : {}),
        };
      }
      unboundSegmentOutputs[segment.id] = output;
    }
    const unboundFacets = {
      visual: {
        type: "ProgramBoundVideoSequence",
        segments: Object.fromEntries(Object.entries(unboundSegmentOutputs)
          .filter(([, value]) => value.visual)
          .map(([id, value]) => [id, value.visual])),
      },
    };
    const outcome = {
      contract: "svml.program-basis-outcome.v1",
      frameRate,
      originFrame: 0,
      durationFrames,
      alignmentSubjects,
      sourceMaps,
      audio: audio.map(({ source: _source, ...contribution }) => contribution),
      facets: canonicalFacet(unboundFacets),
    };
    const basisDigest = context.digest(outcome);
    const basis = {
      contract: "svml.program-basis.v1",
      frameRate,
      originFrame: 0,
      durationFrames,
      basisDigest,
    };
    const segmentOutputs = Object.fromEntries(Object.entries(unboundSegmentOutputs).map(([id, output]) => [
      id,
      {
        audio: { ...output.audio, basisDigest },
        ...(output.visual ? { visual: { ...output.visual, basisDigest } } : {}),
      },
    ]));
    const facets = {
      visual: {
        type: "ProgramBoundVideoSequence",
        basisDigest,
        segments: Object.fromEntries(Object.entries(segmentOutputs)
          .filter(([, value]) => value.visual)
          .map(([id, value]) => [id, value.visual])),
      },
    };
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
    return {
      outputs: {
        production,
        facets: production.facets,
        segment: segmentOutputs,
      },
    };
  },
};
