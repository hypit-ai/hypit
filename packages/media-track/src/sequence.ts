import type {
  VisualAnimation,
  VisualEasing,
  VisualPresent,
  VisualStyleDeclaration,
} from "@hypit/composition";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import { assertCanvasSpace, assertSpatialFrame } from "@hypit/spatial";
import type { CanvasSpace } from "@hypit/spatial";
import { resolveTriggeredSchedule } from "@hypit/temporal";
import type { TemporalPoint } from "@hypit/temporal";

import { assertMediaIdentity, assertMediaLayerSet } from "./layers.js";
import { lowerMediaItemElements } from "./lower.js";
import {
  assertMediaLifecycleMotion,
  lifecycleAnimationWindow,
  resolveMediaLifecycleMotion,
  sustainAnimationWindow,
} from "./motion.js";
import { assertMediaFramePresentation } from "./presentation.js";
import { assertMediaSoundSet } from "./sounds.js";
import type {
  MediaHandoffProgram,
  MediaHandoffSpec,
  MediaItemProgram,
  MediaLayerSet,
  MediaMotionDirection,
  MediaSequenceMemberProgram,
  MediaSequenceMemberSet,
  MediaSequenceMemberSpec,
  MediaSequenceProgram,
  MediaSequenceSpec,
  MediaSoundSet,
  MediaTrackHeader,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

export function assertMediaSequenceMemberSpec(value: MediaSequenceMemberSpec): void {
  assertMediaIdentity(value.id, "MediaSequenceMemberSpec.id");
  if (value.sourceAudio !== undefined) {
    assertMediaIdentity(value.sourceAudio.fromLayer, "MediaSequenceMemberSpec.sourceAudio.fromLayer");
    finite(value.sourceAudio.gain, "MediaSequenceMemberSpec.sourceAudio.gain");
    assert(value.sourceAudio.gain >= 0 && value.sourceAudio.gain <= 64,
      "MediaSequenceMemberSpec.sourceAudio.gain is invalid.");
  }
}

export function sealMediaSequenceMemberSpec(value: MediaSequenceMemberSpec): MediaSequenceMemberSpec {
  assertMediaSequenceMemberSpec(value);
  return canonicalize(value) as unknown as MediaSequenceMemberSpec;
}

export function createMediaSequenceMemberSet(): MediaSequenceMemberSet {
  return { members: [] };
}

export function assertMediaSequenceMemberSet(value: MediaSequenceMemberSet): void {
  assert(Array.isArray(value.members),
    "MediaSequenceMemberSet is invalid.");
  const ids = new Set<string>();
  for (const member of value.members) {
    assertMediaIdentity(member.id, "Media Sequence member id");
    assert(!ids.has(member.id), `MediaSequenceMemberSet repeats ${member.id}.`);
    ids.add(member.id);
    assert(Number.isSafeInteger(member.activationFrame) && member.activationFrame >= 0,
      `Media Sequence member ${member.id} activation is invalid.`);
    assertMediaLayerSet({ layers: member.layers });
  }
}

function appendMediaSequenceMemberAtFrame(
  set: MediaSequenceMemberSet,
  layers: MediaLayerSet,
  spec: MediaSequenceMemberSpec,
  activationFrame: number,
): MediaSequenceMemberSet {
  assertMediaSequenceMemberSet(set);
  assertMediaLayerSet(layers);
  assert(layers.layers.length > 0, `Media Sequence member ${spec.id} requires layers.`);
  assertMediaSequenceMemberSpec(spec);
  assert(Number.isSafeInteger(activationFrame) && activationFrame >= 0,
    `Media Sequence member ${spec.id} activation is invalid.`);
  assert(!set.members.some((member) => member.id === spec.id), `Media Sequence already contains ${spec.id}.`);
  if (spec.sourceAudio !== undefined) {
    const selected = layers.layers.find((layer) => layer.id === spec.sourceAudio!.fromLayer);
    assert(selected?.kind === "sample" && selected.source.kind === "timed" && selected.source.audio !== undefined,
      `Media Sequence member ${spec.id} source-audio layer is absent or silent.`);
  }
  return canonicalize({

    members: [...set.members, {
      id: spec.id,
      activationFrame,
      layers: structuredClone(layers.layers),
      ...(spec.sourceAudio === undefined ? {} : { sourceAudio: { ...spec.sourceAudio } }),
    }],
  }) as unknown as MediaSequenceMemberSet;
}

export function appendMediaSequenceMember(
  set: MediaSequenceMemberSet,
  layers: MediaLayerSet,
  spec: MediaSequenceMemberSpec,
  activation: TemporalPoint,
): MediaSequenceMemberSet {
  return appendMediaSequenceMemberAtFrame(set, layers, spec, activation.frame);
}

export function assertMediaHandoffSpec(value: MediaHandoffSpec): void {
  assertMediaIdentity(value.id, "MediaHandoffSpec.id");
  assertMediaIdentity(value.fromMemberId, "MediaHandoffSpec.fromMemberId");
  assertMediaIdentity(value.toMemberId, "MediaHandoffSpec.toMemberId");
  assert(["cut", "crossfade", "push", "wipe", "cover", "page-turn"].includes(value.operator),
    "MediaHandoffSpec.operator is invalid.");
  assert(Number.isSafeInteger(value.durationFrames) && value.durationFrames >= 0,
    "MediaHandoffSpec.durationFrames is invalid.");
  assert((value.operator === "cut") === (value.durationFrames === 0),
    "A cut must have zero duration and every visual transition must have positive duration.");
  finite(value.boundaryRatio, "MediaHandoffSpec.boundaryRatio");
  assert(value.boundaryRatio >= 0 && value.boundaryRatio <= 1,
    "MediaHandoffSpec.boundaryRatio must be inside [0, 1].");
  if (["push", "wipe", "cover", "page-turn"].includes(value.operator)) {
    assert(value.direction !== undefined && ["left", "right", "up", "down"].includes(value.direction),
      `MediaHandoffSpec ${value.operator} requires a direction.`);
  }
  assert(value.audio === "cut" || value.audio === "crossfade", "MediaHandoffSpec.audio is invalid.");
  if (value.audio === "crossfade") assert(value.durationFrames > 0, "Audio crossfade requires a non-empty handoff.");
}

export function sealMediaHandoffSpec(value: MediaHandoffSpec): MediaHandoffSpec {
  assertMediaHandoffSpec(value);
  return canonicalize(value) as unknown as MediaHandoffSpec;
}

export function assertMediaSequenceSpec(value: MediaSequenceSpec): void {
  assertMediaIdentity(value.id, "MediaSequenceSpec.id");
  assertMediaFramePresentation(value.presentation, "MediaSequenceSpec.presentation");
  assert(Number.isSafeInteger(value.stackingOrder), "MediaSequenceSpec.stackingOrder must be an integer.");
  for (const handoff of value.handoffs) assertMediaHandoffSpec(handoff);
}

export function sealMediaSequenceSpec(value: MediaSequenceSpec): MediaSequenceSpec {
  assertMediaSequenceSpec(value);
  return canonicalize(value) as unknown as MediaSequenceSpec;
}

function resolvedHandoff(
  spec: MediaHandoffSpec,
  boundary: number,
): MediaHandoffProgram {
  const before = Math.floor(spec.durationFrames * spec.boundaryRatio);
  const span = {
    startFrame: boundary - before,
    endFrameExclusive: boundary + (spec.durationFrames - before),
  };
  return {
    id: spec.id,
    fromMemberId: spec.fromMemberId,
    toMemberId: spec.toMemberId,
    operator: spec.operator,
    durationFrames: spec.durationFrames,
    boundaryRatio: spec.boundaryRatio,
    span,
    ...(spec.direction === undefined ? {} : { direction: spec.direction }),
    audio: spec.audio,
  };
}

export function resolveMediaSequence(
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  memberSet: MediaSequenceMemberSet,
  frame: MediaSequenceProgram["frame"],
  spec: MediaSequenceSpec,
  sounds: MediaSoundSet,
  terminalFrame: number,
): MediaSequenceProgram {
  assertProgramSpaceIdentity(space);
  assertCanvasSpace(canvas);
  assertMediaSequenceMemberSet(memberSet);
  assertMediaSequenceSpec(spec);
  assertMediaSoundSet(sounds);
  assert(Number.isSafeInteger(terminalFrame) && terminalFrame > 0,
    `Media Sequence ${spec.id} terminal frame is invalid.`);
  assertSpatialFrame(frame);
  assert(memberSet.members.length >= 2, `Media Sequence ${spec.id} requires at least two Members.`);
  assert(spec.handoffs.length === memberSet.members.length - 1,
    `Media Sequence ${spec.id} requires exactly one Handoff for every adjacent pair.`);
  const first = memberSet.members[0]!;
  const schedule = resolveTriggeredSchedule({
    outer: { startFrame: first.activationFrame, endFrameExclusive: terminalFrame },
    terminalFrame,
    triggers: memberSet.members.map((member) => ({ id: member.id, frame: member.activationFrame })),
  });
  assert(terminalFrame <= programSpaceFrameCount(space), `Media Sequence ${spec.id} exits ProgramSpace.`);
  const handoffs = spec.handoffs.map((handoff, index) => {
    const from = memberSet.members[index]!;
    const to = memberSet.members[index + 1]!;
    assert(handoff.fromMemberId === from.id && handoff.toMemberId === to.id,
      `Media Handoff ${handoff.id} does not connect authored adjacent Members ${from.id} → ${to.id}.`);
    const result = resolvedHandoff(handoff, to.activationFrame);
    assert(result.span.startFrame >= first.activationFrame && result.span.endFrameExclusive <= terminalFrame,
      `Media Handoff ${handoff.id} exceeds the Sequence envelope.`);
    return result;
  });
  for (const sound of sounds.sounds) {
    if (sound.trigger.kind === "handoff") {
      const { handoffId } = sound.trigger;
      assert(handoffs.some((handoff) => handoff.id === handoffId),
        `Media Sequence ${spec.id} sound ${sound.id} targets an unknown Handoff.`);
    }
  }
  for (let index = 1; index < handoffs.length; index += 1) {
    assert(handoffs[index - 1]!.span.endFrameExclusive <= handoffs[index]!.span.startFrame,
      `Media Sequence ${spec.id} has overlapping Handoffs.`);
  }
  const members: MediaSequenceMemberProgram[] = memberSet.members.map((member, index) => {
    const logicalSpan = schedule.exclusive[index]!;
    const incoming = handoffs[index - 1];
    const outgoing = handoffs[index];
    const visualSpan = {
      startFrame: incoming?.span.startFrame ?? logicalSpan.startFrame,
      endFrameExclusive: outgoing?.span.endFrameExclusive ?? logicalSpan.endFrameExclusive,
    };
    return {
      id: member.id,
      activationFrame: member.activationFrame,
      logicalSpan: { ...logicalSpan },
      visualSpan,
      layers: structuredClone(member.layers),
      ...(member.sourceAudio === undefined ? {} : { sourceAudio: { ...member.sourceAudio } }),
    };
  });
  const span = { startFrame: first.activationFrame, endFrameExclusive: terminalFrame };
  assertMediaLifecycleMotion(spec.motion, span.endFrameExclusive - span.startFrame, `Media Sequence ${spec.id} motion`);
  const motion = resolveMediaLifecycleMotion(spec.motion, frame, canvas);
  assert(frame.widthPx > spec.presentation.padding.leftPx + spec.presentation.padding.rightPx
    && frame.heightPx > spec.presentation.padding.topPx + spec.presentation.padding.bottomPx,
  `Media Sequence ${spec.id} padding consumes its complete Placement Frame.`);
  return canonicalize({
    id: spec.id,
    span,
    terminalFrame,
    frame: { ...frame },
    presentation: structuredClone(spec.presentation),
    members,
    handoffs,
    motion,
    stacking: { order: spec.stackingOrder, tieBreak: `${header.id}:${spec.id}` },
    sounds: structuredClone(sounds.sounds),
  }) as unknown as MediaSequenceProgram;
}

type TransitionState = {
  readonly opacity: number;
  readonly transform: string;
  readonly clipPath: string;
};

const neutral: TransitionState = { opacity: 1, transform: "none", clipPath: "inset(0% 0% 0% 0%)" };

function translate(direction: MediaMotionDirection, amount: number): string {
  if (direction === "left") return `translateX(${-amount}%)`;
  if (direction === "right") return `translateX(${amount}%)`;
  if (direction === "up") return `translateY(${-amount}%)`;
  return `translateY(${amount}%)`;
}

function opposite(direction: MediaMotionDirection): MediaMotionDirection {
  if (direction === "left") return "right";
  if (direction === "right") return "left";
  if (direction === "up") return "down";
  return "up";
}

function clipped(direction: MediaMotionDirection): string {
  if (direction === "left") return "inset(0% 0% 0% 100%)";
  if (direction === "right") return "inset(0% 100% 0% 0%)";
  if (direction === "up") return "inset(0% 0% 100% 0%)";
  return "inset(100% 0% 0% 0%)";
}

function incomingState(handoff: MediaHandoffProgram): TransitionState {
  if (handoff.operator === "crossfade") return { ...neutral, opacity: 0 };
  if (handoff.operator === "push" || handoff.operator === "cover") {
    return { ...neutral, transform: translate(opposite(handoff.direction!), 100) };
  }
  if (handoff.operator === "wipe") return { ...neutral, clipPath: clipped(handoff.direction!) };
  if (handoff.operator === "page-turn") {
    const axis = handoff.direction === "left" || handoff.direction === "right" ? "Y" : "X";
    const sign = handoff.direction === "left" || handoff.direction === "up" ? 1 : -1;
    return { ...neutral, opacity: 0, transform: `perspective(900px) rotate${axis}(${sign * 75}deg)` };
  }
  return neutral;
}

function outgoingState(handoff: MediaHandoffProgram): TransitionState {
  if (handoff.operator === "crossfade") return { ...neutral, opacity: 0 };
  if (handoff.operator === "push") return { ...neutral, transform: translate(handoff.direction!, 100) };
  if (handoff.operator === "page-turn") {
    const axis = handoff.direction === "left" || handoff.direction === "right" ? "Y" : "X";
    const sign = handoff.direction === "left" || handoff.direction === "up" ? -1 : 1;
    return { ...neutral, opacity: 0, transform: `perspective(900px) rotate${axis}(${sign * 75}deg)` };
  }
  return neutral;
}

function styles(value: TransitionState, clipping: boolean): VisualStyleDeclaration[] {
  return [
    ...(clipping ? [{ name: "clip-path", value: value.clipPath }] : []),
    { name: "opacity", value: value.opacity },
    { name: "transform", value: value.transform },
  ];
}

export function sequenceMemberHandoffAnimation(
  member: MediaSequenceMemberProgram,
  incoming: MediaHandoffProgram | undefined,
  outgoing: MediaHandoffProgram | undefined,
): VisualAnimation | undefined {
  if ((incoming === undefined || incoming.operator === "cut") && (outgoing === undefined || outgoing.operator === "cut")) {
    return undefined;
  }
  const duration = member.visualSpan.endFrameExclusive - member.visualSpan.startFrame;
  const states = new Map<number, { readonly state: TransitionState; readonly easing?: VisualEasing }>();
  const add = (frame: number, state: TransitionState, easing?: VisualEasing): void => {
    const previous = states.get(frame);
    assert(previous === undefined || JSON.stringify(previous.state) === JSON.stringify(state),
      `Media Sequence member ${member.id} has conflicting Handoff states at frame ${frame}.`);
    states.set(frame, { state, ...(easing === undefined ? {} : { easing }) });
  };
  add(0, incoming === undefined || incoming.operator === "cut" ? neutral : incomingState(incoming), "ease-in-out");
  if (incoming !== undefined && incoming.operator !== "cut") {
    add(incoming.span.endFrameExclusive - member.visualSpan.startFrame, neutral);
  }
  if (outgoing !== undefined && outgoing.operator !== "cut") {
    add(outgoing.span.startFrame - member.visualSpan.startFrame, neutral, "ease-in-out");
    add(outgoing.span.endFrameExclusive - member.visualSpan.startFrame, outgoingState(outgoing));
  } else add(duration, neutral);
  const clipping = [...states.values()].some((value) => value.state.clipPath !== neutral.clipPath);
  return { keyframes: [...states.entries()].sort(([left], [right]) => left - right).map(([atFrame, value]) => ({
    atFrame,
    ...(value.easing === undefined ? {} : { easing: value.easing }),
    style: styles(value.state, clipping),
  })) };
}

export function lowerMediaSequencePresents(
  sequence: MediaSequenceProgram,
  space: ProgramSpace,
): readonly VisualPresent[] {
  return sequence.members.map((member, index) => {
    const incoming = sequence.handoffs[index - 1];
    const outgoing = sequence.handoffs[index];
    const item: MediaItemProgram = {
      id: `${sequence.id}:${member.id}`,
      span: { ...member.visualSpan },
      frame: { ...sequence.frame },
      presentation: structuredClone(sequence.presentation),
      layers: structuredClone(member.layers),
      motion: structuredClone(sequence.motion),
      stacking: {
        order: sequence.stacking.order,
        tieBreak: `${sequence.stacking.tieBreak}:${String(index + 1).padStart(4, "0")}`,
      },
      ...(member.sourceAudio === undefined ? {} : { sourceAudio: { ...member.sourceAudio } }),
      sounds: [],
    };
    const handoffAnimation = sequenceMemberHandoffAnimation(member, incoming, outgoing);
    const outerDuration = sequence.span.endFrameExclusive - sequence.span.startFrame;
    const startOffset = member.visualSpan.startFrame - sequence.span.startFrame;
    const endOffset = member.visualSpan.endFrameExclusive - sequence.span.startFrame;
    return {
      id: item.id,
      span: { ...item.span },
      stacking: { ...item.stacking },
      elements: lowerMediaItemElements(item, space, {
        includeHandoffWrapper: true,
        ...(handoffAnimation === undefined ? {} : { handoffAnimation }),
        lifecycleAnimationOverride: lifecycleAnimationWindow(
          sequence.motion, outerDuration, startOffset, endOffset,
        ) ?? null,
        sustainAnimationsOverride: sequence.motion.sustain.map((sustain) =>
          sustainAnimationWindow(sustain, outerDuration, startOffset, endOffset)),
      }),
    };
  });
}
