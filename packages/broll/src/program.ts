import {
  assertAudioTrackIdentity,
  assertProgramSpaceIdentity,
  assertVisualTrackIdentity,
  programSpaceFrameCount,
  sealAudioTrack,
  sealVisualTrack,
} from "@svml/contracts";
import type {
  AudioClip,
  MediaArtifactRef,
  ProgramSpace,
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
} from "@svml/contracts";
import { digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type {
  BrollItem,
  BrollMotion,
  BrollPairTransition,
  BrollProduct,
  BrollProgram,
} from "./types.js";

export const compileBrollImplementationDigest = digestOf("@svml/broll/compile@1");
export const projectBrollVisualImplementationDigest = digestOf("@svml/broll/project-visual@1");
export const projectBrollAudioImplementationDigest = digestOf("@svml/broll/project-audio@1");

type MotionState = {
  readonly opacity: number;
  readonly transform: string;
};

type StateMark = MotionState & {
  readonly atFrame: number;
  readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

const STABLE: MotionState = { opacity: 1, transform: "translate3d(0%,0%,0) scale(1) rotateX(0deg) rotateY(0deg)" };

function normalizeProgram(value: Omit<BrollProgram, "digest">): Omit<BrollProgram, "digest"> {
  return {
    contract: "svml.broll-program@1",
    id: value.id,
    programSpaceDigest: value.programSpaceDigest,
    items: [...value.items].map((item) => structuredClone(item)).sort((left, right) => left.id.localeCompare(right.id)),
    transitions: [...value.transitions].map((transition) => structuredClone(transition)).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function computeBrollProgramDigest(value: Omit<BrollProgram, "digest">): Digest {
  return digestOf(normalizeProgram(value));
}

export function sealBrollProgram(value: Omit<BrollProgram, "digest">): BrollProgram {
  const content = normalizeProgram(value);
  return { ...content, digest: digestOf(content) };
}

function assertArtifact(artifact: MediaArtifactRef, label: string, kinds: readonly string[]): void {
  if (
    !isDigest(artifact.digest)
    || !Number.isSafeInteger(artifact.size)
    || artifact.size < 0
    || !Number.isFinite(artifact.durationSec)
    || artifact.durationSec < 0
    || !kinds.some((kind) => artifact.mediaType.startsWith(`${kind}/`))
  ) {
    throw new Error(`${label} Artifact is invalid.`);
  }
}

function assertSpan(item: { readonly startFrame: number; readonly endFrameExclusive: number }, totalFrames: number, label: string): void {
  if (
    !Number.isSafeInteger(item.startFrame)
    || !Number.isSafeInteger(item.endFrameExclusive)
    || item.startFrame < 0
    || item.endFrameExclusive <= item.startFrame
    || item.endFrameExclusive > totalFrames
  ) throw new Error(`${label} span is outside ProgramSpace.`);
}

function assertMotion(motion: BrollMotion | undefined, itemFrames: number, label: string): void {
  if (motion === undefined) return;
  if (!Number.isSafeInteger(motion.durationFrames) || motion.durationFrames <= 0 || motion.durationFrames > itemFrames) {
    throw new Error(`${label} duration is invalid.`);
  }
  if (!["fade", "pop", "slide-up", "slide-down"].includes(motion.operator)) {
    throw new Error(`${label} operator is unsupported.`);
  }
  if (motion.amount !== undefined && (!Number.isFinite(motion.amount) || motion.amount <= 0 || motion.amount > 4)) {
    throw new Error(`${label} amount is invalid.`);
  }
}

function assertItem(item: BrollItem, totalFrames: number): void {
  if (!item.id || !item.tieBreak) throw new Error("B-roll item identity must not be empty.");
  assertArtifact(item.artifact, `B-roll item ${item.id}`, ["image", "video"]);
  assertSpan(item.span, totalFrames, `B-roll item ${item.id}`);
  if (!Number.isSafeInteger(item.z)) throw new Error(`B-roll item ${item.id} z is invalid.`);
  for (const [name, value] of Object.entries(item.box)) {
    if (!Number.isFinite(value)) throw new Error(`B-roll item ${item.id} ${name} is invalid.`);
  }
  if (item.box.widthPercent <= 0 || item.box.heightPercent <= 0) {
    throw new Error(`B-roll item ${item.id} box must have positive size.`);
  }
  const isImage = item.artifact.mediaType.startsWith("image/");
  if (isImage && item.playback !== "freeze") throw new Error(`B-roll image ${item.id} must use freeze playback.`);
  if (!isImage && item.playback === "freeze") throw new Error(`B-roll video ${item.id} cannot use freeze playback.`);
  if (item.mediaStartSec !== undefined && (!Number.isFinite(item.mediaStartSec) || item.mediaStartSec < 0)) {
    throw new Error(`B-roll item ${item.id} mediaStartSec is invalid.`);
  }
  if (item.audioGain !== undefined && (!Number.isFinite(item.audioGain) || item.audioGain < 0)) {
    throw new Error(`B-roll item ${item.id} audioGain is invalid.`);
  }
  if (item.backgroundColor !== undefined && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(item.backgroundColor)) {
    throw new Error(`B-roll item ${item.id} background color is invalid.`);
  }
  if (item.borderRadiusPx !== undefined && (!Number.isFinite(item.borderRadiusPx) || item.borderRadiusPx < 0)) {
    throw new Error(`B-roll item ${item.id} border radius is invalid.`);
  }
  if (item.includeAudio && isImage) throw new Error(`B-roll image ${item.id} cannot contribute source audio.`);
  if (item.includeAudio && item.playback === "loop") {
    throw new Error(`B-roll item ${item.id} cannot loop source audio in the v1 AudioTrack contract.`);
  }
  const duration = item.span.endFrameExclusive - item.span.startFrame;
  assertMotion(item.enter, duration, `B-roll item ${item.id} enter motion`);
  assertMotion(item.exit, duration, `B-roll item ${item.id} exit motion`);
  if ((item.enter?.durationFrames ?? 0) + (item.exit?.durationFrames ?? 0) > duration) {
    throw new Error(`B-roll item ${item.id} entrance and exit overlap.`);
  }
}

function sameBox(left: BrollItem["box"], right: BrollItem["box"]): boolean {
  return left.xPercent === right.xPercent
    && left.yPercent === right.yPercent
    && left.widthPercent === right.widthPercent
    && left.heightPercent === right.heightPercent;
}

function transitionMaps(program: BrollProgram, totalFrames: number) {
  const items = new Map(program.items.map((item) => [item.id, item]));
  const incoming = new Map<string, BrollPairTransition>();
  const outgoing = new Map<string, BrollPairTransition>();
  const ids = new Set<string>();
  for (const transition of program.transitions) {
    if (!transition.id || ids.has(transition.id)) throw new Error(`B-roll transition id ${transition.id} is empty or duplicated.`);
    ids.add(transition.id);
    const from = items.get(transition.fromItemId);
    const to = items.get(transition.toItemId);
    if (!from || !to || from === to) throw new Error(`B-roll transition ${transition.id} has invalid endpoints.`);
    assertSpan(transition.span, totalFrames, `B-roll transition ${transition.id}`);
    if (
      transition.span.endFrameExclusive !== from.span.endFrameExclusive
      || transition.span.startFrame !== to.span.startFrame
      || transition.span.startFrame < from.span.startFrame
      || transition.span.endFrameExclusive > to.span.endFrameExclusive
    ) {
      throw new Error(`B-roll transition ${transition.id} must be the outgoing and incoming boundary of its two items.`);
    }
    if (!sameBox(from.box, to.box)) {
      throw new Error(`B-roll transition ${transition.id} requires both items to share one presentation box.`);
    }
    if (from.exit || to.enter) throw new Error(`B-roll transition ${transition.id} conflicts with item edge motion.`);
    if (outgoing.has(from.id) || incoming.has(to.id)) throw new Error(`B-roll transition ${transition.id} duplicates an item edge.`);
    if (!["push", "page-turn"].includes(transition.operator)) throw new Error(`B-roll transition ${transition.id} operator is unsupported.`);
    if (!["left", "right", "up", "down"].includes(transition.direction)) throw new Error(`B-roll transition ${transition.id} direction is unsupported.`);
    if (transition.sfx) {
      assertArtifact(transition.sfx.artifact, `B-roll transition ${transition.id} SFX`, ["audio"]);
      if (transition.sfx.gain !== undefined && (!Number.isFinite(transition.sfx.gain) || transition.sfx.gain < 0)) {
        throw new Error(`B-roll transition ${transition.id} SFX gain is invalid.`);
      }
    }
    outgoing.set(from.id, transition);
    incoming.set(to.id, transition);
  }
  for (const item of program.items) {
    const before = incoming.get(item.id);
    const after = outgoing.get(item.id);
    if (before && after && before.span.endFrameExclusive > after.span.startFrame) {
      throw new Error(`B-roll item ${item.id} has overlapping pair transitions.`);
    }
  }
  return { incoming, outgoing };
}

export function assertBrollProgramIdentity(program: BrollProgram, programSpace: ProgramSpace): void {
  assertProgramSpaceIdentity(programSpace);
  if (program.contract !== "svml.broll-program@1") throw new Error("Unsupported BrollProgram contract.");
  if (!program.id || program.programSpaceDigest !== programSpace.digest) throw new Error("BrollProgram identity or ProgramSpace affinity is invalid.");
  const { digest: _digest, ...content } = program;
  if (!isDigest(program.digest) || program.digest !== computeBrollProgramDigest(content)) {
    throw new Error("BrollProgram digest does not match its contents.");
  }
  if (program.items.length === 0) throw new Error("BrollProgram must contain at least one item.");
  const totalFrames = programSpaceFrameCount(programSpace);
  const ids = new Set<string>();
  for (const item of program.items) {
    if (ids.has(item.id)) throw new Error(`BrollProgram contains duplicate item ${item.id}.`);
    ids.add(item.id);
    assertItem(item, totalFrames);
  }
  transitionMaps(program, totalFrames);
}

function motionState(motion: BrollMotion, channel: "enter" | "exit"): MotionState {
  if (motion.operator === "fade") return { opacity: 0, transform: STABLE.transform };
  if (motion.operator === "pop") {
    const scale = motion.amount ?? 0.72;
    return { opacity: 0, transform: `translate3d(0%,0%,0) scale(${scale}) rotateX(0deg) rotateY(0deg)` };
  }
  const distance = (motion.amount ?? 1) * 100;
  if (motion.operator === "slide-down") {
    const y = channel === "enter" ? -distance : distance;
    return { opacity: 1, transform: `translate3d(0%,${y}%,0) scale(1) rotateX(0deg) rotateY(0deg)` };
  }
  const y = channel === "enter" ? distance : -distance;
  return { opacity: 1, transform: `translate3d(0%,${y}%,0) scale(1) rotateX(0deg) rotateY(0deg)` };
}

function pairState(
  transition: BrollPairTransition,
  endpoint: "incoming" | "outgoing",
): MotionState {
  const incoming = endpoint === "incoming";
  const sign = incoming ? -1 : 1;
  if (transition.operator === "push") {
    const vectors = {
      left: [-100, 0],
      right: [100, 0],
      up: [0, -100],
      down: [0, 100],
    } as const;
    const [x, y] = vectors[transition.direction];
    return { opacity: 1, transform: `translate3d(${x * sign}%,${y * sign}%,0) scale(1) rotateX(0deg) rotateY(0deg)` };
  }
  const angle = (transition.direction === "left" || transition.direction === "up" ? -90 : 90) * sign;
  const transform = transition.direction === "left" || transition.direction === "right"
    ? `perspective(1200px) rotateY(${angle}deg)`
    : `perspective(1200px) rotateX(${angle}deg)`;
  return { opacity: incoming ? 0 : 0, transform };
}

function sameState(left: MotionState, right: MotionState): boolean {
  return left.opacity === right.opacity && left.transform === right.transform;
}

function addMark(marks: Map<number, StateMark>, mark: StateMark, label: string): void {
  const previous = marks.get(mark.atFrame);
  if (previous && !sameState(previous, mark)) throw new Error(`${label} has conflicting animation states at frame ${mark.atFrame}.`);
  marks.set(mark.atFrame, previous ? { ...previous, ...(mark.easing === undefined ? {} : { easing: mark.easing }) } : mark);
}

function itemAnimation(
  item: BrollItem,
  incoming: BrollPairTransition | undefined,
  outgoing: BrollPairTransition | undefined,
): VisualAnimation | undefined {
  const duration = item.span.endFrameExclusive - item.span.startFrame;
  const marks = new Map<number, StateMark>();
  addMark(marks, { ...STABLE, atFrame: 0 }, item.id);
  addMark(marks, { ...STABLE, atFrame: duration }, item.id);

  if (item.enter) {
    marks.set(0, { ...motionState(item.enter, "enter"), atFrame: 0, easing: "ease-out" });
    addMark(marks, { ...STABLE, atFrame: item.enter.durationFrames }, item.id);
  }
  if (item.exit) {
    const start = duration - item.exit.durationFrames;
    addMark(marks, { ...STABLE, atFrame: start, easing: "ease-in" }, item.id);
    marks.set(duration, { ...motionState(item.exit, "exit"), atFrame: duration });
  }
  if (incoming) {
    const end = incoming.span.endFrameExclusive - item.span.startFrame;
    marks.set(0, { ...pairState(incoming, "incoming"), atFrame: 0, easing: "ease-in-out" });
    addMark(marks, { ...STABLE, atFrame: end }, item.id);
  }
  if (outgoing) {
    const start = outgoing.span.startFrame - item.span.startFrame;
    addMark(marks, { ...STABLE, atFrame: start, easing: "ease-in-out" }, item.id);
    marks.set(duration, { ...pairState(outgoing, "outgoing"), atFrame: duration });
  }

  const ordered = [...marks.values()].sort((left, right) => left.atFrame - right.atFrame);
  if (ordered.every((mark) => sameState(mark, STABLE))) return undefined;
  return {
    keyframes: ordered.map((mark) => ({
      atFrame: mark.atFrame,
      ...(mark.easing === undefined ? {} : { easing: mark.easing }),
      style: [
        { name: "opacity", value: mark.opacity },
        { name: "transform", value: mark.transform },
      ],
    })),
  };
}

function itemElements(
  item: BrollItem,
  animation: VisualAnimation | undefined,
  programSpace: ProgramSpace,
): readonly VisualElement[] {
  const presentSeconds = (item.span.endFrameExclusive - item.span.startFrame)
    * programSpace.frameRate.denominator / programSpace.frameRate.numerator;
  const isImage = item.artifact.mediaType.startsWith("image/");
  const playbackRate = item.playback === "stretch" && item.artifact.durationSec > 0
    ? item.artifact.durationSec / presentSeconds
    : undefined;
  const rootStyle: VisualStyleDeclaration[] = [
    { name: "height", value: `${item.box.heightPercent}%` },
    { name: "left", value: `${item.box.xPercent}%` },
    { name: "overflow", value: "hidden" },
    { name: "position", value: "absolute" },
    { name: "top", value: `${item.box.yPercent}%` },
    { name: "transform-origin", value: "center center" },
    { name: "width", value: `${item.box.widthPercent}%` },
    ...(item.backgroundColor === undefined ? [] : [{ name: "background-color", value: item.backgroundColor }]),
    ...(item.borderRadiusPx === undefined ? [] : [{ name: "border-radius", value: `${item.borderRadiusPx}px` }]),
  ];
  return [
    {
      id: "root",
      order: 0,
      kind: "box",
      style: rootStyle,
      ...(animation === undefined ? {} : { animation }),
    },
    {
      id: "media",
      parent: "root",
      order: 1,
      kind: isImage ? "image" : "video",
      artifact: item.artifact,
      style: [
        { name: "height", value: "100%" },
        { name: "object-fit", value: item.fit },
        { name: "position", value: "absolute" },
        { name: "width", value: "100%" },
      ],
      ...(item.mediaStartSec === undefined ? {} : { mediaStartSec: item.mediaStartSec }),
      ...(playbackRate === undefined ? {} : { playbackRate }),
      ...(!isImage && item.playback === "loop" ? { loop: true } : {}),
      ...(!isImage ? { muted: item.includeAudio !== true } : {}),
    },
  ];
}

function audioClips(program: BrollProgram, programSpace: ProgramSpace): AudioClip[] {
  const clips: AudioClip[] = program.items.flatMap((item) => {
    if (!item.includeAudio) return [];
    const presentSeconds = (item.span.endFrameExclusive - item.span.startFrame)
      * programSpace.frameRate.denominator / programSpace.frameRate.numerator;
    const playbackRate = item.playback === "stretch" && item.artifact.durationSec > 0
      ? item.artifact.durationSec / presentSeconds
      : undefined;
    return [{
      id: `source:${item.id}`,
      span: { ...item.span },
      artifact: item.artifact,
      ...(item.mediaStartSec === undefined ? {} : { mediaStartSec: item.mediaStartSec }),
      ...(playbackRate === undefined ? {} : { playbackRate }),
      ...(item.audioGain === undefined ? {} : { gain: item.audioGain }),
      bus: "source" as const,
    }];
  });
  const totalFrames = programSpaceFrameCount(programSpace);
  for (const transition of program.transitions) {
    if (!transition.sfx) continue;
    const durationFrames = Math.max(1, Math.round(
      transition.sfx.artifact.durationSec
        * programSpace.frameRate.numerator
        / programSpace.frameRate.denominator,
    ));
    clips.push({
      id: `transition:${transition.id}`,
      span: {
        startFrame: transition.span.startFrame,
        endFrameExclusive: Math.min(totalFrames, transition.span.startFrame + durationFrames),
      },
      artifact: transition.sfx.artifact,
      ...(transition.sfx.gain === undefined ? {} : { gain: transition.sfx.gain }),
      bus: "sfx",
    });
  }
  return clips;
}

function productContent(value: Omit<BrollProduct, "productDigest">): Omit<BrollProduct, "productDigest"> {
  return {
    contract: "svml.broll-product@1",
    programSpace: structuredClone(value.programSpace),
    visualTrack: structuredClone(value.visualTrack),
    audioTrack: structuredClone(value.audioTrack),
  };
}

export function computeBrollProductDigest(value: Omit<BrollProduct, "productDigest">): Digest {
  return digestOf(productContent(value));
}

export function compileBrollProduct(programSpace: ProgramSpace, program: BrollProgram): BrollProduct {
  assertBrollProgramIdentity(program, programSpace);
  const { incoming, outgoing } = transitionMaps(program, programSpaceFrameCount(programSpace));
  const visualTrack = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: `${program.id}:visual`,
    programSpaceDigest: programSpace.digest,
    presents: program.items.map((item) => ({
      id: item.id,
      span: { ...item.span },
      stacking: { order: item.z, tieBreak: item.tieBreak },
      elements: itemElements(item, itemAnimation(item, incoming.get(item.id), outgoing.get(item.id)), programSpace),
    })),
  });
  const audioTrack = sealAudioTrack({
    contract: "svml.audio-track@1",
    id: `${program.id}:audio`,
    programSpaceDigest: programSpace.digest,
    clips: audioClips(program, programSpace),
  });
  const content = productContent({
    contract: "svml.broll-product@1",
    programSpace,
    visualTrack,
    audioTrack,
  });
  const product = { ...content, productDigest: digestOf(content) };
  assertBrollProductIdentity(product, programSpace);
  return product;
}

export function assertBrollProductIdentity(product: BrollProduct, programSpace: ProgramSpace): void {
  assertProgramSpaceIdentity(programSpace);
  assertProgramSpaceIdentity(product.programSpace);
  if (product.contract !== "svml.broll-product@1") throw new Error("Unsupported BrollProduct contract.");
  if (
    product.programSpace.digest !== programSpace.digest
  ) throw new Error("BrollProduct affinity is invalid.");
  const { productDigest: _digest, ...content } = product;
  if (!isDigest(product.productDigest) || product.productDigest !== computeBrollProductDigest(content)) {
    throw new Error("BrollProduct digest does not match its contents.");
  }
  assertVisualTrackIdentity(product.visualTrack, programSpace);
  assertAudioTrackIdentity(product.audioTrack, programSpace);
}

function assertStandaloneProductDigest(product: BrollProduct): void {
  const { productDigest: _digest, ...content } = product;
  if (!isDigest(product.productDigest) || product.productDigest !== computeBrollProductDigest(content)) {
    throw new Error("BrollProduct digest does not match its contents.");
  }
  assertProgramSpaceIdentity(product.programSpace);
  assertVisualTrackIdentity(product.visualTrack, product.programSpace);
  assertAudioTrackIdentity(product.audioTrack, product.programSpace);
}

export function projectBrollVisual(product: BrollProduct) {
  assertStandaloneProductDigest(product);
  return product.visualTrack;
}

export function projectBrollAudio(product: BrollProduct) {
  assertStandaloneProductDigest(product);
  return product.audioTrack;
}
