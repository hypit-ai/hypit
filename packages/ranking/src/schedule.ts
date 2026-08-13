import {
  assertFontArtifactRef,
  verifySynchronizedMedia,
} from "@narratage/media";
import type { SynchronizedMedia } from "@narratage/media";
import type {
  NarrativeMomentRef,
  NarrativeSelectionRef,
} from "@narratage/narrative";
import {
  assertProgramSpaceIdentity,
  programSpaceFrameCount,
} from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import { verifyText } from "@narratage/text";
import type { Text } from "@narratage/text";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { assertSpatialFrame } from "@narratage/spatial";
import {
  locateMomentOccurrences,
  locateSelectionOccurrences,
  resolveTriggeredSchedule,
} from "@narratage/temporal";

import type {
  ColumnItem,
  ColumnItemSet,
  ColumnItemSpec,
  ColumnProgram,
  ColumnStyle,
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
  TypewriterItem,
  TypewriterItemSet,
  TypewriterItemSpec,
  TypewriterListProgram,
  TypewriterListStyle,
} from "./types.js";

export const rankingImplementationDigests = {
  createSpecs: digestOf("@narratage/ranking/create-item-specs@1"),
  appendSpec: digestOf("@narratage/ranking/append-item-spec@1"),
  schedule: digestOf("@narratage/ranking/build-schedule@1"),
  createTierItems: digestOf("@narratage/ranking/create-tier-items@1"),
  appendTierItem: digestOf("@narratage/ranking/append-tier-item@1"),
  createColumnItems: digestOf("@narratage/ranking/create-column-items@1"),
  appendColumnItem: digestOf("@narratage/ranking/append-column-item@1"),
  appendColumnIconItem: digestOf("@narratage/ranking/append-column-icon-item@1"),
  createTopThreeItems: digestOf("@narratage/ranking/create-top-three-items@1"),
  appendTopThreeItem: digestOf("@narratage/ranking/append-top-three-item@1"),
  appendTopThreeIconItem: digestOf("@narratage/ranking/append-top-three-icon-item@1"),
  createTypewriterItems: digestOf("@narratage/ranking/create-typewriter-items@1"),
  appendTypewriterItem: digestOf("@narratage/ranking/append-typewriter-item@1"),
  tierProgram: digestOf("@narratage/ranking/build-tier-board-program@1"),
  columnProgram: digestOf("@narratage/ranking/build-column-program@1"),
  topThreeProgram: digestOf("@narratage/ranking/build-top-three-program@1"),
  typewriterProgram: digestOf("@narratage/ranking/build-typewriter-list-program@1"),
  tierEvents: digestOf("@narratage/ranking/build-tier-board-sound-events@1"),
  columnEvents: digestOf("@narratage/ranking/build-column-sound-events@1"),
  topThreeEvents: digestOf("@narratage/ranking/build-top-three-sound-events@1"),
  typewriterEvents: digestOf("@narratage/ranking/build-typewriter-list-sound-events@1"),
  createSounds: digestOf("@narratage/ranking/create-sounds@1"),
  appendAppearSound: digestOf("@narratage/ranking/append-appear-sound@1"),
  appendMoveSound: digestOf("@narratage/ranking/append-move-sound@1"),
  renderAudio: digestOf("@narratage/ranking/render-audio@1"),
  renderTier: digestOf("@narratage/ranking/render-tier-board@1"),
  renderColumn: digestOf("@narratage/ranking/render-column@1"),
  renderTopThree: digestOf("@narratage/ranking/render-top-three@1"),
  renderTypewriter: digestOf("@narratage/ranking/render-typewriter-list@1"),
  materializeTextItem: digestOf("@narratage/ranking/materialize-text-item@1"),
} as const;

export const rankingValidatorDigests = {
  schedule: digestOf("@narratage/ranking/validate-schedule@1"),
  tierProgram: digestOf("@narratage/ranking/validate-tier-board-program@1"),
  columnProgram: digestOf("@narratage/ranking/validate-column-program@1"),
  topThreeProgram: digestOf("@narratage/ranking/validate-top-three-program@1"),
  typewriterProgram: digestOf("@narratage/ranking/validate-typewriter-list-program@1"),
  events: digestOf("@narratage/ranking/validate-sound-events@1"),
} as const;

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
  assert(value.contract === "svml.ranking-header@1", "Unsupported RankingHeader contract.");
  identity(value.id, "RankingHeader.id");
  assert(["tier-board", "column", "top-three", "typewriter-list"].includes(value.variant),
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
  assert(value.contract === "svml.ranking-sound-style@1", "Unsupported RankingSoundStyle contract.");
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
  assert(value.contract === "svml.tier-board-style@1", "Unsupported TierBoardStyle contract.");
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
  assert(value.contract === "svml.column-style@1", "Unsupported ColumnStyle contract.");
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
  assert(value.contract === "svml.top-three-style@1", "Unsupported TopThreeStyle contract.");
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

export function assertTypewriterListStyle(value: TypewriterListStyle): void {
  assert(value.contract === "svml.typewriter-list-style@1", "Unsupported TypewriterListStyle contract.");
  assertRankingBoardPaint(value.paper, "TypewriterListStyle.paper");
  assertRankingTextStyle(value.title, "TypewriterListStyle.title");
  assertRankingTextStyle(value.item, "TypewriterListStyle.item");
  color(value.emphasisColor, "TypewriterListStyle.emphasisColor");
  color(value.winnerColor, "TypewriterListStyle.winnerColor");
  nonNegative(value.paddingPx, "TypewriterListStyle.paddingPx");
  nonNegative(value.rowGapPx, "TypewriterListStyle.rowGapPx");
  nonNegative(value.titleGapPx, "TypewriterListStyle.titleGapPx");
  finite(value.rotationDeg, "TypewriterListStyle.rotationDeg");
  integer(value.framesPerGrapheme, "TypewriterListStyle.framesPerGrapheme", 1);
  integer(value.winnerFrames, "TypewriterListStyle.winnerFrames", 1);
  stacking(value.boardStackingOrder, "TypewriterListStyle.boardStackingOrder");
  stacking(value.itemStackingOrder, "TypewriterListStyle.itemStackingOrder");
}

export function assertRankingItemSpec(value: RankingItemSpec): void {
  identity(value.id, "RankingItemSpec.id");
  if (value.variant === "tier-board") {
    assert(value.contract === "svml.tier-board-item-spec@1", "TierBoardItemSpec contract is invalid.");
    identity(value.tier, `TierBoardItemSpec.${value.id}.tier`);
    assert(value.entry === "direct" || value.entry === "stage", `TierBoardItemSpec.${value.id}.entry is invalid.`);
  } else if (value.variant === "column") {
    assert(value.contract === "svml.column-item-spec@1", "ColumnItemSpec contract is invalid.");
    assert(value.label.trim().length > 0, `ColumnItemSpec.${value.id}.label is empty.`);
  } else if (value.variant === "top-three") {
    assert(value.contract === "svml.top-three-item-spec@1", "TopThreeItemSpec contract is invalid.");
    assert(value.label.trim().length > 0, `TopThreeItemSpec.${value.id}.label is empty.`);
  } else {
    assert(value.variant === "typewriter-list" && value.contract === "svml.typewriter-item-spec@1",
      "TypewriterItemSpec contract is invalid.");
    assert(value.text.length > 0, `TypewriterItemSpec.${value.id}.text is empty.`);
    assert(typeof value.winner === "boolean", `TypewriterItemSpec.${value.id}.winner is invalid.`);
    if (value.emphasis !== undefined) {
      integer(value.emphasis.start, `TypewriterItemSpec.${value.id}.emphasis.start`);
      integer(value.emphasis.endExclusive, `TypewriterItemSpec.${value.id}.emphasis.endExclusive`, 1);
      assert(value.emphasis.endExclusive > value.emphasis.start,
        `TypewriterItemSpec.${value.id}.emphasis is empty.`);
    }
  }
  if (value.stackingOrder !== undefined) stacking(value.stackingOrder, `RankingItemSpec.${value.id}.stackingOrder`);
}

export function assertRankingTextItemShell(value: RankingTextItemShell): void {
  identity(value.id, "RankingTextItemShell.id");
  if (value.variant === "column") {
    assert(value.contract === "svml.column-text-item-shell@1", "Column Text Item Shell contract is invalid.");
  } else if (value.variant === "top-three") {
    assert(value.contract === "svml.top-three-text-item-shell@1", "TopThree Text Item Shell contract is invalid.");
  } else {
    assert(value.variant === "typewriter-list" && value.contract === "svml.typewriter-text-item-shell@1",
      "Typewriter Text Item Shell contract is invalid.");
    assert(typeof value.winner === "boolean", `RankingTextItemShell.${value.id}.winner is invalid.`);
    if (value.emphasis !== undefined) {
      integer(value.emphasis.start, `RankingTextItemShell.${value.id}.emphasis.start`);
      integer(value.emphasis.endExclusive, `RankingTextItemShell.${value.id}.emphasis.endExclusive`, 1);
      assert(value.emphasis.endExclusive > value.emphasis.start,
        `RankingTextItemShell.${value.id}.emphasis is empty.`);
    }
  }
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
  let result: RankingItemSpec;
  if (shell.variant === "column") {
    const { contract: _contract, ...common } = shell;
    result = { ...common, contract: "svml.column-item-spec@1", label: content.value };
  } else if (shell.variant === "top-three") {
    const { contract: _contract, ...common } = shell;
    result = { ...common, contract: "svml.top-three-item-spec@1", label: content.value };
  } else {
    const { contract: _contract, ...common } = shell;
    result = { ...common, contract: "svml.typewriter-item-spec@1", text: content.value };
  }
  assertRankingItemSpec(result);
  return canonicalize(result) as unknown as RankingItemSpec;
}

export function createRankingItemSpecSet(header: RankingHeader): RankingItemSpecSet {
  assertRankingHeader(header);
  return { contract: "svml.ranking-item-spec-set@1", variant: header.variant, items: [] };
}

export function assertRankingItemSpecSet(value: RankingItemSpecSet): void {
  assert(value.contract === "svml.ranking-item-spec-set@1", "Unsupported RankingItemSpecSet contract.");
  assert(["tier-board", "column", "top-three", "typewriter-list"].includes(value.variant),
    "RankingItemSpecSet.variant is invalid.");
  const ids = new Set<string>();
  for (const item of value.items) {
    assertRankingItemSpec(item);
    assert(item.variant === value.variant, "RankingItemSpecSet mixes component variants.");
    assert(!ids.has(item.id), `RankingItemSpecSet repeats ${item.id}.`);
    ids.add(item.id);
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

export function buildRankingSchedule(input: {
  readonly header: RankingHeader;
  readonly items: RankingItemSpecSet;
  readonly map: CompleteSemanticMap;
  readonly space: ProgramSpace;
  readonly outer: NarrativeSelectionRef;
  readonly triggers: NarrativeMomentRef;
  readonly terminal: NarrativeMomentRef;
}): RankingSchedule {
  assertRankingHeader(input.header);
  assertRankingItemSpecSet(input.items);
  assert(input.items.variant === input.header.variant, "Ranking schedule variant disagrees with its item set.");
  assert(input.items.items.length > 0, "Ranking requires at least one Item.");
  assertProgramSpaceIdentity(input.space);
  const outer = locateSelectionOccurrences(input.map, input.outer, input.space);
  assert(outer.length === 1, `Ranking outer Selection requires exactly one occurrence; received ${outer.length}.`);
  const terminal = locateMomentOccurrences(input.map, input.terminal, input.space);
  assert(terminal.length === 1, `Ranking terminal Moment requires exactly one occurrence; received ${terminal.length}.`);
  const triggers = locateMomentOccurrences(input.map, input.triggers, input.space);
  assert(triggers.length > 0, "Ranking trigger Moment requires at least one occurrence.");
  assert(triggers.length === input.items.items.length,
    `Ranking trigger/item cardinality differs: ${triggers.length} triggers for ${input.items.items.length} Items.`);
  const resolved = resolveTriggeredSchedule({
    outer: { startFrame: outer[0]!.start.frame, endFrameExclusive: outer[0]!.end.frame },
    terminalFrame: terminal[0]!.cue.frame,
    triggers: triggers.map((item) => ({ id: item.id, frame: item.cue.frame })),
  });
  const entries = input.items.items.map((item, index) => {
    const exclusive = resolved.exclusive[index]!;
    const cumulative = resolved.cumulative[index]!;
    return {
      itemId: item.id,
      triggerFrame: exclusive.startFrame,
      stage: { ...exclusive },
      cumulative: { ...cumulative },
      settled: { startFrame: exclusive.endFrameExclusive, endFrameExclusive: resolved.outer.endFrameExclusive },
    };
  });
  const result: RankingSchedule = {
    contract: "svml.ranking-schedule@1",
    id: input.header.id,
    variant: input.header.variant,
    outer: { ...resolved.outer },
    terminalFrame: resolved.terminalFrame,
    entries,
  };
  assertRankingSchedule(result, input.space);
  return canonicalize(result) as unknown as RankingSchedule;
}

export function assertRankingSchedule(value: RankingSchedule, space?: ProgramSpace): void {
  assert(value.contract === "svml.ranking-schedule@1", "Unsupported RankingSchedule contract.");
  identity(value.id, "RankingSchedule.id");
  assert(["tier-board", "column", "top-three", "typewriter-list"].includes(value.variant),
    "RankingSchedule.variant is invalid.");
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
  if (space !== undefined) {
    assertProgramSpaceIdentity(space);
    assert(value.outer.endFrameExclusive <= programSpaceFrameCount(space), "RankingSchedule exceeds ProgramSpace.");
  }
}

function emptySet<T extends { readonly contract: string; readonly items: readonly unknown[] }>(contract: T["contract"]): T {
  return { contract, items: [] } as unknown as T;
}

export const createTierBoardItemSet = (): TierBoardItemSet => emptySet("svml.tier-board-item-set@1");
export const createColumnItemSet = (): ColumnItemSet => emptySet("svml.column-item-set@1");
export const createTopThreeItemSet = (): TopThreeItemSet => emptySet("svml.top-three-item-set@1");
export const createTypewriterItemSet = (): TypewriterItemSet => emptySet("svml.typewriter-item-set@1");

function ensureNew(items: readonly { readonly id: string }[], id: string): void {
  assert(!items.some((item) => item.id === id), `Ranking Item ${id} is duplicated.`);
}

export function appendTierBoardItem(set: TierBoardItemSet, spec: TierBoardItemSpec, icon: TierBoardItem["icon"]): TierBoardItemSet {
  assert(set.contract === "svml.tier-board-item-set@1", "TierBoardItemSet is invalid.");
  assertRankingItemSpec(spec);
  assertBlobImage(icon, `TierBoardItem.${spec.id}.icon`);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, { ...structuredClone(spec), icon: structuredClone(icon) }] }) as unknown as TierBoardItemSet;
}

export function appendColumnItem(set: ColumnItemSet, spec: ColumnItemSpec, icon?: ColumnItem["icon"]): ColumnItemSet {
  assert(set.contract === "svml.column-item-set@1", "ColumnItemSet is invalid.");
  assertRankingItemSpec(spec);
  if (icon !== undefined) assertBlobImage(icon, `ColumnItem.${spec.id}.icon`);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, { ...structuredClone(spec), ...(icon === undefined ? {} : { icon: structuredClone(icon) }) }] }) as unknown as ColumnItemSet;
}

export function appendTopThreeItem(set: TopThreeItemSet, spec: TopThreeItemSpec, icon?: TopThreeItem["icon"]): TopThreeItemSet {
  assert(set.contract === "svml.top-three-item-set@1", "TopThreeItemSet is invalid.");
  assertRankingItemSpec(spec);
  if (icon !== undefined) assertBlobImage(icon, `TopThreeItem.${spec.id}.icon`);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, { ...structuredClone(spec), ...(icon === undefined ? {} : { icon: structuredClone(icon) }) }] }) as unknown as TopThreeItemSet;
}

export function appendTypewriterItem(set: TypewriterItemSet, spec: TypewriterItemSpec): TypewriterItemSet {
  assert(set.contract === "svml.typewriter-item-set@1", "TypewriterItemSet is invalid.");
  assertRankingItemSpec(spec);
  ensureNew(set.items, spec.id);
  return canonicalize({ ...set, items: [...set.items, structuredClone(spec)] }) as unknown as TypewriterItemSet;
}

function idsEqual(schedule: RankingSchedule, items: readonly { readonly id: string }[]): void {
  assert(schedule.entries.length === items.length, "Ranking Program item count differs from its Schedule.");
  for (const [index, item] of items.entries()) {
    assert(schedule.entries[index]?.itemId === item.id, "Ranking Program item order differs from its Schedule.");
  }
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

export function fitTypewriterStage(
  durationFrames: number,
  graphemeCount: number,
  preferredFramesPerGrapheme: number,
  preferredWinnerFrames: number,
): { readonly typingFrames: number; readonly winnerFrames: number } {
  assert(Number.isSafeInteger(durationFrames) && durationFrames > 0, "Typewriter stage duration is invalid.");
  const winnerFrames = Math.min(preferredWinnerFrames, durationFrames);
  return {
    typingFrames: Math.min(graphemeCount * preferredFramesPerGrapheme, durationFrames - winnerFrames),
    winnerFrames,
  };
}

export function buildTierBoardProgram(header: RankingHeader, frameValue: import("@narratage/spatial").SpatialFrame, schedule: RankingSchedule, style: TierBoardStyle, set: TierBoardItemSet): TierBoardProgram {
  assert(header.variant === "tier-board" && schedule.variant === "tier-board", "TierBoard variant is inconsistent.");
  assertSpatialFrame(frameValue);
  assertTierBoardStyle(style);
  idsEqual(schedule, set.items);
  const rows = new Set(style.rows.map((row) => row.id));
  for (const item of set.items) assert(rows.has(item.tier), `TierBoard Item ${item.id} references unknown tier ${item.tier}.`);
  const result: TierBoardProgram = { contract: "svml.tier-board-program@1", id: header.id, frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items: structuredClone(set.items) };
  assertTierBoardProgram(result);
  return canonicalize(result) as unknown as TierBoardProgram;
}

export function buildColumnProgram(header: RankingHeader, frameValue: import("@narratage/spatial").SpatialFrame, schedule: RankingSchedule, style: ColumnStyle, set: ColumnItemSet): ColumnProgram {
  assert(header.variant === "column" && schedule.variant === "column", "Column variant is inconsistent.");
  assertSpatialFrame(frameValue);
  assertColumnStyle(style);
  idsEqual(schedule, set.items);
  const result: ColumnProgram = { contract: "svml.column-program@1", id: header.id, frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items: structuredClone(set.items) };
  assertColumnProgram(result);
  return canonicalize(result) as unknown as ColumnProgram;
}

export function buildTopThreeProgram(header: RankingHeader, frameValue: import("@narratage/spatial").SpatialFrame, schedule: RankingSchedule, style: TopThreeStyle, set: TopThreeItemSet): TopThreeProgram {
  assert(header.variant === "top-three" && schedule.variant === "top-three", "TopThree variant is inconsistent.");
  assertSpatialFrame(frameValue);
  assertTopThreeStyle(style);
  idsEqual(schedule, set.items);
  assert(set.items.length <= 3, "TopThree accepts at most three Items.");
  const result: TopThreeProgram = { contract: "svml.top-three-program@1", id: header.id, frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items: structuredClone(set.items) };
  assertTopThreeProgram(result);
  return canonicalize(result) as unknown as TopThreeProgram;
}

export function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((value) => value.segment);
}

export function buildTypewriterListProgram(header: RankingHeader, title: string, frameValue: import("@narratage/spatial").SpatialFrame, schedule: RankingSchedule, style: TypewriterListStyle, set: TypewriterItemSet): TypewriterListProgram {
  assert(header.variant === "typewriter-list" && schedule.variant === "typewriter-list", "TypewriterList variant is inconsistent.");
  assert(title.trim().length > 0, "TypewriterList title is empty.");
  assertSpatialFrame(frameValue);
  assertTypewriterListStyle(style);
  idsEqual(schedule, set.items);
  for (const item of set.items) {
    const count = graphemes(item.text).length;
    if (item.emphasis !== undefined) assert(item.emphasis.endExclusive <= count,
      `Typewriter Item ${item.id} emphasis exceeds its grapheme count.`);
  }
  const result: TypewriterListProgram = { contract: "svml.typewriter-list-program@1", id: header.id, title, frame: structuredClone(frameValue), schedule: structuredClone(schedule), style: structuredClone(style), items: structuredClone(set.items) };
  assertTypewriterListProgram(result);
  return canonicalize(result) as unknown as TypewriterListProgram;
}

export function assertTierBoardProgram(value: TierBoardProgram): void {
  assert(value.contract === "svml.tier-board-program@1", "Unsupported TierBoardProgram contract.");
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "tier-board", "TierBoardProgram Schedule variant is invalid.");
  assertSpatialFrame(value.frame);
  assertTierBoardStyle(value.style);
  idsEqual(value.schedule, value.items);
  value.items.forEach((item) => { assertRankingItemSpec(item); assertBlobImage(item.icon, `TierBoardItem.${item.id}.icon`); });
}

export function assertColumnProgram(value: ColumnProgram): void {
  assert(value.contract === "svml.column-program@1", "Unsupported ColumnProgram contract.");
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "column", "ColumnProgram Schedule variant is invalid.");
  assertSpatialFrame(value.frame);
  assertColumnStyle(value.style);
  idsEqual(value.schedule, value.items);
  value.items.forEach((item) => { assertRankingItemSpec(item); if (item.icon !== undefined) assertBlobImage(item.icon, `ColumnItem.${item.id}.icon`); });
}

export function assertTopThreeProgram(value: TopThreeProgram): void {
  assert(value.contract === "svml.top-three-program@1", "Unsupported TopThreeProgram contract.");
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "top-three", "TopThreeProgram Schedule variant is invalid.");
  assertSpatialFrame(value.frame);
  assertTopThreeStyle(value.style);
  assert(value.items.length <= 3, "TopThreeProgram exceeds three Items.");
  idsEqual(value.schedule, value.items);
  value.items.forEach((item) => { assertRankingItemSpec(item); if (item.icon !== undefined) assertBlobImage(item.icon, `TopThreeItem.${item.id}.icon`); });
}

export function assertTypewriterListProgram(value: TypewriterListProgram): void {
  assert(value.contract === "svml.typewriter-list-program@1", "Unsupported TypewriterListProgram contract.");
  assert(value.title.trim().length > 0, "TypewriterListProgram title is empty.");
  assertRankingSchedule(value.schedule);
  assert(value.schedule.variant === "typewriter-list", "TypewriterListProgram Schedule variant is invalid.");
  assertSpatialFrame(value.frame);
  assertTypewriterListStyle(value.style);
  idsEqual(value.schedule, value.items);
  value.items.forEach(assertRankingItemSpec);
}

function event(id: string, itemId: string, kind: "appear" | "move", eventFrame: number): RankingSoundEvent {
  return { id: `${id}:${itemId}:${kind}`, itemId, kind, frame: eventFrame };
}

function sealEvents(id: string, variant: RankingVariant, events: readonly RankingSoundEvent[]): RankingSoundEventPlan {
  const value: RankingSoundEventPlan = { contract: "svml.ranking-sound-event-plan@1", id, variant, events };
  assertRankingSoundEventPlan(value);
  return canonicalize(value) as unknown as RankingSoundEventPlan;
}

export function buildTierBoardSoundEvents(schedule: RankingSchedule, style: TierBoardStyle, specs: RankingItemSpecSet): RankingSoundEventPlan {
  assert(schedule.variant === "tier-board" && specs.variant === "tier-board", "TierBoard event inputs disagree.");
  assertTierBoardStyle(style);
  idsEqual(schedule, specs.items);
  const events = schedule.entries.flatMap((entry, index) => {
    const spec = specs.items[index] as TierBoardItemSpec;
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
  idsEqual(schedule, specs.items);
  return sealEvents(schedule.id, schedule.variant, schedule.entries.flatMap((entry) => {
    const duration = entry.stage.endFrameExclusive - entry.triggerFrame;
    const fitted = fitRankingStageMotion(duration, style.motion.appearFrames, style.motion.moveFrames, true);
    return [event(schedule.id, entry.itemId, "appear", entry.triggerFrame),
      event(schedule.id, entry.itemId, "move", entry.stage.endFrameExclusive - fitted.moveFrames)];
  }));
}

export function buildTopThreeSoundEvents(schedule: RankingSchedule, style: TopThreeStyle, specs: RankingItemSpecSet): RankingSoundEventPlan {
  assert(schedule.variant === "top-three" && specs.variant === "top-three", "TopThree event inputs disagree.");
  assertTopThreeStyle(style);
  idsEqual(schedule, specs.items);
  return sealEvents(schedule.id, schedule.variant,
    schedule.entries.map((entry) => event(schedule.id, entry.itemId, "appear", entry.triggerFrame)));
}

export function buildTypewriterSoundEvents(schedule: RankingSchedule, style: TypewriterListStyle, specs: RankingItemSpecSet): RankingSoundEventPlan {
  assert(schedule.variant === "typewriter-list" && specs.variant === "typewriter-list", "Typewriter event inputs disagree.");
  assertTypewriterListStyle(style);
  idsEqual(schedule, specs.items);
  return sealEvents(schedule.id, schedule.variant, schedule.entries.flatMap((entry, index) => {
    const spec = specs.items[index] as TypewriterItemSpec;
    const duration = entry.stage.endFrameExclusive - entry.triggerFrame;
    const fitted = fitTypewriterStage(duration, graphemes(spec.text).length, style.framesPerGrapheme,
      spec.winner ? style.winnerFrames : 0);
    return [event(schedule.id, entry.itemId, "appear", entry.triggerFrame),
      ...(spec.winner ? [event(schedule.id, entry.itemId, "move", entry.triggerFrame + fitted.typingFrames)] : [])];
  }));
}

export function assertRankingSoundEventPlan(value: RankingSoundEventPlan): void {
  assert(value.contract === "svml.ranking-sound-event-plan@1", "Unsupported RankingSoundEventPlan contract.");
  identity(value.id, "RankingSoundEventPlan.id");
  assert(["tier-board", "column", "top-three", "typewriter-list"].includes(value.variant),
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
  return { contract: "svml.ranking-sound-set@1" };
}

export function appendRankingSound(set: RankingSoundSet, kind: "appear" | "move", media: SynchronizedMedia): RankingSoundSet {
  assert(set.contract === "svml.ranking-sound-set@1", "RankingSoundSet is invalid.");
  verifySynchronizedMedia(media);
  assert(media.audio !== undefined, `Ranking ${kind} sound has no normalized audio.`);
  assert(set[kind] === undefined, `Ranking ${kind} sound is already set.`);
  return canonicalize({ ...set, [kind]: structuredClone(media) }) as unknown as RankingSoundSet;
}
