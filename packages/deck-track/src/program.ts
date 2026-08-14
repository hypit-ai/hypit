import {
  assertFontArtifactRef,
} from "@narratage/media";
import {
  assertMediaFramePresentation,
  assertMediaLayerSet,
  assertMediaLifecycleMotion,
} from "@narratage/media-track";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import {
  assertProgramSpaceIdentity,
  programSpaceFrameCount,
} from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize, digestOf } from "@narratage/protocol";
import { verifyText } from "@narratage/text";
import type { Text } from "@narratage/text";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { assertSpatialFrame } from "@narratage/spatial";
import type { SpatialFrame } from "@narratage/spatial";
import {
  locateMomentOccurrences,
  locateSelectionOccurrences,
} from "@narratage/temporal";

import type {
  DeckCardTone,
  DepthStackCardLabel,
  DepthStackCardLabelStyle,
  DepthStackCardSet,
  DepthStackCardSpec,
  DepthStackHeader,
  DepthStackPose,
  DepthStackPoseStep,
  DepthStackProgram,
  DepthStackSpec,
  DepthStackState,
} from "./types.js";

export const depthStackImplementationDigests = {
  bindLabelText: digestOf("@narratage/deck-track/bind-label-text@1"),
  createCards: digestOf("@narratage/deck-track/create-cards@1"),
  appendMomentCard: digestOf("@narratage/deck-track/append-moment-card@1"),
  finalizeProgramEnd: digestOf("@narratage/deck-track/finalize-program-end@1"),
  finalizeUntilMoment: digestOf("@narratage/deck-track/finalize-until-moment@1"),
  finalizeUntilSelectionStart: digestOf("@narratage/deck-track/finalize-until-selection-start@1"),
  finalizeUntilSelectionEnd: digestOf("@narratage/deck-track/finalize-until-selection-end@1"),
  render: digestOf("@narratage/deck-track/render-depth-stack@1"),
} as const;

export const depthStackValidatorDigests = {
  program: digestOf("@narratage/deck-track/validate-program@1"),
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function unit(value: number, label: string): void {
  finite(value, label);
  assert(value >= 0 && value <= 1, `${label} must be inside [0, 1].`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  assert(value > 0, `${label} must be positive.`);
}

function assertTone(value: DeckCardTone, label: string): void {
  positive(value.brightness, `${label}.brightness`);
  positive(value.contrast, `${label}.contrast`);
  positive(value.saturation, `${label}.saturation`);
}

function assertPose(value: DepthStackPose, label: string): void {
  finite(value.xPx, `${label}.xPx`);
  finite(value.yPx, `${label}.yPx`);
  positive(value.scale, `${label}.scale`);
  finite(value.rotationDeg, `${label}.rotationDeg`);
  unit(value.opacity, `${label}.opacity`);
  assert(Number.isSafeInteger(value.stacking), `${label}.stacking must be an integer.`);
  assertTone(value.tone, `${label}.tone`);
}

function assertPoseStep(value: DepthStackPoseStep, label: string): void {
  finite(value.xPerDepthPx, `${label}.xPerDepthPx`);
  finite(value.yPerDepthPx, `${label}.yPerDepthPx`);
  positive(value.scalePerDepth, `${label}.scalePerDepth`);
  finite(value.rotationPerDepthDeg, `${label}.rotationPerDepthDeg`);
  assert(value.rotationMode === "linear" || value.rotationMode === "alternate", `${label}.rotationMode is invalid.`);
  unit(value.opacityPerDepth, `${label}.opacityPerDepth`);
  assert(Number.isSafeInteger(value.stackingPerDepth), `${label}.stackingPerDepth must be an integer.`);
  assertTone(value.tonePerDepth, `${label}.tonePerDepth`);
}

export function assertDepthStackSpec(value: DepthStackSpec): void {
  for (const [name, count] of Object.entries(value.visibility)) {
    if (name === "wrap") continue;
    assert(Number.isSafeInteger(count) && typeof count === "number" && count >= 0 && count <= 1_000,
      `DepthStackSpec.visibility.${name} is invalid.`);
  }
  assert(typeof value.visibility.wrap === "boolean", "DepthStackSpec.visibility.wrap is invalid.");
  assertPose(value.poses.current, "DepthStackSpec.poses.current");
  assertPoseStep(value.poses.previous, "DepthStackSpec.poses.previous");
  assertPoseStep(value.poses.next, "DepthStackSpec.poses.next");
  assert(Number.isSafeInteger(value.reflow.durationFrames) && value.reflow.durationFrames >= 0,
    "DepthStackSpec.reflow.durationFrames must be a non-negative integer.");
  assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.reflow.easing),
    "DepthStackSpec.reflow.easing is invalid.");
  assertMediaFramePresentation(value.presentation, "DepthStackSpec.presentation");
  assert(Number.isSafeInteger(value.stackingOrder), "DepthStackSpec.stackingOrder must be an integer.");
}

export function sealDepthStackSpec(value: DepthStackSpec): DepthStackSpec {
  assertDepthStackSpec(value);
  return canonicalize(value) as unknown as DepthStackSpec;
}

export function assertDepthStackCardLabel(value: DepthStackCardLabel): void {
  if (value.kind === "none") return;
  assert(value.kind === "text", "DepthStackCardLabel kind is invalid.");
  assert(value.document.paragraphs.length > 0, "DepthStackCardLabel document is empty.");
  const fonts = value.typography.fonts;
  assert(fonts !== undefined && fonts.length > 0,
    "DepthStackCardLabel requires exact font Artifacts.");
  for (const [index, font] of fonts.entries()) assertFontArtifactRef(font, `DepthStackCardLabel.fonts.${index}`);
  assert(value.typography.synthesis === "none", "DepthStackCardLabel cannot synthesize an exact font.");
  assert(value.flow.form.kind === "area", "DepthStackCardLabel uses Area flow inside its Card.");
}

export function sealDepthStackCardLabel(value: DepthStackCardLabel): DepthStackCardLabel {
  assertDepthStackCardLabel(value);
  return canonicalize(value) as unknown as DepthStackCardLabel;
}

export function assertDepthStackCardLabelStyle(value: DepthStackCardLabelStyle): void {
  assert(value.typography.fonts.length > 0, "DepthStackCardLabelStyle requires exact fonts.");
  value.typography.fonts.forEach((font, index) => assertFontArtifactRef(font, `DepthStackCardLabelStyle.fonts.${index}`));
  assert(value.typography.synthesis === "none", "DepthStackCardLabelStyle cannot synthesize an exact font.");
  assert(value.flow.form.kind === "area", "DepthStackCardLabelStyle uses Area flow inside its Card.");
}

export function sealDepthStackCardLabelStyle(value: DepthStackCardLabelStyle): DepthStackCardLabelStyle {
  assertDepthStackCardLabelStyle(value);
  return canonicalize(value) as unknown as DepthStackCardLabelStyle;
}

export function bindDepthStackCardLabelText(style: DepthStackCardLabelStyle, content: Text): DepthStackCardLabel {
  assertDepthStackCardLabelStyle(style);
  verifyText(content);
  assert(content.value.trim().length > 0, "DepthStack Card label Text is empty.");
  return sealDepthStackCardLabel({

    kind: "text",
    document: { paragraphs: [{ id: "label:paragraph", inlines: [{ kind: "text", id: "label:text", text: content.value }] }] },
    typography: structuredClone(style.typography),
    paints: structuredClone(style.paints),
    flow: structuredClone(style.flow),
  });
}

export const noDepthStackCardLabel = (): DepthStackCardLabel => ({

  kind: "none",
});

export function assertDepthStackCardSpec(value: DepthStackCardSpec): void {
  identity(value.id, "DepthStackCardSpec.id");
  assert(value.playback.future === "hold-head" || value.playback.future === "continue",
    "DepthStackCardSpec.playback.future is invalid.");
  assert(["hold-tail", "continue", "hide"].includes(value.playback.past),
    "DepthStackCardSpec.playback.past is invalid.");
}

export function sealDepthStackCardSpec(value: DepthStackCardSpec): DepthStackCardSpec {
  assertDepthStackCardSpec(value);
  return canonicalize(value) as unknown as DepthStackCardSpec;
}

export function assertDepthStackHeader(value: DepthStackHeader): void {
  identity(value.id, "DepthStackHeader.id");
}

export function sealDepthStackHeader(value: DepthStackHeader): DepthStackHeader {
  assertDepthStackHeader(value);
  return canonicalize(value) as unknown as DepthStackHeader;
}

export function createDepthStackCardSet(): DepthStackCardSet {
  return { cards: [] };
}

export function assertDepthStackCardSet(value: DepthStackCardSet): void {
  assert(Array.isArray(value.cards),
    "DepthStackCardSet is invalid.");
  const ids = new Set<string>();
  let previous = -1;
  for (const card of value.cards) {
    identity(card.id, "DepthStack Card id");
    assert(!ids.has(card.id), `DepthStackCardSet repeats ${card.id}.`);
    ids.add(card.id);
    assert(Number.isSafeInteger(card.activationFrame) && card.activationFrame >= 0,
      `DepthStack Card ${card.id} activation is invalid.`);
    assert(card.activationFrame > previous, "DepthStack Card triggers must be strictly increasing in authored order.");
    previous = card.activationFrame;
    assertMediaLayerSet(card.material);
    assert(card.material.layers.length > 0, `DepthStack Card ${card.id} material is empty.`);
    assertDepthStackCardLabel(card.label);
    assertDepthStackCardSpec({ id: card.id, playback: card.playback });
  }
}

export function appendDepthStackCard(
  set: DepthStackCardSet,
  material: DepthStackCardSet["cards"][number]["material"],
  label: DepthStackCardLabel,
  spec: DepthStackCardSpec,
  activationFrame: number,
): DepthStackCardSet {
  assertDepthStackCardSet(set);
  assertMediaLayerSet(material);
  assert(material.layers.length > 0, `DepthStack Card ${spec.id} material is empty.`);
  assertDepthStackCardLabel(label);
  assertDepthStackCardSpec(spec);
  assert(Number.isSafeInteger(activationFrame) && activationFrame >= 0,
    `DepthStack Card ${spec.id} activation is invalid.`);
  const result: DepthStackCardSet = {

    cards: [...set.cards, {
      id: spec.id,
      activationFrame,
      material: structuredClone(material),
      label: structuredClone(label),
      playback: { ...spec.playback },
    }],
  };
  assertDepthStackCardSet(result);
  return canonicalize(result) as unknown as DepthStackCardSet;
}

export function appendDepthStackMomentCard(
  set: DepthStackCardSet,
  material: DepthStackCardSet["cards"][number]["material"],
  label: DepthStackCardLabel,
  spec: DepthStackCardSpec,
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  space: ProgramSpace,
): DepthStackCardSet {
  const occurrences = locateMomentOccurrences(map, moment, space);
  assert(occurrences.length === 1,
    `DepthStack Card ${spec.id} Moment must locate exactly once; received ${occurrences.length}.`);
  return appendDepthStackCard(set, material, label, spec, occurrences[0]!.cue.frame);
}

function terminalMoment(map: CompleteSemanticMap, moment: NarrativeMomentRef, space: ProgramSpace): number {
  const occurrences = locateMomentOccurrences(map, moment, space);
  assert(occurrences.length === 1,
    `DepthStack terminal Moment must locate exactly once; received ${occurrences.length}.`);
  return occurrences[0]!.cue.frame;
}

function terminalSelection(
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  space: ProgramSpace,
  boundary: "start" | "end",
): number {
  const occurrences = locateSelectionOccurrences(map, selection, space);
  assert(occurrences.length === 1,
    `DepthStack terminal Selection must locate exactly once; received ${occurrences.length}.`);
  return boundary === "start" ? occurrences[0]!.start.frame : occurrences[0]!.end.frame;
}

export function finalizeDepthStack(
  set: DepthStackCardSet,
  header: DepthStackHeader,
  frame: SpatialFrame,
  spec: DepthStackSpec,
  terminalFrame: number,
  space: ProgramSpace,
): DepthStackProgram {
  assertDepthStackCardSet(set);
  assertDepthStackHeader(header);
  assertSpatialFrame(frame);
  assertDepthStackSpec(spec);
  assertProgramSpaceIdentity(space);
  assert(set.cards.length > 0, "DepthStack requires at least one Card.");
  const first = set.cards[0]!;
  const program: DepthStackProgram = {

    id: header.id,
    span: { startFrame: first.activationFrame, endFrameExclusive: terminalFrame },
    terminalFrame,
    frame: structuredClone(frame),
    spec: structuredClone(spec),
    cards: structuredClone(set.cards),
  };
  assertDepthStackProgramIdentity(program, space);
  return canonicalize(program) as unknown as DepthStackProgram;
}

export function finalizeDepthStackAtProgramEnd(
  set: DepthStackCardSet,
  header: DepthStackHeader,
  frame: SpatialFrame,
  spec: DepthStackSpec,
  space: ProgramSpace,
): DepthStackProgram {
  return finalizeDepthStack(set, header, frame, spec, programSpaceFrameCount(space), space);
}

export function finalizeDepthStackUntilMoment(
  set: DepthStackCardSet,
  header: DepthStackHeader,
  frame: SpatialFrame,
  spec: DepthStackSpec,
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  space: ProgramSpace,
): DepthStackProgram {
  return finalizeDepthStack(set, header, frame, spec, terminalMoment(map, moment, space), space);
}

export function finalizeDepthStackUntilSelection(
  set: DepthStackCardSet,
  header: DepthStackHeader,
  frame: SpatialFrame,
  spec: DepthStackSpec,
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  boundary: "start" | "end",
  space: ProgramSpace,
): DepthStackProgram {
  return finalizeDepthStack(set, header, frame, spec, terminalSelection(map, selection, space, boundary), space);
}

export function assertDepthStackProgram(program: DepthStackProgram): void {
  identity(program.id, "DepthStackProgram.id");
  assertSpatialFrame(program.frame);
  assertDepthStackSpec(program.spec);
  const set = { cards: program.cards } as const;
  assertDepthStackCardSet(set);
  assert(program.cards.length > 0, "DepthStackProgram has no Cards.");
  assert(Number.isSafeInteger(program.terminalFrame) && program.terminalFrame > 0,
    "DepthStack terminal is invalid.");
  assert(program.span.startFrame === program.cards[0]!.activationFrame
    && program.span.endFrameExclusive === program.terminalFrame,
  "DepthStackProgram span disagrees with its Card triggers and terminal.");
  assert(program.cards.at(-1)!.activationFrame < program.terminalFrame,
    "DepthStack terminal must be after every Card trigger.");
  if (program.spec.visibility.wrap) {
    assert(program.spec.visibility.previous + program.spec.visibility.next + 1 <= program.cards.length,
      "Wrapped DepthStack visibility would show one Card at several relative depths.");
  }
  const duration = program.terminalFrame - program.cards[0]!.activationFrame;
  assertMediaLifecycleMotion(program.spec.motion, duration, "DepthStack whole-group motion");
  for (let index = 1; index < program.cards.length; index += 1) {
    const stageEnd = program.cards[index + 1]?.activationFrame ?? program.terminalFrame;
    const stageDuration = stageEnd - program.cards[index]!.activationFrame;
    assert(program.spec.reflow.durationFrames <= stageDuration,
      `DepthStack reflow exceeds Card ${program.cards[index]!.id} stage.`);
  }
}

export function assertDepthStackProgramIdentity(program: DepthStackProgram, space: ProgramSpace): void {
  assertProgramSpaceIdentity(space);
  assertDepthStackProgram(program);
  assert(program.terminalFrame <= programSpaceFrameCount(space), "DepthStack terminal is outside ProgramSpace.");
}

function modulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** Resolve one immutable collection state; no renderer or previous-frame memory participates. */
export function resolveDepthStackState(program: DepthStackProgram, currentIndex: number): DepthStackState {
  assert(Number.isSafeInteger(currentIndex) && currentIndex >= 0 && currentIndex < program.cards.length,
    "DepthStack current index is invalid.");
  const state = new Map<number, number>([[currentIndex, 0]]);
  const add = (rawIndex: number, depth: number): void => {
    const index = program.spec.visibility.wrap ? modulo(rawIndex, program.cards.length) : rawIndex;
    if (index < 0 || index >= program.cards.length) return;
    if (depth < 0 && program.cards[index]!.playback.past === "hide") return;
    assert(!state.has(index), `DepthStack Card ${program.cards[index]!.id} occupies several relative depths.`);
    state.set(index, depth);
  };
  for (let depth = 1; depth <= program.spec.visibility.previous; depth += 1) add(currentIndex - depth, -depth);
  for (let depth = 1; depth <= program.spec.visibility.next; depth += 1) add(currentIndex + depth, depth);
  return state;
}

function power(value: number, exponent: number): number {
  return Math.round((value ** exponent) * 1_000_000) / 1_000_000;
}

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function resolveDepthStackPose(spec: DepthStackSpec, relativeDepth: number): DepthStackPose {
  assertDepthStackSpec(spec);
  assert(Number.isSafeInteger(relativeDepth), "DepthStack relative depth must be an integer.");
  if (relativeDepth === 0) return structuredClone(spec.poses.current);
  const magnitude = Math.abs(relativeDepth);
  const step = relativeDepth < 0 ? spec.poses.previous : spec.poses.next;
  const rotationFactor = step.rotationMode === "linear" ? magnitude : magnitude % 2 === 1 ? 1 : -1;
  const current = spec.poses.current;
  return {
    xPx: clean(current.xPx + (step.xPerDepthPx * magnitude)),
    yPx: clean(current.yPx + (step.yPerDepthPx * magnitude)),
    scale: clean(current.scale * power(step.scalePerDepth, magnitude)),
    rotationDeg: clean(current.rotationDeg + (step.rotationPerDepthDeg * rotationFactor)),
    opacity: clean(current.opacity * power(step.opacityPerDepth, magnitude)),
    stacking: current.stacking + (step.stackingPerDepth * magnitude),
    tone: {
      brightness: clean(current.tone.brightness * power(step.tonePerDepth.brightness, magnitude)),
      contrast: clean(current.tone.contrast * power(step.tonePerDepth.contrast, magnitude)),
      saturation: clean(current.tone.saturation * power(step.tonePerDepth.saturation, magnitude)),
    },
  };
}
