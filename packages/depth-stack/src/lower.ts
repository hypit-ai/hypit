import type { Timeline } from "@hypit/timeline";
import {
  assertVisualTrackIdentity,
  sealPresentVisualTrack,
} from "@hypit/composition";
import type {
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
  PresentVisualTrack,
  VisualPresentDraft,
} from "@hypit/composition";
import {
  lowerVisualClipRoot,
  resolveMediaLayerPrograms,
} from "@hypit/visual-track";
import type {
  VisualClipProgram,
  MediaSampleLayer,
} from "@hypit/visual-track";
import type { SpatialFrame } from "@hypit/spatial";
import {
  exactTemporalValueFromFrames,
  moduloExactTemporalValue,
  resolveTemporalRelation,
  sealLocalTemporalDomain,
  sealTemporalMap,
} from "@hypit/temporal";
import type { LocalTemporalDomain, TemporalMap } from "@hypit/temporal";

import {
  assertDepthStackProgramIdentity,
  resolveDepthStackPose,
  resolveDepthStackState,
} from "./program.js";
import type {
  DepthStackCard,
  DepthStackPose,
  DepthStackProgram,
} from "./types.js";

function px(value: number): string {
  return `${value}px`;
}

function poseStyle(value: DepthStackPose): VisualStyleDeclaration[] {
  return [
    {
      name: "filter",
      value: `brightness(${value.tone.brightness}) contrast(${value.tone.contrast}) saturate(${value.tone.saturation})`,
    },
    { name: "opacity", value: value.opacity },
    {
      name: "transform",
      value: `translate(${value.xPx}px,${value.yPx}px) rotate(${value.rotationDeg}deg) scale(${value.scale})`,
    },
  ];
}

function hiddenPose(program: DepthStackProgram, direction: "previous" | "next"): DepthStackPose {
  const depth = direction === "previous"
    ? -(program.spec.visibility.previous + 1)
    : program.spec.visibility.next + 1;
  return { ...resolveDepthStackPose(program.spec, depth), opacity: 0 };
}

function poseAnimation(input: {
  readonly program: DepthStackProgram;
  readonly stageDuration: number;
  readonly oldDepth?: number;
  readonly newDepth?: number;
}): VisualAnimation | undefined {
  if (input.newDepth === undefined && input.oldDepth === undefined) return undefined;
  if (input.program.spec.reflow.durationFrames === 0) return undefined;
  const oldPose = input.oldDepth === undefined
    ? hiddenPose(input.program, input.newDepth === 0 || input.newDepth! > 0 ? "next" : "previous")
    : resolveDepthStackPose(input.program.spec, input.oldDepth);
  const newPose = input.newDepth === undefined
    ? hiddenPose(input.program, input.oldDepth === 0 || input.oldDepth! < 0 ? "previous" : "next")
    : resolveDepthStackPose(input.program.spec, input.newDepth);
  const duration = input.program.spec.reflow.durationFrames;
  const keyframes = [
    { atFrame: 0, easing: input.program.spec.reflow.easing, style: poseStyle(oldPose) },
    { atFrame: duration, style: poseStyle(newPose) },
  ];
  if (duration < input.stageDuration) keyframes.push({ atFrame: input.stageDuration, style: poseStyle(newPose) });
  return { keyframes };
}

function rootBox(id: string, children: readonly VisualElement[], style: VisualStyleDeclaration[], animation?: VisualAnimation): VisualElement {
  return {
    id,
    kind: "box",
    children,
    style,
    ...(animation === undefined ? {} : { animation }),
  };
}

function sourceTiming(layer: MediaSampleLayer): {
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
} | undefined {
  if (layer.source.kind === "surface" && layer.source.surface.timing.kind === "frames") {
    return {
      frameRate: layer.source.surface.timing.frameRate,
      frameCount: layer.source.surface.timing.frameCount,
    };
  }
  return undefined;
}

function sourceDomain(layer: MediaSampleLayer): LocalTemporalDomain | undefined {
  if (layer.source.kind === "timed") return layer.source.media.domain;
  const timing = sourceTiming(layer);
  if (timing === undefined) return undefined;
  return sealLocalTemporalDomain({
    id: `${layer.id}:surface`,
    duration: exactTemporalValueFromFrames(timing.frameCount, { frameRate: timing.frameRate }),
  });
}

function targetDomain(id: string, frames: number, timeline: Timeline): LocalTemporalDomain {
  return sealLocalTemporalDomain({ id, duration: exactTemporalValueFromFrames(frames, timeline) });
}

function heldSampling(
  id: string,
  targetFrames: number,
  sourceAtStart: import("@hypit/temporal").ExactTemporalValue,
  timeline: Timeline,
  source: LocalTemporalDomain,
): TemporalMap {
  const target = targetDomain(id, targetFrames, timeline);
  return sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: target.duration },
    sourceAtStart,
    rate: { numerator: 0, denominator: 1 },
  }] }] });
}

function continuedSampling(input: {
  readonly id: string;
  readonly targetFrames: number;
  readonly absoluteStart: number;
  readonly activationFrame: number;
  readonly timeline: Timeline;
  readonly source: LocalTemporalDomain;
}): TemporalMap {
  const target = targetDomain(input.id, input.targetFrames, input.timeline);
  return sealTemporalMap({ stages: [{
    target, source: input.source, pieces: [{
      target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: target.duration },
      sourceAtStart: moduloExactTemporalValue(
        exactTemporalValueFromFrames(input.absoluteStart - input.activationFrame, input.timeline),
        input.source.duration,
      ),
      rate: { numerator: 1, denominator: 1 },
      wrap: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: input.source.duration },
    }],
  }] });
}

function samplingFor(input: {
  readonly program: DepthStackProgram;
  readonly card: DepthStackCard;
  readonly layer: MediaSampleLayer;
  readonly relation: number;
  readonly stageStart: number;
  readonly stageDuration: number;
  readonly timeline: Timeline;
}): TemporalMap | undefined {
  const timing = sourceTiming(input.layer);
  const source = sourceDomain(input.layer);
  if (source === undefined) return undefined;
  if (input.relation === 0) {
    if (input.layer.sampling?.kind === "map") return input.layer.sampling.value;
    return resolveTemporalRelation({
      target: targetDomain(`${input.card.id}:${input.layer.id}:stage`, input.stageDuration, input.timeline),
      source,
      clock: input.timeline,
      ...(input.layer.sampling?.kind !== "relation" ? {} : { spec: input.layer.sampling.value }),
    });
  }
  const mode = input.relation > 0 ? input.card.playback.future : input.card.playback.past;
  if (mode === "continue") {
    return continuedSampling({
      id: `${input.card.id}:${input.layer.id}:continue`,
      targetFrames: input.stageDuration,
      absoluteStart: input.stageStart,
      activationFrame: input.card.activationFrame,
      timeline: input.timeline,
      source,
    });
  }
  return heldSampling(
    `${input.card.id}:${input.layer.id}:hold`,
    input.stageDuration,
    mode === "hold-tail"
      ? timing === undefined ? source.duration : exactTemporalValueFromFrames(timing.frameCount - 1, { frameRate: timing.frameRate })
      : { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    input.timeline,
    source,
  );
}

function groupRoot(input: {
  readonly program: DepthStackProgram;
  readonly pose: DepthStackPose;
  readonly poseAnimation?: VisualAnimation;
  readonly child: VisualElement;
}): VisualElement {
  const frame = input.program.frame;
  const pose = rootBox("deck-pose", [input.child], [
    { name: "height", value: "100%" },
    { name: "position", value: "absolute" },
    { name: "transform-origin", value: "center center" },
    { name: "width", value: "100%" },
    ...poseStyle(input.pose),
  ], input.poseAnimation);
  return rootBox("deck-placement", [pose], [
    { name: "height", value: px(frame.heightPx) },
    { name: "left", value: px(frame.xPx) },
    { name: "position", value: "absolute" },
    { name: "top", value: px(frame.yPx) },
    { name: "width", value: px(frame.widthPx) },
  ]);
}

function localFrame(frame: SpatialFrame): SpatialFrame {
  return {
    xPx: 0,
    yPx: 0,
    widthPx: frame.widthPx,
    heightPx: frame.heightPx,
  };
}

function labelElement(card: DepthStackCard): VisualElement | undefined {
  if (card.label.kind === "none") return undefined;
  return {
    id: "deck-label",
    kind: "text-flow",
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    document: structuredClone(card.label.document),
    typography: structuredClone(card.label.typography),
    paints: structuredClone(card.label.paints),
    flow: structuredClone(card.label.flow),
    sequences: [],
  };
}

function appendBoxChild(root: VisualElement, targetId: string, child: VisualElement): VisualElement {
  if (root.id === targetId) {
    if (root.kind !== "box") throw new Error(`DepthStack target ${targetId} is not a Box.`);
    return { ...root, children: [...root.children, child] };
  }
  if (root.kind !== "box") return root;
  return { ...root, children: root.children.map((candidate) => appendBoxChild(candidate, targetId, child)) };
}

export function renderDepthStack(
  timeline: Timeline,
  program: DepthStackProgram,
): PresentVisualTrack {
  assertDepthStackProgramIdentity(program, timeline);
  const presents: VisualPresentDraft[] = [];
  for (let stageIndex = 0; stageIndex < program.cards.length; stageIndex += 1) {
    const stageStart = program.cards[stageIndex]!.activationFrame;
    const stageEnd = program.cards[stageIndex + 1]?.activationFrame ?? program.terminalFrame;
    const stageDuration = stageEnd - stageStart;
    const oldState = stageIndex === 0 ? new Map<number, number>() : resolveDepthStackState(program, stageIndex - 1);
    const newState = resolveDepthStackState(program, stageIndex);
    const cardIndices = stageIndex === 0 || program.spec.reflow.durationFrames === 0
      ? [...newState.keys()]
      : [...new Set([...oldState.keys(), ...newState.keys()])];
    const stackingFor = (cardIndex: number): number => {
      const oldDepth = oldState.get(cardIndex);
      const newDepth = newState.get(cardIndex);
      return newDepth === undefined
        ? resolveDepthStackPose(program.spec, oldDepth ?? 0).stacking
        : resolveDepthStackPose(program.spec, newDepth).stacking;
    };
    cardIndices.sort((left, right) => stackingFor(left) - stackingFor(right) || left - right);
    for (const cardIndex of cardIndices) {
      const card = program.cards[cardIndex]!;
      const oldDepth = oldState.get(cardIndex);
      const newDepth = newState.get(cardIndex);
      const staticPose = newDepth === undefined
        ? hiddenPose(program, oldDepth === 0 || (oldDepth ?? -1) < 0 ? "previous" : "next")
        : resolveDepthStackPose(program.spec, newDepth);
      const animation = stageIndex === 0 ? undefined : poseAnimation({
        program,
        stageDuration,
        ...(oldDepth === undefined ? {} : { oldDepth }),
        ...(newDepth === undefined ? {} : { newDepth }),
      });
      const relation = newDepth ?? (oldDepth === 0 ? -1 : oldDepth ?? 1);
      const samplingOverrides: Record<string, TemporalMap> = {};
      const samplingAnimationOverrides: Record<string, VisualAnimation | null> = {};
      for (const layer of card.material.layers) {
        if (layer.kind !== "sample") continue;
        const sampling = samplingFor({ program, card, layer, relation, stageStart, stageDuration, timeline });
        if (sampling !== undefined) samplingOverrides[layer.id] = sampling;
        if (relation !== 0 && layer.samplingMotion !== undefined) samplingAnimationOverrides[layer.id] = null;
      }
      const mediaItem: VisualClipProgram = {
        id: "deck-material",
        subjectId: card.id,
        span: { startFrame: stageStart, endFrameExclusive: stageEnd },
        frame: localFrame(program.frame),
        treatment: structuredClone(program.spec.treatment),
        layers: resolveMediaLayerPrograms(card.material, localFrame(program.frame), program.spec.treatment),
      };
      let material = lowerVisualClipRoot(mediaItem, {
        poseAnimationOverride: null,
        samplingOverrides,
        samplingAnimationOverrides,
      });
      const label = labelElement(card);
      if (label !== undefined) material = appendBoxChild(material, `${mediaItem.id}:frame`, label);
      presents.push({
        id: `${card.id}:stage:${stageIndex + 1}`,
        subjectId: card.id,
        span: { startFrame: stageStart, endFrameExclusive: stageEnd },
        root: groupRoot({
          program,
          pose: staticPose,
          ...(animation === undefined ? {} : { poseAnimation: animation }),
          child: material,
        }),
      });
    }
  }
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    id: program.id,
    presents,
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}
