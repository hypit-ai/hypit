import type { FrameSpan } from "@hypit/composition";
import { assertFontArtifactRef } from "@hypit/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize, isDigest } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import type { CompleteSemanticMap } from "@hypit/semantic-map";
import { assertSpatialFrame } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import { locateMomentOccurrences, locateSelectionOccurrences } from "@hypit/temporal";
import { verifyText } from "@hypit/text";
import type { Text } from "@hypit/text";

import type {
  NotepadHeader,
  NotepadMarkPaint,
  NotepadProgram,
  NotepadRowPaint,
  NotepadRowShell,
  NotepadRowSpec,
  NotepadRowSpecSet,
  NotepadSchedule,
  NotepadStyle,
  NotepadTitlePaint,
  NotepadTitleSpec,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function color(value: string, label: string): void {
  assert(value === "transparent" || /^#[0-9a-f]{3,8}$/iu.test(value),
    `${label} must be a hexadecimal color or transparent.`);
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

function fraction(value: number, label: string): void {
  assert(Number.isFinite(value) && value >= 0 && value <= 1, `${label} must be a fraction between 0 and 1.`);
}

function integer(value: number, label: string, minimum = 0): void {
  assert(Number.isSafeInteger(value) && value >= minimum, `${label} must be an integer >= ${minimum}.`);
}

function stacking(value: number, label: string): void {
  assert(Number.isSafeInteger(value), `${label} must be an integer.`);
}

function frameNumber(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative frame.`);
}

function assertSpan(span: FrameSpan, label: string): void {
  frameNumber(span.startFrame, `${label}.startFrame`);
  frameNumber(span.endFrameExclusive, `${label}.endFrameExclusive`);
  assert(span.endFrameExclusive > span.startFrame, `${label} is empty.`);
}

export function assertNotepadSurface(value: BlobRef, label: string): void {
  assert(isDigest(value.digest) && Number.isSafeInteger(value.size) && value.size >= 0
    && /^image\//u.test(value.mediaType), `${label} must be an image Artifact.`);
}

export function assertNotepadHeader(value: NotepadHeader): void {
  identity(value.id, "NotepadHeader.id");
}

export function sealNotepadHeader(value: NotepadHeader): NotepadHeader {
  assertNotepadHeader(value);
  return canonicalize(value) as unknown as NotepadHeader;
}

export function assertNotepadTitleSpec(value: NotepadTitleSpec): void {
  assert(value.lead.trim().length > 0, "NotepadTitleSpec.lead is empty.");
  assert(typeof value.emphasis === "string", "NotepadTitleSpec.emphasis must be text.");
}

export function sealNotepadTitleSpec(value: NotepadTitleSpec): NotepadTitleSpec {
  assertNotepadTitleSpec(value);
  return canonicalize(value) as unknown as NotepadTitleSpec;
}

export function assertNotepadRowSpec(value: NotepadRowSpec): void {
  identity(value.id, "NotepadRowSpec.id");
  integer(value.rank, `NotepadRowSpec.${value.id}.rank`, 1);
  assert(value.label.trim().length > 0, `NotepadRowSpec.${value.id}.label is empty.`);
  assert(value.mark === "none" || value.mark === "circle", `NotepadRowSpec.${value.id}.mark is invalid.`);
  if (value.stackingOrder !== undefined) stacking(value.stackingOrder, `NotepadRowSpec.${value.id}.stackingOrder`);
}

export function assertNotepadRowShell(value: NotepadRowShell): void {
  identity(value.id, "NotepadRowShell.id");
  integer(value.rank, `NotepadRowShell.${value.id}.rank`, 1);
  assert(value.mark === "none" || value.mark === "circle", `NotepadRowShell.${value.id}.mark is invalid.`);
  if (value.stackingOrder !== undefined) stacking(value.stackingOrder, `NotepadRowShell.${value.id}.stackingOrder`);
}

export function sealNotepadRowShell(value: NotepadRowShell): NotepadRowShell {
  assertNotepadRowShell(value);
  return canonicalize(value) as unknown as NotepadRowShell;
}

export function materializeNotepadRow(shell: NotepadRowShell, content: Text): NotepadRowSpec {
  assertNotepadRowShell(shell);
  verifyText(content);
  assert(content.value.trim().length > 0, `Notepad Row ${shell.id} content is empty.`);
  const result: NotepadRowSpec = { ...shell, label: content.value };
  assertNotepadRowSpec(result);
  return canonicalize(result) as unknown as NotepadRowSpec;
}

export function createNotepadRowSpecSet(header: NotepadHeader): NotepadRowSpecSet {
  assertNotepadHeader(header);
  return { rows: [] };
}

export function assertNotepadRowSpecSet(value: NotepadRowSpecSet): void {
  const ids = new Set<string>();
  const ranks = new Set<number>();
  for (const row of value.rows) {
    assertNotepadRowSpec(row);
    assert(!ids.has(row.id), `NotepadRowSpecSet repeats ${row.id}.`);
    ids.add(row.id);
    assert(!ranks.has(row.rank), `NotepadRowSpecSet repeats rank ${row.rank}.`);
    ranks.add(row.rank);
  }
}

export function appendNotepadRowSpec(set: NotepadRowSpecSet, spec: NotepadRowSpec): NotepadRowSpecSet {
  assertNotepadRowSpecSet(set);
  assertNotepadRowSpec(spec);
  const result: NotepadRowSpecSet = { rows: [...set.rows, structuredClone(spec)] };
  assertNotepadRowSpecSet(result);
  return canonicalize(result) as unknown as NotepadRowSpecSet;
}

function assertTitlePaint(value: NotepadTitlePaint, label: string): void {
  fraction(value.xFraction, `${label}.xFraction`);
  fraction(value.yFraction, `${label}.yFraction`);
  assert(Number.isFinite(value.widthFraction) && value.widthFraction > 0 && value.widthFraction <= 1,
    `${label}.widthFraction must be within (0, 1].`);
  positive(value.sizePx, `${label}.sizePx`);
  positive(value.lineHeight, `${label}.lineHeight`);
  finite(value.trackingPx, `${label}.trackingPx`);
  color(value.color, `${label}.color`);
  nonNegative(value.underlinePx, `${label}.underlinePx`);
  if (value.shadow !== undefined) {
    finite(value.shadow.offsetX, `${label}.shadow.offsetX`);
    finite(value.shadow.offsetY, `${label}.shadow.offsetY`);
    nonNegative(value.shadow.blurPx, `${label}.shadow.blurPx`);
    color(value.shadow.color, `${label}.shadow.color`);
  }
}

function assertRowPaint(value: NotepadRowPaint, label: string): void {
  fraction(value.xFraction, `${label}.xFraction`);
  fraction(value.topFraction, `${label}.topFraction`);
  assert(Number.isFinite(value.widthFraction) && value.widthFraction > 0 && value.widthFraction <= 1,
    `${label}.widthFraction must be within (0, 1].`);
  positive(value.gapPx, `${label}.gapPx`);
  positive(value.sizePx, `${label}.sizePx`);
  positive(value.lineHeight, `${label}.lineHeight`);
  finite(value.trackingPx, `${label}.trackingPx`);
  color(value.color, `${label}.color`);
  positive(value.numberWidthPx, `${label}.numberWidthPx`);
}

function assertMarkPaint(value: NotepadMarkPaint, label: string): void {
  color(value.color, `${label}.color`);
  positive(value.strokeWidthPx, `${label}.strokeWidthPx`);
  nonNegative(value.padXPx, `${label}.padXPx`);
  nonNegative(value.padYPx, `${label}.padYPx`);
  finite(value.rotateDeg, `${label}.rotateDeg`);
  integer(value.frames, `${label}.frames`, 1);
  positive(value.advance, `${label}.advance`);
}

export function assertNotepadStyle(value: NotepadStyle): void {
  for (const [name, fonts] of [
    ["leadFonts", value.leadFonts], ["emphasisFonts", value.emphasisFonts],
    ["rowFonts", value.rowFonts], ["numberFonts", value.numberFonts],
  ] as const) {
    assert(fonts.length > 0, `NotepadStyle.${name} is empty.`);
    for (const [index, font] of fonts.entries()) assertFontArtifactRef(font, `NotepadStyle.${name}.${index}`);
  }
  assert(value.surfaceFit === "contain" || value.surfaceFit === "cover", "NotepadStyle.surfaceFit is invalid.");
  assertTitlePaint(value.title, "NotepadStyle.title");
  assertTitlePaint(value.opening, "NotepadStyle.opening");
  assertRowPaint(value.row, "NotepadStyle.row");
  assertMarkPaint(value.mark, "NotepadStyle.mark");
  integer(value.typing.titleFramesPerCharacter, "NotepadStyle.typing.titleFramesPerCharacter", 1);
  integer(value.typing.rowFramesPerCharacter, "NotepadStyle.typing.rowFramesPerCharacter", 1);
  for (const [name, order] of Object.entries(value.stacking)) {
    stacking(order, `NotepadStyle.stacking.${name}`);
  }
}

export function buildNotepadSchedule(input: {
  readonly header: NotepadHeader;
  readonly rows: NotepadRowSpecSet;
  readonly map: CompleteSemanticMap;
  readonly space: ProgramSpace;
  readonly during: NarrativeSelectionRef;
  readonly triggers: NarrativeMomentRef;
  readonly terminal: NarrativeMomentRef;
  readonly opening?: NarrativeSelectionRef;
}): NotepadSchedule {
  assertNotepadHeader(input.header);
  assertNotepadRowSpecSet(input.rows);
  assert(input.rows.rows.length > 0, "Notepad list requires at least one Row.");
  assertProgramSpaceIdentity(input.space);
  const windows = locateSelectionOccurrences(input.map, input.during, input.space);
  assert(windows.length > 0, "Notepad list Selection requires at least one occurrence.");
  const triggers = locateMomentOccurrences(input.map, input.triggers, input.space);
  assert(triggers.length === input.rows.rows.length,
    `Notepad trigger/Row cardinality differs: ${triggers.length} triggers for ${input.rows.rows.length} Rows.`);
  const terminal = locateMomentOccurrences(input.map, input.terminal, input.space);
  assert(terminal.length === 1,
    `Notepad terminal Moment requires exactly one occurrence; received ${terminal.length}.`);
  const opening = input.opening === undefined
    ? undefined
    : locateSelectionOccurrences(input.map, input.opening, input.space);
  if (opening !== undefined) {
    assert(opening.length === 1,
      `Notepad opening Selection requires exactly one occurrence; received ${opening.length}.`);
  }
  const result: NotepadSchedule = {
    id: input.header.id,
    windows: windows.map((item) => ({ startFrame: item.start.frame, endFrameExclusive: item.end.frame })),
    ...(opening === undefined
      ? {}
      : { opening: { startFrame: opening[0]!.start.frame, endFrameExclusive: opening[0]!.end.frame } }),
    terminalFrame: terminal[0]!.cue.frame,
    entries: input.rows.rows.map((row, index) => ({ rowId: row.id, triggerFrame: triggers[index]!.cue.frame })),
  };
  assertNotepadSchedule(result, input.space);
  return canonicalize(result) as unknown as NotepadSchedule;
}

export function assertNotepadSchedule(value: NotepadSchedule, space?: ProgramSpace): void {
  identity(value.id, "NotepadSchedule.id");
  assert(value.windows.length > 0, "NotepadSchedule.windows is empty.");
  let previousEnd = -1;
  for (const [index, window] of value.windows.entries()) {
    assertSpan(window, `NotepadSchedule.windows.${index}`);
    assert(window.startFrame >= previousEnd, "NotepadSchedule windows overlap or are unordered.");
    previousEnd = window.endFrameExclusive;
  }
  if (value.opening !== undefined) {
    assertSpan(value.opening, "NotepadSchedule.opening");
    assert(value.opening.endFrameExclusive <= value.windows[0]!.startFrame,
      "NotepadSchedule opening overlaps the first paper window.");
  }
  frameNumber(value.terminalFrame, "NotepadSchedule.terminalFrame");
  assert(value.terminalFrame <= value.windows.at(-1)!.endFrameExclusive,
    "NotepadSchedule terminal exceeds its last window.");
  assert(value.entries.length > 0, "NotepadSchedule.entries is empty.");
  const ids = new Set<string>();
  let previousTrigger = -1;
  for (const [index, entry] of value.entries.entries()) {
    identity(entry.rowId, `NotepadSchedule.entries.${index}.rowId`);
    assert(!ids.has(entry.rowId), `NotepadSchedule repeats ${entry.rowId}.`);
    ids.add(entry.rowId);
    frameNumber(entry.triggerFrame, `NotepadSchedule.entries.${index}.triggerFrame`);
    assert(entry.triggerFrame > previousTrigger, "NotepadSchedule trigger frames are not strictly increasing.");
    previousTrigger = entry.triggerFrame;
    assert(value.windows.some((window) => entry.triggerFrame >= window.startFrame
      && entry.triggerFrame < window.endFrameExclusive),
    `NotepadSchedule.entries.${index} triggers outside every window.`);
  }
  if (space !== undefined) {
    assertProgramSpaceIdentity(space);
    assert(value.windows.at(-1)!.endFrameExclusive <= programSpaceFrameCount(space),
      "NotepadSchedule exceeds ProgramSpace.");
  }
}

export function buildNotepadProgram(
  header: NotepadHeader,
  frame: SpatialFrame,
  surface: BlobRef,
  schedule: NotepadSchedule,
  style: NotepadStyle,
  title: NotepadTitleSpec,
  rows: NotepadRowSpecSet,
): NotepadProgram {
  assertNotepadHeader(header);
  assertSpatialFrame(frame);
  assertNotepadSurface(surface, "NotepadProgram.surface");
  assertNotepadSchedule(schedule);
  assertNotepadStyle(style);
  assertNotepadTitleSpec(title);
  assertNotepadRowSpecSet(rows);
  const result: NotepadProgram = {
    id: header.id,
    frame: structuredClone(frame),
    surface: structuredClone(surface),
    schedule: structuredClone(schedule),
    style: structuredClone(style),
    title: structuredClone(title),
    rows: structuredClone(rows.rows),
  };
  assertNotepadProgram(result);
  return canonicalize(result) as unknown as NotepadProgram;
}

export function assertNotepadProgram(value: NotepadProgram): void {
  assertSpatialFrame(value.frame);
  assertNotepadSurface(value.surface, "NotepadProgram.surface");
  assertNotepadSchedule(value.schedule);
  assertNotepadStyle(value.style);
  assertNotepadTitleSpec(value.title);
  assert(value.schedule.entries.length === value.rows.length,
    "NotepadProgram Row count differs from its Schedule.");
  for (const [index, row] of value.rows.entries()) {
    assertNotepadRowSpec(row);
    assert(value.schedule.entries[index]?.rowId === row.id,
      "NotepadProgram Row order differs from its Schedule.");
  }
}
