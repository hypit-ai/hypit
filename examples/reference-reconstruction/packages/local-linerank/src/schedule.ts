import type { SynchronizedMedia } from "@hypit/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { CompleteSemanticMap } from "@hypit/semantic-map";
import { assertSpatialFrame } from "@hypit/spatial";
import { locateMomentOccurrences, locateSelectionOccurrences } from "@hypit/temporal";

import type {
  LinerankHeader,
  LinerankItemSet,
  LinerankItemSpec,
  LinerankItemSpecSet,
  LinerankProgram,
  LinerankSchedule,
  LinerankStyle,
  LinerankTextItemShell,
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

function color(value: string, label: string): void {
  assert(value === "transparent" || /^#[0-9a-f]{3,8}$/iu.test(value), `${label} must be a hexadecimal color or transparent.`);
}

export function assertLinerankTextStyle(value: LinerankStyle["title"], label: string): void {
  assert(value.fonts.length > 0, `${label}.fonts is empty.`);
  positive(value.sizePx, `${label}.sizePx`);
  integer(value.weight, `${label}.weight`, 1);
  assert(value.weight <= 1_000, `${label}.weight exceeds 1000.`);
  color(value.color, `${label}.color`);
  positive(value.lineHeight, `${label}.lineHeight`);
}

export function assertLinerankStyle(value: LinerankStyle): void {
  color(value.paperBackground, "LinerankStyle.paperBackground");
  color(value.ruleColor, "LinerankStyle.ruleColor");
  positive(value.ruleGapPx, "LinerankStyle.ruleGapPx");
  assertLinerankTextStyle(value.title, "LinerankStyle.title");
  assertLinerankTextStyle(value.number, "LinerankStyle.number");
  assertLinerankTextStyle(value.label, "LinerankStyle.label");
  nonNegative(value.topPaddingPx, "LinerankStyle.topPaddingPx");
  nonNegative(value.leftPaddingPx, "LinerankStyle.leftPaddingPx");
  nonNegative(value.rightPaddingPx, "LinerankStyle.rightPaddingPx");
  positive(value.rowHeightPx, "LinerankStyle.rowHeightPx");
  nonNegative(value.rowGapPx, "LinerankStyle.rowGapPx");
  nonNegative(value.numberWidthPx, "LinerankStyle.numberWidthPx");
  integer(value.typeFramesPerChar, "LinerankStyle.typeFramesPerChar", 1);
  color(value.circleColor, "LinerankStyle.circleColor");
  nonNegative(value.circleWidthPx, "LinerankStyle.circleWidthPx");
  integer(value.circleFrames, "LinerankStyle.circleFrames", 1);
  stacking(value.boardStackingOrder, "LinerankStyle.boardStackingOrder");
  stacking(value.rowStackingOrder, "LinerankStyle.rowStackingOrder");
  stacking(value.circleStackingOrder, "LinerankStyle.circleStackingOrder");
}

export function assertLinerankHeader(value: LinerankHeader): void {
  identity(value.id, "LinerankHeader.id");
}

export function sealLinerankHeader(value: LinerankHeader): LinerankHeader {
  assertLinerankHeader(value);
  return canonicalize(value) as unknown as LinerankHeader;
}

export function assertLinerankItemSpec(value: LinerankItemSpec): void {
  identity(value.id, "LinerankItemSpec.id");
  integer(value.rank, `LinerankItemSpec.${value.id}.rank`, 1);
  assert(value.label.trim().length > 0, `LinerankItemSpec.${value.id}.label is empty.`);
}

export function assertLinerankTextItemShell(value: LinerankTextItemShell): void {
  identity(value.id, "LinerankTextItemShell.id");
  integer(value.rank, `LinerankTextItemShell.${value.id}.rank`, 1);
}

export function sealLinerankTextItemShell(value: LinerankTextItemShell): LinerankTextItemShell {
  const result = canonicalize(value) as unknown as LinerankTextItemShell;
  assertLinerankTextItemShell(result);
  return result;
}

export function materializeLinerankTextItem(shell: LinerankTextItemShell, content: import("@hypit/text").Text): LinerankItemSpec {
  assertLinerankTextItemShell(shell);
  if (content.value.trim().length === 0) throw new Error(`Linerank Text Item ${shell.id} content is empty.`);
  const result: LinerankItemSpec = { ...shell, label: content.value.trim() };
  assertLinerankItemSpec(result);
  return canonicalize(result) as unknown as LinerankItemSpec;
}

export function createLinerankItemSpecSet(): LinerankItemSpecSet {
  return { items: [] };
}

export function assertLinerankItemSpecSet(value: LinerankItemSpecSet): void {
  assert(Array.isArray(value.items), "LinerankItemSpecSet is invalid.");
  const ids = new Set<string>();
  const ranks = new Set<number>();
  for (const item of value.items) {
    assertLinerankItemSpec(item);
    assert(!ids.has(item.id), `LinerankItemSpecSet repeats ${item.id}.`);
    ids.add(item.id);
    assert(!ranks.has(item.rank), `LinerankItemSpecSet repeats rank ${item.rank}.`);
    ranks.add(item.rank);
  }
}

export function appendLinerankItemSpec(set: LinerankItemSpecSet, spec: LinerankItemSpec): LinerankItemSpecSet {
  assertLinerankItemSpecSet(set);
  assertLinerankItemSpec(spec);
  assert(!set.items.some((item) => item.id === spec.id), `Linerank Item ${spec.id} is duplicated.`);
  assert(!set.items.some((item) => item.rank === spec.rank), `Linerank Item rank ${spec.rank} is duplicated.`);
  const result: LinerankItemSpecSet = { items: [...set.items, structuredClone(spec)] };
  assertLinerankItemSpecSet(result);
  return canonicalize(result) as unknown as LinerankItemSpecSet;
}

export function buildLinerankSchedule(input: {
  readonly header: LinerankHeader;
  readonly items: LinerankItemSpecSet;
  readonly map: CompleteSemanticMap;
  readonly space: ProgramSpace;
  readonly outer: NarrativeSelectionRef;
  readonly triggers: NarrativeMomentRef;
  readonly terminal: NarrativeMomentRef;
}): LinerankSchedule {
  assertLinerankHeader(input.header);
  assertLinerankItemSpecSet(input.items);
  assert(input.items.items.length > 0, "Linerank requires at least one Item.");
  assertProgramSpaceIdentity(input.space);
  const outer = locateSelectionOccurrences(input.map, input.outer, input.space);
  assert(outer.length === input.items.items.length,
    `Linerank board windows (${outer.length}) must equal Items (${input.items.items.length}).`);
  const terminal = locateMomentOccurrences(input.map, input.terminal, input.space);
  assert(terminal.length === 1, `Linerank terminal Moment requires exactly one occurrence; received ${terminal.length}.`);
  const triggers = locateMomentOccurrences(input.map, input.triggers, input.space);
  assert(triggers.length === input.items.items.length,
    `Linerank trigger/item cardinality differs: ${triggers.length} triggers for ${input.items.items.length} Items.`);
  const windows = outer.map((occurrence) => ({
    startFrame: occurrence.start.frame,
    endFrameExclusive: occurrence.end.frame,
  }));
  for (const [index, window] of windows.entries()) {
    assert(window.endFrameExclusive > window.startFrame, `Linerank window ${index} is empty.`);
    if (index > 0) assert(windows[index - 1]!.endFrameExclusive <= window.startFrame, `Linerank window ${index} overlaps the previous one.`);
  }
  const entries = input.items.items.map((item, index) => {
    const triggerFrame = triggers[index]!.cue.frame;
    assert(Number.isSafeInteger(triggerFrame), `Linerank trigger ${index} is not a frame.`);
    return {
      itemId: item.id,
      rank: item.rank,
      triggerFrame,
    };
  });
  for (let index = 1; index < entries.length; index += 1) {
    assert(entries[index]!.triggerFrame > entries[index - 1]!.triggerFrame,
      "Linerank trigger frames are not strictly increasing.");
  }
  const result: LinerankSchedule = {
    id: input.header.id,
    windows,
    terminalFrame: terminal[0]!.cue.frame,
    entries,
  };
  assertLinerankSchedule(result, input.space);
  return canonicalize(result) as unknown as LinerankSchedule;
}

export function assertLinerankSchedule(value: LinerankSchedule, space?: ProgramSpace): void {
  identity(value.id, "LinerankSchedule.id");
  assert(value.windows.length >= 1, "LinerankSchedule.windows is empty.");
  frame(value.terminalFrame, "LinerankSchedule.terminalFrame");
  assert(value.entries.length >= 1, "LinerankSchedule.entries is empty.");
  const ids = new Set<string>();
  for (const [index, window] of value.windows.entries()) {
    frame(window.startFrame, `LinerankSchedule.windows.${index}.startFrame`);
    frame(window.endFrameExclusive, `LinerankSchedule.windows.${index}.endFrameExclusive`);
    assert(window.endFrameExclusive > window.startFrame, `LinerankSchedule.windows.${index} is empty.`);
    if (index > 0) assert(value.windows[index - 1]!.endFrameExclusive <= window.startFrame,
      `LinerankSchedule.windows.${index} overlaps the previous one.`);
  }
  const lastWindow = value.windows.at(-1)!;
  // A `done` moment may sit at the very end of the board's last window — the reference marks the
  // list complete exactly as it finishes — so the terminal frame may coincide with the exclusive
  // end. The circle renderer clamps to the window, so this is safe.
  assert(value.terminalFrame >= lastWindow.startFrame && value.terminalFrame <= lastWindow.endFrameExclusive,
    `LinerankSchedule.terminalFrame ${value.terminalFrame} is outside the final window [${lastWindow.startFrame}, ${lastWindow.endFrameExclusive}].`);
  for (const [index, entry] of value.entries.entries()) {
    identity(entry.itemId, `LinerankSchedule.entries.${index}.itemId`);
    assert(!ids.has(entry.itemId), `LinerankSchedule repeats ${entry.itemId}.`);
    ids.add(entry.itemId);
    integer(entry.rank, `LinerankSchedule.entries.${index}.rank`, 1);
    frame(entry.triggerFrame, `LinerankSchedule.entries.${index}.triggerFrame`);
    if (index > 0) assert(entry.triggerFrame > value.entries[index - 1]!.triggerFrame,
      "LinerankSchedule trigger frames are not strictly increasing.");
    const window = value.windows[index];
    assert(window !== undefined, `LinerankSchedule entry ${entry.itemId} has no matching window.`);
    assert(entry.triggerFrame >= window.startFrame && entry.triggerFrame < window.endFrameExclusive,
      `LinerankSchedule entry ${entry.itemId} triggers outside its board window.`);
  }
  if (space !== undefined) {
    assertProgramSpaceIdentity(space);
    assert(value.windows.at(-1)!.endFrameExclusive <= programSpaceFrameCount(space), "LinerankSchedule exceeds ProgramSpace.");
  }
}

export function createLinerankItemSet(): LinerankItemSet {
  return { items: [] };
}

export function appendLinerankItem(set: LinerankItemSet, spec: LinerankItemSpec): LinerankItemSet {
  assert(Array.isArray(set.items), "LinerankItemSet is invalid.");
  assertLinerankItemSpec(spec);
  assert(!set.items.some((item) => item.id === spec.id), `Linerank Item ${spec.id} is duplicated.`);
  assert(!set.items.some((item) => item.rank === spec.rank), `Linerank Item rank ${spec.rank} is duplicated.`);
  return canonicalize({ ...set, items: [...set.items, structuredClone(spec)] }) as unknown as LinerankItemSet;
}

export function buildLinerankProgram(
  header: LinerankHeader,
  frameValue: import("@hypit/spatial").SpatialFrame,
  schedule: LinerankSchedule,
  style: LinerankStyle,
  title: string,
  set: LinerankItemSet,
): LinerankProgram {
  assertLinerankHeader(header);
  assertSpatialFrame(frameValue);
  assertLinerankSchedule(schedule);
  assertLinerankStyle(style);
  assert(title.trim().length > 0, "LinerankProgram.title is empty.");
  assert(schedule.entries.length === set.items.length, "Linerank Program item count differs from its Schedule.");
  for (const [index, item] of set.items.entries()) {
    assert(schedule.entries[index]?.itemId === item.id, "Linerank Program item order differs from its Schedule.");
  }
  const result: LinerankProgram = {
    id: header.id,
    frame: structuredClone(frameValue),
    schedule: structuredClone(schedule),
    style: structuredClone(style),
    title: title.trim(),
    items: structuredClone(set.items),
  };
  assertLinerankProgram(result);
  return canonicalize(result) as unknown as LinerankProgram;
}

export function assertLinerankProgram(value: LinerankProgram): void {
  assertLinerankSchedule(value.schedule);
  assertSpatialFrame(value.frame);
  assertLinerankStyle(value.style);
  assert(value.title.trim().length > 0, "LinerankProgram.title is empty.");
  assert(value.schedule.entries.length === value.items.length, "LinerankProgram item count differs from its Schedule.");
  for (const [index, item] of value.items.entries()) {
    assert(value.schedule.entries[index]?.itemId === item.id, "LinerankProgram item order differs from its Schedule.");
  }
}

export function verifyLinerankMedia(_media: SynchronizedMedia): void {
  // Reserved for future sound support; the board currently authors no audio.
  void _media;
}
