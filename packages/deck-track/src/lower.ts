import {
  assertVisualTrackIdentity,
  sealVisualTrack,
} from "@narratage/composition";
import type {
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
  VisualTimedSampling,
  VisualTrack,
} from "@narratage/composition";
import {
  lifecycleAnimationWindow,
  lowerMediaItemElements,
  resolveVisualSampling,
  sustainAnimationWindow,
} from "@narratage/media-track";
import type {
  MediaItemProgram,
  MediaSampleLayerProgram,
  MediaVisualTrim,
} from "@narratage/media-track";
import type { ProgramSpace } from "@narratage/program-space";
import { assertCanvasSpace } from "@narratage/spatial";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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

function rootBox(id: string, parent: string | undefined, order: number, style: VisualStyleDeclaration[], animation?: VisualAnimation): VisualElement {
  return {
    id,
    ...(parent === undefined ? {} : { parent }),
    order,
    kind: "box",
    style,
    ...(animation === undefined ? {} : { animation }),
  };
}

function rational(numerator: number, denominator = 1) {
  return { numerator, denominator };
}

function modulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function sourceTiming(layer: MediaSampleLayerProgram): {
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
} | undefined {
  if (layer.source.kind === "timed") {
    return { frameRate: layer.source.frameRate, frameCount: layer.source.frameCount };
  }
  if (layer.source.kind === "surface" && layer.source.surface.timing.kind === "frames") {
    return {
      frameRate: layer.source.surface.timing.frameRate,
      frameCount: layer.source.surface.timing.frameCount,
    };
  }
  return undefined;
}

function trimFor(layer: MediaSampleLayerProgram, frameCount: number): MediaVisualTrim {
  return layer.trim ?? { startFrame: 0, endFrameExclusive: frameCount };
}

function heldSampling(
  timing: NonNullable<ReturnType<typeof sourceTiming>>,
  targetFrames: number,
  sourceFrame: number,
): VisualTimedSampling {
  return {
    sourceFrameRate: { ...timing.frameRate },
    sourceFrameCount: timing.frameCount,
    segments: [{
      target: { startFrame: 0, endFrameExclusive: targetFrames },
      sourceFrame: rational(sourceFrame),
      rate: rational(0),
    }],
  };
}

function continuedSampling(input: {
  readonly timing: NonNullable<ReturnType<typeof sourceTiming>>;
  readonly trim: MediaVisualTrim;
  readonly targetFrames: number;
  readonly absoluteStart: number;
  readonly activationFrame: number;
}): VisualTimedSampling {
  const length = input.trim.endFrameExclusive - input.trim.startFrame;
  const phase = modulo(input.absoluteStart - input.activationFrame, length);
  return {
    sourceFrameRate: { ...input.timing.frameRate },
    sourceFrameCount: input.timing.frameCount,
    segments: [{
      target: { startFrame: 0, endFrameExclusive: input.targetFrames },
      sourceFrame: rational(input.trim.startFrame + phase),
      rate: rational(1),
      loop: { ...input.trim },
    }],
  };
}

function samplingFor(input: {
  readonly program: DepthStackProgram;
  readonly card: DepthStackCard;
  readonly layer: MediaSampleLayerProgram;
  readonly relation: number;
  readonly stageStart: number;
  readonly stageDuration: number;
  readonly space: ProgramSpace;
}): VisualTimedSampling | undefined {
  const timing = sourceTiming(input.layer);
  if (timing === undefined) return undefined;
  assert(timing.frameRate.numerator === input.space.frameRate.numerator
    && timing.frameRate.denominator === input.space.frameRate.denominator,
  `DepthStack Card ${input.card.id} timed material must be normalized to ProgramSpace.`);
  const trim = trimFor(input.layer, timing.frameCount);
  if (input.relation === 0) {
    return resolveVisualSampling({
      space: input.space,
      sourceFrameRate: timing.frameRate,
      sourceFrameCount: timing.frameCount,
      targetFrameCount: input.stageDuration,
      trim,
      occupancy: input.layer.occupancy!,
    });
  }
  const mode = input.relation > 0 ? input.card.playback.future : input.card.playback.past;
  if (mode === "continue") {
    assert(input.layer.occupancy?.mode === "loop" && input.layer.occupancy.align === "start",
      `DepthStack Card ${input.card.id} continue playback requires loop-start active occupancy.`);
    return continuedSampling({
      timing,
      trim,
      targetFrames: input.stageDuration,
      absoluteStart: input.stageStart,
      activationFrame: input.card.activationFrame,
    });
  }
  return heldSampling(
    timing,
    input.stageDuration,
    mode === "hold-tail" ? trim.endFrameExclusive - 1 : trim.startFrame,
  );
}

function groupElements(input: {
  readonly program: DepthStackProgram;
  readonly stageStart: number;
  readonly stageEnd: number;
  readonly pose: DepthStackPose;
  readonly poseAnimation?: VisualAnimation;
}): { readonly elements: VisualElement[]; readonly poseParent: string } {
  const frame = input.program.frame;
  const duration = input.program.span.endFrameExclusive - input.program.span.startFrame;
  const startOffset = input.stageStart - input.program.span.startFrame;
  const endOffset = input.stageEnd - input.program.span.startFrame;
  let order = 0;
  const elements: VisualElement[] = [rootBox("deck-placement", undefined, order++, [
    { name: "height", value: px(frame.heightPx) },
    { name: "left", value: px(frame.xPx) },
    { name: "position", value: "absolute" },
    { name: "top", value: px(frame.yPx) },
    { name: "width", value: px(frame.widthPx) },
  ])];
  let parent = "deck-placement";
  const lifecycle = lifecycleAnimationWindow(input.program.spec.motion, duration, startOffset, endOffset);
  elements.push(rootBox("deck-lifecycle", parent, order++, [
    { name: "height", value: "100%" },
    { name: "position", value: "absolute" },
    { name: "transform-origin", value: "center center" },
    { name: "width", value: "100%" },
  ], lifecycle));
  parent = "deck-lifecycle";
  for (const [index, sustain] of input.program.spec.motion.sustain.entries()) {
    const id = `deck-sustain-${index + 1}`;
    elements.push(rootBox(id, parent, order++, [
      { name: "height", value: "100%" },
      { name: "position", value: "absolute" },
      { name: "transform-origin", value: "center center" },
      { name: "width", value: "100%" },
    ], sustainAnimationWindow(sustain, duration, startOffset, endOffset)));
    parent = id;
  }
  elements.push(rootBox("deck-pose", parent, order++, [
    { name: "height", value: "100%" },
    { name: "position", value: "absolute" },
    { name: "transform-origin", value: "center center" },
    { name: "width", value: "100%" },
    ...poseStyle(input.pose),
  ], input.poseAnimation));
  return { elements, poseParent: "deck-pose" };
}

function localFrame(frame: SpatialFrame): SpatialFrame {
  return {
    xPx: 0,
    yPx: 0,
    widthPx: frame.widthPx,
    heightPx: frame.heightPx,
  };
}

function labelElement(card: DepthStackCard, parent: string, order: number): VisualElement | undefined {
  if (card.label.kind === "none") return undefined;
  return {
    id: "deck-label",
    parent,
    order,
    kind: "text-flow",
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    document: structuredClone(card.label.document),
    typography: structuredClone(card.label.typography),
    paints: structuredClone(card.label.paints),
    flow: structuredClone(card.label.flow),
    sequences: [],
  };
}

export function renderDepthStack(
  canvas: CanvasSpace,
  space: ProgramSpace,
  program: DepthStackProgram,
): VisualTrack {
  assertDepthStackProgramIdentity(program, space);
  assertCanvasSpace(canvas);
  const presents: VisualTrack["presents"][number][] = [];
  for (let stageIndex = 0; stageIndex < program.cards.length; stageIndex += 1) {
    const stageStart = program.cards[stageIndex]!.activationFrame;
    const stageEnd = program.cards[stageIndex + 1]?.activationFrame ?? program.terminalFrame;
    const stageDuration = stageEnd - stageStart;
    const oldState = stageIndex === 0 ? new Map<number, number>() : resolveDepthStackState(program, stageIndex - 1);
    const newState = resolveDepthStackState(program, stageIndex);
    const cardIndices = stageIndex === 0 || program.spec.reflow.durationFrames === 0
      ? [...newState.keys()]
      : [...new Set([...oldState.keys(), ...newState.keys()])];
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
      const group = groupElements({
        program,
        stageStart,
        stageEnd,
        pose: staticPose,
        ...(animation === undefined ? {} : { poseAnimation: animation }),
      });
      const relation = newDepth ?? (oldDepth === 0 ? -1 : oldDepth ?? 1);
      const samplingOverrides: Record<string, VisualTimedSampling> = {};
      const samplingAnimationOverrides: Record<string, VisualAnimation | null> = {};
      for (const layer of card.material.layers) {
        if (layer.kind !== "sample") continue;
        const sampling = samplingFor({ program, card, layer, relation, stageStart, stageDuration, space });
        if (sampling !== undefined) samplingOverrides[layer.id] = sampling;
        if (relation !== 0 && layer.samplingMotion !== undefined) samplingAnimationOverrides[layer.id] = null;
      }
      const mediaItem: MediaItemProgram = {
        id: "deck-material",
        span: { startFrame: stageStart, endFrameExclusive: stageEnd },
        frame: localFrame(program.frame),
        presentation: structuredClone(program.spec.presentation),
        layers: structuredClone(card.material.layers),
        motion: { sustain: [] },
        stacking: { order: 0, tieBreak: card.id },
        sounds: [],
      };
      const material = [...lowerMediaItemElements(mediaItem, space, {
        placementParent: group.poseParent,
        lifecycleAnimationOverride: null,
        samplingOverrides,
        samplingAnimationOverrides,
      })].map((element) => ({ ...element, order: element.order + group.elements.length }));
      const frameId = `${mediaItem.id}:frame`;
      const label = labelElement(card, frameId, material.reduce((maximum, element) => Math.max(maximum, element.order), 0) + 1);
      presents.push({
        id: `${card.id}:stage:${stageIndex + 1}`,
        span: { startFrame: stageStart, endFrameExclusive: stageEnd },
        stacking: {
          order: program.spec.stackingOrder + (newDepth === undefined
            ? resolveDepthStackPose(program.spec, oldDepth ?? 0).stacking
            : resolveDepthStackPose(program.spec, newDepth).stacking),
          tieBreak: `${program.id}:${String(stageIndex).padStart(4, "0")}:${card.id}`,
        },
        elements: [...group.elements, ...material, ...(label === undefined ? [] : [label])],
      });
    }
  }
  const track = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
    id: program.id,
    presents,
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
