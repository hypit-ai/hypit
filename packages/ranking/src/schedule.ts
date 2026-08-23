import {
  assertFontArtifactRef,
  verifySynchronizedMedia,
} from "@hypit/media";
import type { SynchronizedMedia } from "@hypit/media";
import {
  assertProgramSpaceIdentity,
  programSpaceFrameCount,
} from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize, isDigest } from "@hypit/protocol";
import { verifyText } from "@hypit/text";
import type { Text } from "@hypit/text";
import { assertCanvasSpace, assertSpatialFrame } from "@hypit/spatial";
import type { CanvasSpace } from "@hypit/spatial";
import { resolveTriggeredSchedule } from "@hypit/temporal";
import type { TemporalPoint, TemporalWindow } from "@hypit/temporal";

import type {
  ColumnItem,
  ColumnItemSet,
  ColumnItemSpec,
  ColumnProgram,
  ColumnSchedule,
  ColumnStyle,
  ColumnWindowCandidateSet,
  RankingBoardPaint,
  RankingHeader,
  RankingItemSpec,
  RankingItemSpecSet,
  RankingTextItemShell,
  RankingMotionStyle,
  RankingSchedule,
  RankingSoundEvent,
  RankingSoundEventPlan,
  RankingSoundSet,
  RankingSoundStyle,
  RankingTextStyle,
  RankingVariant,
  TriggeredRankingCandidateSet,
  TriggeredRankingSchedule,
  TierBoardItem,
  TierBoardItemSet,
  TierBoardItemSpec,
  TierBoardProgram,
  TierBoardStyle,
  TopThreeItem,
  TopThreeItemSet,
  TopThreeItemSpec,
  TopThreeProgram,
  TopThreeStyle,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function frame(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative frame.`);
}

function color(value: string, label: string): void {
  assert(value === "transparent" || /^#[0-9a-f]{3,8}$/iu.test(value), `${label} must be a hexadecimal color or transparent.`);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function nonNegative(value: number, label: string): void {
  finite(value, label);
  assert(value >= 0, `${label} must be non-negative.`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  assert(value > 0, `${label} must be positive.`);
}

function integer(value: number, label: string, minimum = 0): void {
  assert(Number.isSafeInteger(value) && value >= minimum, `${label} must be an integer >= ${minimum}.`);
}

function stacking(value: number, label: string): void {
  assert(Number.isSafeInteger(value), `${label} must be an integer.`);
}

function assertBlobImage(value: { readonly digest: string; readonly size: number; readonly mediaType: string }, label: string): void {
  assert(isDigest(value.digest) && Number.isSafeInteger(value.size) && value.size >= 0
    && /^image\//u.test(value.mediaType), `${label} must be an image Artifact.`);
}

export function assertRankingHeader(value: RankingHeader): void {
  identity(value.id, "RankingHeader.id");
  assert(["tier-board", "column", "top-three"].includes(value.variant),
    "RankingHeader.variant is invalid.");
}

export function sealRankingHeader(value: RankingHeader): RankingHeader {
  assertRankingHeader(value);
  return canonicalize(value) as unknown as RankingHeader;
}

export function assertRankingTextStyle(value: RankingTextStyle, label: string): void {
  assert(value.fonts.length > 0, `${label}.fonts is empty.`);
  for (const [index, fontValue] of value.fonts.entries()) assertFontArtifactRef(fontValue, `${label}.fonts.${index}`);
  positive(value.sizePx, `${label}.sizePx`);
  integer(value.weight, `${label}.weight`, 1);
  assert(value.weight <= 1_000, `${label}.weight exceeds 1000.`);
  color(value.color, `${label}.color`);
  positive(value.lineHeight, `${label}.lineHeight`);
}

export function assertRankingBoardPaint(value: RankingBoardPaint, label: string): void {
  color(value.background, `${label}.background`);
  color(value.borderColor, `${label}.borderColor`);
  nonNegative(value.borderWidthPx, `${label}.borderWidthPx`);
  nonNegative(value.radiusPx, `${label}.radiusPx`);
  finite(value.shadow.offsetX, `${label}.shadow.offsetX`);
  finite(value.shadow.offsetY, `${label}.shadow.offsetY`);
  nonNegative(value.shadow.blurPx, `${label}.shadow.blurPx`);
  finite(value.shadow.spreadPx, `${label}.shadow.spreadPx`);
  color(value.shadow.color, `${label}.shadow.color`);
}

export function assertRankingMotionStyle(value: RankingMotionStyle, label: string): void {
  integer(value.appearFrames, `${label}.appearFrames`, 1);
  integer(value.moveFrames, `${label}.moveFrames`, 1);
  assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.easing), `${label}.easing is invalid.`);
}

export function assertRankingSoundStyle(value: RankingSoundStyle): void {
  for (const [name, gain] of [["appearGain", value.appearGain], ["moveGain", value.moveGain]] as const) {
    nonNegative(gain, `RankingSoundStyle.${name}`);
    assert(gain <= 64, `RankingSoundStyle.${name} exceeds 64.`);
  }
  integer(value.fadeFrames, "RankingSoundStyle.fadeFrames");
}

function assertCommonStyle(input: {
  readonly text: RankingTextStyle;
  readonly motion: RankingMotionStyle;
  readonly iconSizePx: number;
  readonly iconRadiusPx: number;
  readonly iconFit: "contain" | "cover";
  readonly boardStackingOrder: number;
  readonly itemStackingOrder: number;
}, label: string): void {
  assertRankingTextStyle(input.text, `${label}.text`);
  assertRankingMotionStyle(input.motion, `${label}.motion`);
  positive(input.iconSizePx, `${label}.iconSizePx`);
  nonNegative(input.iconRadiusPx, `${label}.iconRadiusPx`);
  assert(input.iconFit === "contain" || input.iconFit === "cover", `${label}.iconFit is invalid.`);
  stacking(input.boardStackingOrder, `${label}.boardStackingOrder`);
  stacking(input.itemStackingOrder, `${label}.itemStackingOrder`);
}

export function assertTierBoardStyle(value: TierBoardStyle): void {
  assertCommonStyle(value, "TierBoardStyle");
  assertRankingBoardPaint(value.board, "TierBoardStyle.board");
  assert(value.rows.length > 0, "TierBoardStyle.rows is empty.");
  const rows = new Set<string>();
  for (const [index, row] of value.rows.entries()) {
    identity(row.id, `TierBoardStyle.rows.${index}.id`);
    assert(!rows.has(row.id), `TierBoardStyle repeats row ${row.id}.`);
    rows.add(row.id);
    assert(row.label.trim().length > 0, `TierBoardStyle.rows.${index}.label is empty.`);
    color(row.color, `TierBoardStyle.rows.${index}.color`);
  }
  for (const [name, numberValue] of Object.entries({
    labelWidthPx: value.labelWidthPx, paddingPx: value.paddingPx, rowHeightPx: value.rowHeightPx,
    rowGapPx: value.rowGapPx, cellGapPx: value.cellGapPx, stageSizePx: value.stageSizePx,
  })) nonNegative(numberValue, `TierBoardStyle.${name}`);
  assert(value.labelWidthPx > 0 && value.rowHeightPx > 0 && value.stageSizePx > 0,
    "TierBoardStyle positive geometry is invalid.");
  for (const [name, coordinate] of Object.entries(value.stagePoint)) {
    assert(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1, `TierBoardStyle.stagePoint.${name} is invalid.`);
  }
  stacking(value.stageStackingOrder, "TierBoardStyle.stageStackingOrder");
}

export function assertColumnStyle(value: ColumnStyle): void {
  assertCommonStyle(value, "ColumnStyle");
  assertRankingBoardPaint(value.board, "ColumnStyle.board");
  assert(value.rankColors.length > 0, "ColumnStyle.rankColors is empty.");
  value.rankColors.forEach((item, index) => color(item, `ColumnStyle.rankColors.${index}`));
  for (const [name, numberValue] of Object.entries({
    paddingPx: value.paddingPx, rowHeightPx: value.rowHeightPx, rowGapPx: value.rowGapPx, stageSizePx: value.stageSizePx,
  })) nonNegative(numberValue, `ColumnStyle.${name}`);
  assert(value.rowHeightPx > 0 && value.stageSizePx > 0, "ColumnStyle positive geometry is invalid.");
  for (const [name, coordinate] of Object.entries(value.stagePoint)) {
    assert(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1, `ColumnStyle.stagePoint.${name} is invalid.`);
  }
  stacking(value.stageStackingOrder, "ColumnStyle.stageStackingOrder");
}

export function assertTopThreeStyle(value: TopThreeStyle): void {
  assertCommonStyle(value, "TopThreeStyle");
  assert(value.slotColors.length >= 3, "TopThreeStyle requires three slot colors.");
  value.slotColors.forEach((item, index) => color(item, `TopThreeStyle.slotColors.${index}`));
  for (const [name, coordinate] of [["centerX", value.centerX], ["baselineY", value.baselineY]] as const) {
    assert(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1, `TopThreeStyle.${name} is invalid.`);
  }
  positive(value.slotGapPx, "TopThreeStyle.slotGapPx");
  nonNegative(value.ringWidthPx, "TopThreeStyle.ringWidthPx");
  nonNegative(value.labelGapPx, "TopThreeStyle.labelGapPx");
}

export function assertRankingItemSpec(value: RankingItemSpec): void {
  identity(value.id, "RankingItemSpec.id");
  if (value.variant === "tier-board") {
    identity(value.tier, `TierBoardItemSpec.${value.id}.tier`);
    assert(value.entry === "direct" || value.entry === "stage", `TierBoardItemSpec.${value.id}.entry is invalid.`);
  } else if (value.variant === "column") {
    assert(value.label.trim().length > 0, `ColumnItemSpec.${value.id}.label is empty.`);
    integer(value.rank, `ColumnItemSpec.${value.id}.rank`, 1);
    assert(typeof value.preset === "boolean", `ColumnItemSpec.${value.id}.preset is invalid.`);
  } else {
    assert(value.label.trim().length > 0, `TopThreeItemSpec.${value.id}.label is empty.`);
  }
  if (value.stackingOrder !== undefined) stacking(value.stackingOrder, `RankingItemSpec.${value.id}.stackingOrder`);
}

export function assertRankingTextItemShell(value: RankingTextItemShell): void {
  identity(value.id, "RankingTextItemShell.id");
  assert(value.variant === "column" || value.variant === "top-three",
    "RankingTextItemShell variant is invalid.");
  if (value.stackingOrder !== undefined) stacking(value.stackingOrder, `RankingTextItemShell.${value.id}.stackingOrder`);
}

export function sealRankingTextItemShell(value: RankingTextItemShell): RankingTextItemShell {
  const result = canonicalize(value) as unknown as RankingTextItemShell;
  assertRankingTextItemShell(result);
  return result;
}

export function materializeRankingTextItem(shell: RankingTextItemShell, content: Text): RankingItemSpec {
  assertRankingTextItemShell(shell);
  verifyText(content);
  assert(content.value.trim().length > 0, `Ranking Text Item ${shell.id} content is empty.`);
  const result: RankingItemSpec = { ...shell, label: content.value };
  assertRankingItemSpec(result);
  return canonicalize(result) as unknown as RankingItemSpec;
}

export function createRankingItemSpecSet(header: RankingHeader): RankingItemSpecSet {
  assertRankingHeader(header);
  return { variant: header.variant, items: [] };
}

export function assertRankingItemSpecSet(value: RankingItemSpecSet): void {
  assert(["tier-board", "column", "top-three"].includes(value.variant),
    "RankingItemSpecSet.variant is invalid.");
  const ids = new Set<string>();
  const ranks = new Set<number>();
  for (const item of value.items) {
    assertRankingItemSpec(item);
    assert(item.variant === value.variant, "RankingItemSpecSet mixes component variants.");
    assert(!ids.has(item.id), `RankingItemSpecSet repeats ${item.id}.`);
    ids.add(item.id);
    if (item.variant === "column") {
      assert(!ranks.has(item.rank), `RankingItemSpecSet repeats Column rank ${item.rank}.`);
      ranks.add(item.rank);
    }
  }
}

export function appendRankingItemSpec(set: RankingItemSpecSet, spec: RankingItemSpec): RankingItemSpecSet {
  assertRankingItemSpecSet(set);
  assertRankingItemSpec(spec);
  assert(spec.variant === set.variant, "Ranking Item variant does not match its component.");
  const result: RankingItemSpecSet = { ...set, items: [...set.items, structuredClone(spec)] };
  assertRankingItemSpecSet(result);
  return canonicalize(result) as unknown as RankingItemSpecSet;
}

export function createTriggeredRankingCandidateSet(): TriggeredRankingCandidateSet {
  return { entries: [] };
}

export function assertTriggeredRankingCandidateSet(value: TriggeredRankingCandidateSet): void {
  assert(Array.isArray(value.entries), "TriggeredRankingCandidateSet.entries is invalid.");
  const itemIds = new Set<string>();
  for (const [index, entry] of value.entries.entries()) {
    identity(entry.itemId, `TriggeredRankingCandidateSet.entries.${index}.itemId`);
    assert(!itemIds.has(entry.itemId), `TriggeredRankingCandidateSet repeats ${entry.itemId}.`);
    itemIds.add(entry.itemId);
    frame(entry.activation.frame, `TriggeredRankingCandidateSet.entries.${index}.activation.frame`);
  }
}

export function appendTriggeredRankingCandidate(
  set: TriggeredRankingCandidateSet,
  spec: RankingItemSpec,
  activation: TemporalPoint,
): TriggeredRankingCandidateSet {
  assertTriggeredRankingCandidateSet(set);
  assertRankingItemSpec(spec);
  assert(spec.variant !== "column", `Column Item ${spec.id} consumes a Selection window, not a Moment.`);
  assert(!set.entries.some((entry) => entry.itemId === spec.id), `Ranking Item ${spec.id} already has a Moment.`);
  const result: TriggeredRankingCandidateSet = {
    entries: [...set.entries, { itemId: spec.id, activation: structuredClone(activation) }],
  };
  assertTriggeredRankingCandidateSet(result);
  return canonicalize(result) as unknown as TriggeredRankingCandidateSet;
}

export function buildTriggeredRankingSchedule(input: {
  readonly header: RankingHeader;
  readonly items: RankingItemSpecSet;
  readonly space: ProgramSpace;
  readonly outer: TemporalWindow;
  readonly candidates: TriggeredRankingCandidateSet;
  readonly terminal: TemporalPoint;
}): TriggeredRankingSchedule {
  assertRankingHeader(input.header);
  assertRankingItemSpecSet(input.items);
  assert(input.items.variant === input.header.variant, "Ranking schedule variant disagrees with its item set.");
  assert(input.header.variant !== "column", "Column uses item-owned Selection windows, not the triggered Ranking schedule.");
  assert(input.items.items.length > 0, "Ranking requires at least one Item.");
  assertTriggeredRankingCandidateSet(input.candidates);
  const expected = new Set(input.items.items.map((item) => item.id));
  const received = new Set(input.candidates.entries.map((entry) => entry.itemId));
  assert(expected.size === received.size && [...expected].every((id) => received.has(id)),
    "Ranking Items and item-owned Moments differ.");
  const ordered = [...input.candidates.entries].sort((left, right) =>
    left.activation.frame - right.activation.frame || left.itemId.localeCompare(right.itemId));
  const resolved = resolveTriggeredSchedule({
    outer: { ...input.outer.span },
    terminalFrame: input.terminal.frame,
    triggers: ordered.map((item) => ({ id: item.itemId, frame: item.activation.frame })),
  });
  const entries = ordered.map((candidate, index) => {
    const exclusive = resolved.exclusive[index]!;
    const cumulative = resolved.cumulative[index]!;
    return {
      itemId: candidate.itemId,
      triggerFrame: exclusive.startFrame,
      stage: { ...exclusive },
      cumulative: { ...cumulative },
      settled: { startFrame: exclusive.endFrameExclusive, endFrameExclusive: resolved.outer.endFrameExclusive },
    };
  });
  const result: TriggeredRankingSchedule = {
    id: input.header.id,
    variant: input.header.variant,
    outer: { ...resolved.outer },
    terminalFrame: resolved.terminalFrame,
    entries,
  };
  assertRankingSchedule(result, input.space);
  return canonicalize(result) as unknown as TriggeredRankingSchedule;
}

export function createColumnWindowCandidateSet(): ColumnWindowCandidateSet {
  return { entries: [] };
}

export function assertColumnWindowCandidateSet(value: ColumnWindowCandidateSet): void {
  assert(Array.isArray(value.entries), "ColumnWindowCandidateSet.entries is invalid.");
  const ids = new Set<string>();
  for (const [index, entry] of value.entries.entries()) {
    identity(entry.itemId, `ColumnWindowCandidateSet.entries.${index}.itemId`);
    assert(!ids.has(entry.itemId), `ColumnWindowCandidateSet repeats ${entry.itemId}.`);
    ids.add(entry.itemId);
    frame(entry.window.span.startFrame, `ColumnWindowCandidateSet.entries.${index}.window.span.startFrame`);
    frame(entry.window.span.endFrameExclusive, `ColumnWindowCandidateSet.entries.${index}.window.span.endFrameExclusive`);
    assert(entry.window.span.endFrameExclusive > entry.window.span.startFrame,
      `ColumnWindowCandidateSet.entries.${index}.window is empty.`);
  }
}

export function appendColumnWindowCandidateWindow(
  set: ColumnWindowCandidateSet,
  spec: ColumnItemSpec,
  window: TemporalWindow,
): ColumnWindowCandidateSet {
  assertColumnWindowCandidateSet(set);
  assertRankingItemSpec(spec);
  assert(!spec.preset, `Preset Column Item ${spec.id} cannot consume a Selection window.`);
  assert(!set.entries.some((entry) => entry.itemId === spec.id), `Column Item ${spec.id} already has a Selection window.`);
  const result: ColumnWindowCandidateSet = {
    entries: [...set.entries, { itemId: spec.id, window: structuredClone(window) }]
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
  };
  assertColumnWindowCandidateSet(result);
  return canonicalize(result) as unknown as ColumnWindowCandidateSet;
}

function clampColumnCandidate(
  preferred: { readonly startFrame: number; readonly endFrameExclusive: number },
  outer: { readonly startFrame: number; readonly endFrameExclusive: number },
): { readonly startFrame: number; readonly endFrameExclusive: number } {
  const startFrame = Math.max(preferred.startFrame, outer.startFrame);
  const endFrameExclusive = Math.min(preferred.endFrameExclusive, outer.endFrameExclusive);
  if (endFrameExclusive > startFrame) return { startFrame, endFrameExclusive };
  if (preferred.endFrameExclusive <= outer.startFrame) {
    return { startFrame: outer.startFrame, endFrameExclusive: outer.startFrame + 1 };
  }
  return { startFrame: outer.endFrameExclusive - 1, endFrameExclusive: outer.endFrameExclusive };
}

function resolveColumnActiveWindows(
  candidates: readonly ColumnWindowCandidateSet["entries"][number][],
  outer: { readonly startFrame: number; readonly endFrameExclusive: number },
): ReadonlyMap<string, { readonly startFrame: number; readonly endFrameExclusive: number }> {
  const capacity = outer.endFrameExclusive - outer.startFrame;
  assert(capacity >= candidates.length,
    `Column outer window has ${capacity} frames for ${candidates.length} non-preset Items.`);
  const ordered = candidates.map((candidate) => ({
    ...candidate,
    clamped: clampColumnCandidate(candidate.window.span, outer),
  })).sort((left, right) =>
    left.clamped.startFrame - right.clamped.startFrame
    || left.clamped.endFrameExclusive - right.clamped.endFrameExclusive
    || left.itemId.localeCompare(right.itemId));
  const resolved = new Map<string, { readonly startFrame: number; readonly endFrameExclusive: number }>();
  let cursor = outer.startFrame;
  for (const [index, candidate] of ordered.entries()) {
    const remaining = ordered.length - index - 1;
    const latestEnd = outer.endFrameExclusive - remaining;
    const startFrame = Math.min(Math.max(candidate.clamped.startFrame, cursor), latestEnd - 1);
    const endFrameExclusive = Math.min(Math.max(candidate.clamped.endFrameExclusive, startFrame + 1), latestEnd);
    resolved.set(candidate.itemId, { startFrame, endFrameExclusive });
    cursor = endFrameExclusive;
  }
  return resolved;
}

export function buildColumnSchedule(input: {
  readonly header: RankingHeader;
  readonly items: RankingItemSpecSet;
  readonly outer: TemporalWindow;
  readonly candidates: ColumnWindowCandidateSet;
}): ColumnSchedule {
  assertRankingHeader(input.header);
  assert(input.header.variant === "column", "Column Schedule requires a Column header.");
  assertRankingItemSpecSet(input.items);
  assert(input.items.variant === "column", "Column Schedule requires Column Items.");
  assert(input.items.items.length > 0, "Column requires at least one Item.");
  assertColumnWindowCandidateSet(input.candidates);
  frame(input.outer.span.startFrame, "Column outer window start");
  frame(input.outer.span.endFrameExclusive, "Column outer window end");
  assert(input.outer.span.endFrameExclusive > input.outer.span.startFrame, "Column outer window is empty.");
  const items = [...input.items.items as readonly ColumnItemSpec[]]
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));
  const expected = new Set(items.filter((item) => !item.preset).map((item) => item.id));
  const received = new Set(input.candidates.entries.map((entry) => entry.itemId));
  assert(expected.size === received.size && [...expected].every((id) => received.has(id)),
    "Column non-preset Items and Selection windows differ.");
  const active = resolveColumnActiveWindows(input.candidates.entries, input.outer.span);
  const result: ColumnSchedule = {
    id: input.header.id,
    variant: "column",
    outer: { ...input.outer.span },
    entries: items.map((item) => {
      if (item.preset) return {
        itemId: item.id,
        mode: "preset" as const,
        settled: { ...input.outer.span },
      };
      const candidate = input.candidates.entries.find((entry) => entry.itemId === item.id)!;
      const window = active.get(item.id)!;
      return {
        itemId: item.id,
        mode: "reveal" as const,
        preferred: { ...candidate.window.span },
        active: { ...window },
        settled: { startFrame: window.endFrameExclusive, endFrameExclusive: input.outer.span.endFrameExclusive },
      };
    }),
  };
  assertRankingSchedule(result);
  return canonicalize(result) as unknown as ColumnSchedule;
}

function assertTriggeredRankingSchedule(value: TriggeredRankingSchedule): void {
  identity(value.id, "RankingSchedule.id");
  assert(["tier-board", "top-three"].includes(value.variant),
    "Triggered RankingSchedule.variant is invalid.");
  frame(value.outer.startFrame, "RankingSchedule.outer.startFrame");
  frame(value.outer.endFrameExclusive, "RankingSchedule.outer.endFrameExclusive");
  assert(value.outer.endFrameExclusive > value.outer.startFrame, "RankingSchedule.outer is empty.");
  frame(value.terminalFrame, "RankingSchedule.terminalFrame");
  assert(value.terminalFrame <= value.outer.endFrameExclusive, "RankingSchedule terminal exceeds outer end.");
  assert(value.entries.length > 0, "RankingSchedule.entries is empty.");
  const ids = new Set<string>();
  let previous = value.outer.startFrame - 1;
  for (const [index, entry] of value.entries.entries()) {
    identity(entry.itemId, `RankingSchedule.entries.${index}.itemId`);
    assert(!ids.has(entry.itemId), `RankingSchedule repeats ${entry.itemId}.`);
    ids.add(entry.itemId);
    frame(entry.triggerFrame, `RankingSchedule.entries.${index}.triggerFrame`);
    assert(entry.triggerFrame > previous, "RankingSchedule trigger frames are not strictly increasing.");
    previous = entry.triggerFrame;
    assert(entry.stage.startFrame === entry.triggerFrame
      && entry.stage.endFrameExclusive === (value.entries[index + 1]?.triggerFrame ?? value.terminalFrame),
    `RankingSchedule.entries.${index}.stage is inconsistent.`);
    assert(entry.cumulative.startFrame === entry.triggerFrame
      && entry.cumulative.endFrameExclusive === value.outer.endFrameExclusive,
    `RankingSchedule.entries.${index}.cumulative is inconsistent.`);
    assert(entry.settled.startFrame === entry.stage.endFrameExclusive
      && entry.settled.endFrameExclusive === value.outer.endFrameExclusive,
    `RankingSchedule.entries.${index}.settled is inconsistent.`);
  }
  assert(value.entries[0]!.triggerFrame >= value.outer.startFrame, "RankingSchedule starts before its outer window.");
  assert(value.entries.at(-1)!.stage.endFrameExclusive === value.terminalFrame,
    "RankingSchedule final stage does not end at terminal.");
}

function assertColumnSchedule(value: ColumnSchedule): void {
  identity(value.id, "ColumnSchedule.id");
  frame(value.outer.startFrame, "ColumnSchedule.outer.startFrame");
  frame(value.outer.endFrameExclusive, "ColumnSchedule.outer.endFrameExclusive");
  assert(value.outer.endFrameExclusive > value.outer.startFrame, "ColumnSchedule.outer is empty.");
  assert(value.entries.length > 0, "ColumnSchedule.entries is empty.");
  const ids = new Set<string>();
  const active: Array<{ readonly itemId: string; readonly startFrame: number; readonly endFrameExclusive: number }> = [];
  for (const [index, entry] of value.entries.entries()) {
    identity(entry.itemId, `ColumnSchedule.entries.${index}.itemId`);
    assert(!ids.has(entry.itemId), `ColumnSchedule repeats ${entry.itemId}.`);
    ids.add(entry.itemId);
    if (entry.mode === "preset") {
      assert(entry.settled.startFrame === value.outer.startFrame
        && entry.settled.endFrameExclusive === value.outer.endFrameExclusive,
      `ColumnSchedule preset ${entry.itemId} does not occupy the outer window.`);
      continue;
    }
    frame(entry.preferred.startFrame, `ColumnSchedule.entries.${index}.preferred.startFrame`);
    frame(entry.preferred.endFrameExclusive, `ColumnSchedule.entries.${index}.preferred.endFrameExclusive`);
    assert(entry.preferred.endFrameExclusive > entry.preferred.startFrame,
      `ColumnSchedule.entries.${index}.preferred is empty.`);
    frame(entry.active.startFrame, `ColumnSchedule.entries.${index}.active.startFrame`);
    frame(entry.active.endFrameExclusive, `ColumnSchedule.entries.${index}.active.endFrameExclusive`);
    assert(entry.active.startFrame >= value.outer.startFrame
      && entry.active.endFrameExclusive <= value.outer.endFrameExclusive
      && entry.active.endFrameExclusive > entry.active.startFrame,
    `ColumnSchedule.entries.${index}.active is outside the outer window.`);
    assert(entry.settled.startFrame === entry.active.endFrameExclusive
      && entry.settled.endFrameExclusive === value.outer.endFrameExclusive,
    `ColumnSchedule.entries.${index}.settled is inconsistent.`);
    active.push({ itemId: entry.itemId, ...entry.active });
  }
  active.sort((left, right) => left.startFrame - right.startFrame
    || left.endFrameExclusive - right.endFrameExclusive || left.itemId.localeCompare(right.itemId));
  for (let index = 1; index < active.length; index += 1) {
    assert(active[index]!.startFrame >= active[index - 1]!.endFrameExclusive,
      `ColumnSchedule active windows ${active[index - 1]!.itemId} and ${active[index]!.itemId} overlap.`);
  }
}

export function assertRankingSchedule(value: RankingSchedule, space?: ProgramSpace): void {
  if (value.variant === "column") assertColumnSchedule(value);
  else assertTriggeredRankingSchedule(value);
  if (space !== undefined) {
    assertProgramSpaceIdentity(space);
    assert(value.outer.endFrameExclusive <= programSpaceFrameCount(space), "RankingSchedule exceeds ProgramSpace.");
  }
}

function emptySet<T extends { readonly items: readonly unknown[] }>(): T {
  return { items: [] } as unknown as T;
}

export const createTierBoardItemSet = (): TierBoardItemSet => emptySet();
export const createColumnItemSet = (): ColumnItemSet => emptySet();
export const createTopThreeItemSet = (): TopThreeItemSet => emptySet();

function ensureNew(items: readonly { readonly id: string }[], id: string): void {
  assert(!items.some((item) => item.id === id), `Ranking Item ${id} is duplicated.`);
}

export function appendTierBoardItem(set: TierBoardItemSet, spec: TierBoardItemSpec, icon: TierBoardItem["icon"]): TierBoardItemSet {
  assert(Array.isArray(set.items), "TierBoardItemSet is invalid.");
  assertRankingItemSpec(spec);
  assertBlobImage(icon, `TierBoardItem.${spec.id}.icon`);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, { ...structuredClone(spec), icon: structuredClone(icon) }] }) as unknown as TierBoardItemSet;
}

export function appendColumnItem(set: ColumnItemSet, spec: ColumnItemSpec, icon?: ColumnItem["icon"]): ColumnItemSet {
  assert(Array.isArray(set.items), "ColumnItemSet is invalid.");
  assertRankingItemSpec(spec);
  if (icon !== undefined) assertBlobImage(icon, `ColumnItem.${spec.id}.icon`);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, { ...structuredClone(spec), ...(icon === undefined ? {} : { icon: structuredClone(icon) }) }] }) as unknown as ColumnItemSet;
}

export function appendTopThreeItem(set: TopThreeItemSet, spec: TopThreeItemSpec, icon?: TopThreeItem["icon"]): TopThreeItemSet {
  assert(Array.isArray(set.items), "TopThreeItemSet is invalid.");
  assertRankingItemSpec(spec);
  if (icon !== undefined) assertBlobImage(icon, `TopThreeItem.${spec.id}.icon`);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, { ...structuredClone(spec), ...(icon === undefined ? {} : { icon: structuredClone(icon) }) }] }) as unknown as TopThreeItemSet;
}

function idsEqual(schedule: TriggeredRankingSchedule, items: readonly { readonly id: string }[]): void {
  assert(schedule.entries.length === items.length, "Ranking Program item count differs from its Schedule.");
  for (const [index, item] of items.entries()) {
    assert(schedule.entries[index]?.itemId === item.id, "Ranking Program item order differs from its Schedule.");
  }
}

function orderForSchedule<T extends { readonly id: string }>(
  schedule: TriggeredRankingSchedule,
  items: readonly T[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  assert(byId.size === items.length && schedule.entries.length === items.length,
    "Ranking Program item count differs from its Schedule.");
  return schedule.entries.map((entry) => {
    const item = byId.get(entry.itemId);
    assert(item !== undefined, `Ranking Schedule references unknown Item ${entry.itemId}.`);
    return item;
  });
}

function columnIdsEqual(schedule: ColumnSchedule, items: readonly { readonly id: string }[]): void {
  assert(schedule.entries.length === items.length, "Column Program item count differs from its Schedule.");
  const scheduled = new Set(schedule.entries.map((entry) => entry.itemId));
  assert(scheduled.size === items.length && items.every((item) => scheduled.has(item.id)),
    "Column Program Items differ from its Schedule.");
}

export function fitRankingStageMotion(
  durationFrames: number,
  preferredAppearFrames: number,
  preferredMoveFrames: number,
  needsMove: boolean,
): { readonly appearFrames: number; readonly moveFrames: number } {
  assert(Number.isSafeInteger(durationFrames) && durationFrames > 0, "Ranking stage duration is invalid.");
  if (!needsMove) return { appearFrames: Math.min(preferredAppearFrames, durationFrames), moveFrames: 0 };
  const moveFrames = Math.min(preferredMoveFrames, durationFrames);
  return { appearFrames: Math.min(preferredAppearFrames, durationFrames - moveFrames), moveFrames };
}

export function fitColumnRevealMotion(
  durationFrames: number,
  preferredAppearFrames: number,
  preferredMoveFrames: number,
): { readonly mode: "direct" } | { readonly mode: "stage"; readonly appearFrames: number; readonly moveFrames: number } {
  assert(Number.isSafeInteger(durationFrames) && durationFrames > 0, "Column reveal duration is invalid.");
  assert(Number.isSafeInteger(preferredAppearFrames) && preferredAppearFrames > 0, "Column appear duration is invalid.");
  assert(Number.isSafeInteger(preferredMoveFrames) && preferredMoveFrames > 0, "Column move duration is invalid.");
  if (durationFrames === 1) return { mode: "direct" };
  const preferredTotal = preferredAppearFrames + preferredMoveFrames;
  if (durationFrames >= preferredTotal) {
    return { mode: "stage", appearFrames: preferredAppearFrames, moveFrames: preferredMoveFrames };
  }
  const appearFrames = Math.min(durationFrames - 1,
    Math.max(1, Math.round(durationFrames * preferredAppearFrames / preferredTotal)));
  return { mode: "stage", appearFrames, moveFrames: durationFrames - appearFrames };
}

export function buildTierBoardProgram(header: RankingHeader, frameValue: import("@hypit/spatial").SpatialFrame, schedule: RankingSchedule, style: TierBoardStyle, set: TierBoardItemSet): TierBoardProgram {
  assert(header.variant === "tier-board" && schedule.variant === "tier-board", "TierBoard variant is inconsistent.");
  assertSpatialFrame(frameValue);
  assertTierBoardStyle(style);
  const items = orderForSchedule(schedule, set.items).map((item) => structuredClone(item));
  const rows = new Set(style.rows.map((row) => row.id));
  for (const item of items) assert(rows.has(item.tier), `TierBoard Item ${item.id} references unknown tier ${item.tier}.`);
  const result: TierBoardProgram = { id: header.id, frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items };
  assertTierBoardProgram(result);
  return canonicalize(result) as unknown as TierBoardProgram;
}

export function buildColumnProgram(header: RankingHeader, canvasValue: CanvasSpace, frameValue: import("@hypit/spatial").SpatialFrame, schedule: RankingSchedule, style: ColumnStyle, set: ColumnItemSet): ColumnProgram {
  assert(header.variant === "column" && schedule.variant === "column", "Column variant is inconsistent.");
  assertCanvasSpace(canvasValue);
  assertSpatialFrame(frameValue);
  assertColumnStyle(style);
  columnIdsEqual(schedule, set.items);
  const items = [...set.items].map((item) => structuredClone(item)).sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));
  const result: ColumnProgram = { id: header.id, canvas: structuredClone(canvasValue), frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items };
  assertColumnProgram(result);
  return canonicalize(result) as unknown as ColumnProgram;
}

export function buildTopThreeProgram(header: RankingHeader, frameValue: import("@hypit/spatial").SpatialFrame, schedule: RankingSchedule, style: TopThreeStyle, set: TopThreeItemSet): TopThreeProgram {
  assert(header.variant === "top-three" && schedule.variant === "top-three", "TopThree variant is inconsistent.");
  assertSpatialFrame(frameValue);
  assertTopThreeStyle(style);
  assert(set.items.length <= 3, "TopThree accepts at most three Items.");
  const items = orderForSchedule(schedule, set.items).map((item) => structuredClone(item));
  const result: TopThreeProgram = { id: header.id, frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items };
  assertTopThreeProgram(result);
  return canonicalize(result) as unknown as TopThreeProgram;
}

export function assertTierBoardProgram(value: TierBoardProgram): void {
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "tier-board", "TierBoardProgram Schedule variant is invalid.");
  assertSpatialFrame(value.frame);
  assertTierBoardStyle(value.style);
  idsEqual(value.schedule, value.items);
  value.items.forEach((item) => { assertRankingItemSpec(item); assertBlobImage(item.icon, `TierBoardItem.${item.id}.icon`); });
}

export function assertColumnProgram(value: ColumnProgram): void {
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "column", "ColumnProgram Schedule variant is invalid.");
  assertCanvasSpace(value.canvas);
  assertSpatialFrame(value.frame);
  assertColumnStyle(value.style);
  columnIdsEqual(value.schedule, value.items);
  value.items.forEach((item) => { assertRankingItemSpec(item); if (item.icon !== undefined) assertBlobImage(item.icon, `ColumnItem.${item.id}.icon`); });
  for (let index = 1; index < value.items.length; index += 1) {
    assert(value.items[index - 1]!.rank < value.items[index]!.rank, "ColumnProgram Items are not ordered by unique rank.");
  }
}

export function assertTopThreeProgram(value: TopThreeProgram): void {
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "top-three", "TopThreeProgram Schedule variant is invalid.");
  assertSpatialFrame(value.frame);
  assertTopThreeStyle(value.style);
  assert(value.items.length <= 3, "TopThreeProgram exceeds three Items.");
  idsEqual(value.schedule, value.items);
  value.items.forEach((item) => { assertRankingItemSpec(item); if (item.icon !== undefined) assertBlobImage(item.icon, `TopThreeItem.${item.id}.icon`); });
}

function event(id: string, itemId: string, kind: "appear" | "move", eventFrame: number): RankingSoundEvent {
  return { id: `${id}:${itemId}:${kind}`, itemId, kind, frame: eventFrame };
}

function sealEvents(id: string, variant: RankingVariant, events: readonly RankingSoundEvent[]): RankingSoundEventPlan {
  const value: RankingSoundEventPlan = { id, variant, events };
  assertRankingSoundEventPlan(value);
  return canonicalize(value) as unknown as RankingSoundEventPlan;
}

export function buildTierBoardSoundEvents(schedule: RankingSchedule, style: TierBoardStyle, specs: RankingItemSpecSet): RankingSoundEventPlan {
  assert(schedule.variant === "tier-board" && specs.variant === "tier-board", "TierBoard event inputs disagree.");
  assertTierBoardStyle(style);
  const ordered = orderForSchedule(schedule, specs.items);
  const events = schedule.entries.flatMap((entry, index) => {
    const spec = ordered[index] as TierBoardItemSpec;
    const duration = entry.stage.endFrameExclusive - entry.triggerFrame;
    const fitted = fitRankingStageMotion(duration, style.motion.appearFrames, style.motion.moveFrames, spec.entry === "stage");
    return [event(schedule.id, entry.itemId, "appear", entry.triggerFrame),
      ...(spec.entry === "stage" ? [event(schedule.id, entry.itemId, "move", entry.stage.endFrameExclusive - fitted.moveFrames)] : [])];
  });
  return sealEvents(schedule.id, schedule.variant, events);
}

export function buildColumnSoundEvents(schedule: RankingSchedule, style: ColumnStyle, specs: RankingItemSpecSet): RankingSoundEventPlan {
  assert(schedule.variant === "column" && specs.variant === "column", "Column event inputs disagree.");
  assertColumnStyle(style);
  columnIdsEqual(schedule, specs.items);
  const events = schedule.entries.flatMap((entry) => {
    if (entry.mode === "preset") return [];
    const duration = entry.active.endFrameExclusive - entry.active.startFrame;
    const fitted = fitColumnRevealMotion(duration, style.motion.appearFrames, style.motion.moveFrames);
    return [event(schedule.id, entry.itemId, "appear", entry.active.startFrame),
      ...(fitted.mode === "direct" ? []
        : [event(schedule.id, entry.itemId, "move", entry.active.endFrameExclusive - fitted.moveFrames)])];
  }).sort((left, right) => left.frame - right.frame || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  return sealEvents(schedule.id, schedule.variant, events);
}

export function buildTopThreeSoundEvents(schedule: RankingSchedule, style: TopThreeStyle, specs: RankingItemSpecSet): RankingSoundEventPlan {
  assert(schedule.variant === "top-three" && specs.variant === "top-three", "TopThree event inputs disagree.");
  assertTopThreeStyle(style);
  orderForSchedule(schedule, specs.items);
  return sealEvents(schedule.id, schedule.variant,
    schedule.entries.map((entry) => event(schedule.id, entry.itemId, "appear", entry.triggerFrame)));
}

export function assertRankingSoundEventPlan(value: RankingSoundEventPlan): void {
  identity(value.id, "RankingSoundEventPlan.id");
  assert(["tier-board", "column", "top-three"].includes(value.variant),
    "RankingSoundEventPlan.variant is invalid.");
  const ids = new Set<string>();
  for (const item of value.events) {
    identity(item.id, "RankingSoundEvent.id");
    identity(item.itemId, "RankingSoundEvent.itemId");
    assert(item.kind === "appear" || item.kind === "move", `RankingSoundEvent ${item.id} kind is invalid.`);
    frame(item.frame, `RankingSoundEvent ${item.id}.frame`);
    assert(!ids.has(item.id), `RankingSoundEventPlan repeats ${item.id}.`);
    ids.add(item.id);
  }
}

export function createRankingSoundSet(): RankingSoundSet {
  return {};
}

export function appendRankingSound(set: RankingSoundSet, kind: "appear" | "move", media: SynchronizedMedia): RankingSoundSet {
  verifySynchronizedMedia(media);
  assert(media.audio !== undefined, `Ranking ${kind} sound has no normalized audio.`);
  assert(set[kind] === undefined, `Ranking ${kind} sound is already set.`);
  return canonicalize({ ...set, [kind]: structuredClone(media) }) as unknown as RankingSoundSet;
}
