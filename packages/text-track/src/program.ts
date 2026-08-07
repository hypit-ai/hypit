import {
  assertCompleteSemanticMapIdentity,
  assertNarrativeSelectionIdentity,
  assertProgramSpaceIdentity,
  assertVisualTrackIdentity,
  programSpaceFrameCount,
  selectionFrameSpans,
  sealVisualTrack,
} from "@narratage/contracts";
import type {
  CompleteSemanticMap,
  NarrativeSelectionRef,
  ProgramSpace,
  VisualStyleDeclaration,
  VisualTrack,
} from "@narratage/contracts";
import { canonicalize, digestOf } from "@narratage/protocol";

import type {
  TextAppearance,
  TextItem,
  TextItemSpec,
  TextTrackHeader,
  TextTrackProgram,
  TextTrackSet,
  TextTrackSpec,
} from "./types.js";

export const renderTextTrackImplementationDigest = digestOf("@narratage/text-track/render@1");
export const compileTextTrackImplementationDigest = digestOf("@narratage/text-track/compile@1");
export const createTextTrackSetImplementationDigest = digestOf("@narratage/text-track/create-set@1");
export const appendFullTextItemImplementationDigest = digestOf("@narratage/text-track/append-full-item@1");
export const appendSelectedTextItemImplementationDigest = digestOf("@narratage/text-track/append-selected-item@1");
export const finalizeTextTrackImplementationDigest = digestOf("@narratage/text-track/finalize@1");

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function normalizeItem(item: TextItem): TextItem {
  return {
    id: item.id,
    text: item.text,
    span: { ...item.span },
    z: item.z,
    tieBreak: item.tieBreak,
    box: { ...item.box },
    appearance: { ...item.appearance },
  };
}

function textTrackProgramContent(value: TextTrackProgram): TextTrackProgram {
  return {
    contract: "svml.text-track-program@1",
    id: value.id,
    items: [...value.items]
      .map(normalizeItem)
      .sort((left, right) => left.span.startFrame - right.span.startFrame
        || left.z - right.z
        || left.tieBreak.localeCompare(right.tieBreak)
        || left.id.localeCompare(right.id)),
  };
}

export function sealTextTrackProgram(value: TextTrackProgram): TextTrackProgram {
  return textTrackProgramContent(value);
}

function assertAppearance(appearance: TextAppearance, label: string): void {
  assertNonEmpty(appearance.color, `${label} color`);
  assertFinite(appearance.fontSizePx, `${label} fontSizePx`);
  if (appearance.fontSizePx <= 0) throw new Error(`${label} fontSizePx must be positive.`);
  if (appearance.fontFamily !== undefined) assertNonEmpty(appearance.fontFamily, `${label} fontFamily`);
  if (
    appearance.fontWeight !== undefined
    && (!Number.isSafeInteger(appearance.fontWeight) || appearance.fontWeight < 1 || appearance.fontWeight > 1000)
  ) {
    throw new Error(`${label} fontWeight must be an integer from 1 to 1000.`);
  }
  if (appearance.lineHeight !== undefined) {
    assertFinite(appearance.lineHeight, `${label} lineHeight`);
    if (appearance.lineHeight <= 0) throw new Error(`${label} lineHeight must be positive.`);
  }
  for (const [name, value] of Object.entries({
    borderRadiusPx: appearance.borderRadiusPx,
    paddingPx: appearance.paddingPx,
  })) {
    if (value !== undefined) {
      assertFinite(value, `${label} ${name}`);
      if (value < 0) throw new Error(`${label} ${name} must not be negative.`);
    }
  }
  if (appearance.backgroundColor !== undefined) assertNonEmpty(appearance.backgroundColor, `${label} backgroundColor`);
  if (appearance.letterSpacingPx !== undefined) assertFinite(appearance.letterSpacingPx, `${label} letterSpacingPx`);
}

export function assertTextTrackProgramIdentity(program: TextTrackProgram, programSpace: ProgramSpace): void {
  assertProgramSpaceIdentity(programSpace);
  if (program.contract !== "svml.text-track-program@1") throw new Error("Unsupported TextTrackProgram contract.");
  assertNonEmpty(program.id, "TextTrackProgram id");
  if (program.items.length === 0) throw new Error("TextTrackProgram must contain at least one item.");
  const totalFrames = programSpaceFrameCount(programSpace);
  const ids = new Set<string>();
  for (const item of program.items) {
    assertNonEmpty(item.id, "Text item id");
    if (ids.has(item.id)) throw new Error(`TextTrackProgram contains duplicate item ${item.id}.`);
    ids.add(item.id);
    if (!item.text) throw new Error(`${item.id} text must not be empty.`);
    if (
      !Number.isSafeInteger(item.span.startFrame)
      || !Number.isSafeInteger(item.span.endFrameExclusive)
      || item.span.startFrame < 0
      || item.span.endFrameExclusive <= item.span.startFrame
      || item.span.endFrameExclusive > totalFrames
    ) {
      throw new Error(`${item.id} span is outside ProgramSpace.`);
    }
    if (!Number.isSafeInteger(item.z)) throw new Error(`${item.id} z must be a safe integer.`);
    assertNonEmpty(item.tieBreak, `${item.id} tieBreak`);
    for (const [name, value] of Object.entries(item.box)) assertFinite(value, `${item.id} box.${name}`);
    if (item.box.widthPercent <= 0 || item.box.heightPercent <= 0) {
      throw new Error(`${item.id} box width and height must be positive.`);
    }
    assertAppearance(item.appearance, `${item.id} appearance`);
  }
}

function rootStyle(item: TextItem): VisualStyleDeclaration[] {
  const vertical = item.appearance.verticalAlign ?? "center";
  return [
    { name: "position", value: "absolute" },
    { name: "left", value: `${item.box.xPercent}%` },
    { name: "top", value: `${item.box.yPercent}%` },
    { name: "width", value: `${item.box.widthPercent}%` },
    { name: "height", value: `${item.box.heightPercent}%` },
    { name: "box-sizing", value: "border-box" },
    { name: "display", value: "flex" },
    { name: "align-items", value: vertical === "top" ? "flex-start" : vertical === "bottom" ? "flex-end" : "center" },
    { name: "justify-content", value: "center" },
    ...(item.appearance.backgroundColor === undefined
      ? []
      : [{ name: "background-color", value: item.appearance.backgroundColor }]),
    ...(item.appearance.borderRadiusPx === undefined
      ? []
      : [{ name: "border-radius", value: `${item.appearance.borderRadiusPx}px` }]),
    ...(item.appearance.paddingPx === undefined
      ? []
      : [{ name: "padding", value: `${item.appearance.paddingPx}px` }]),
  ];
}

function textStyle(appearance: TextAppearance): VisualStyleDeclaration[] {
  return [
    { name: "width", value: "100%" },
    { name: "white-space", value: "pre-wrap" },
    { name: "color", value: appearance.color },
    { name: "font-size", value: `${appearance.fontSizePx}px` },
    { name: "font-weight", value: appearance.fontWeight ?? 400 },
    { name: "line-height", value: appearance.lineHeight ?? 1.2 },
    { name: "text-align", value: appearance.align ?? "center" },
    ...(appearance.fontFamily === undefined ? [] : [{ name: "font-family", value: appearance.fontFamily }]),
    ...(appearance.letterSpacingPx === undefined ? [] : [{ name: "letter-spacing", value: `${appearance.letterSpacingPx}px` }]),
  ];
}

export function sealTextTrackSpec(value: TextTrackSpec): TextTrackSpec {
  return canonicalSpec(value);
}

function canonicalSpec(value: TextTrackSpec): TextTrackSpec {
  return {
    contract: "svml.text-track-spec@1",
    id: value.id,
    items: value.items.map((item) => ({
      id: item.id,
      text: item.text,
      during: "full",
      z: item.z,
      box: { ...item.box },
      appearance: { ...item.appearance },
    })),
  };
}

export function assertTextTrackSpec(spec: TextTrackSpec): void {
  if (spec.contract !== "svml.text-track-spec@1" || !spec.id || spec.items.length === 0) {
    throw new Error("TextTrackSpec identity or items are invalid.");
  }
  const ids = new Set<string>();
  for (const item of spec.items) {
    if (!item.id || !item.text || item.during !== "full" || ids.has(item.id) || !Number.isSafeInteger(item.z)) {
      throw new Error("TextTrackSpec contains an invalid item.");
    }
    ids.add(item.id);
    for (const value of Object.values(item.box)) assertFinite(value, `${item.id} box`);
    assertAppearance(item.appearance, `${item.id} appearance`);
  }
}

export function compileTextTrackProgram(programSpace: ProgramSpace, spec: TextTrackSpec): TextTrackProgram {
  assertProgramSpaceIdentity(programSpace);
  assertTextTrackSpec(spec);
  return sealTextTrackProgram({
    contract: "svml.text-track-program@1",
    id: spec.id,
    items: spec.items.map((item) => ({
      id: item.id,
      text: item.text,
      span: { startFrame: 0, endFrameExclusive: programSpaceFrameCount(programSpace) },
      z: item.z,
      tieBreak: `${spec.id}:${item.id}`,
      box: item.box,
      appearance: item.appearance,
    })),
  });
}

export function renderTextTrack(programSpace: ProgramSpace, program: TextTrackProgram): VisualTrack {
  assertTextTrackProgramIdentity(program, programSpace);
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: program.id,
    presents: program.items.map((item) => ({
      id: item.id,
      span: { ...item.span },
      stacking: { order: item.z, tieBreak: item.tieBreak },
      elements: [
        { id: "root", kind: "box", order: 0, style: rootStyle(item) },
        { id: "text", parent: "root", kind: "text", order: 1, text: item.text, style: textStyle(item.appearance) },
      ],
    })),
  });
  assertVisualTrackIdentity(track, programSpace);
  return track;
}

export function sealTextTrackHeader(value: TextTrackHeader): TextTrackHeader {
  const result = canonicalize(value) as unknown as TextTrackHeader;
  assertTextTrackHeader(result);
  return result;
}

export function assertTextTrackHeader(value: TextTrackHeader): void {
  if (
    value.contract !== "svml.text-track-header@1"
    || value.id.length === 0
  ) throw new Error("TextTrackHeader is invalid");
}

export function sealTextItemSpec(value: TextItemSpec): TextItemSpec {
  const result = canonicalize(value) as unknown as TextItemSpec;
  assertTextItemSpec(result);
  return result;
}

export function assertTextItemSpec(value: TextItemSpec): void {
  if (
    value.contract !== "svml.text-item-spec@1"
    || value.id.length === 0
    || value.text.length === 0
    || !Number.isSafeInteger(value.z)
  ) throw new Error("TextItemSpec is invalid");
  for (const [name, number] of Object.entries(value.box)) assertFinite(number, `${value.id} box.${name}`);
  if (value.box.widthPercent <= 0 || value.box.heightPercent <= 0) throw new Error("TextItemSpec box is invalid");
  assertAppearance(value.appearance, `${value.id} appearance`);
}

export function assertTextTrackSet(value: TextTrackSet): void {
  if (value.contract !== "svml.text-track-set@1") throw new Error("TextTrackSet is invalid");
  const ids = new Set<string>();
  for (const item of value.items) {
    if (ids.has(item.id)) throw new Error(`TextTrackSet repeats Item ${item.id}`);
    ids.add(item.id);
  }
}

export function createTextTrackSet(): TextTrackSet {
  return {
    contract: "svml.text-track-set@1",
    items: [],
  };
}

function appendItems(
  set: TextTrackSet,
  spec: TextItemSpec,
  additions: readonly TextItem[],
): TextTrackSet {
  assertTextTrackSet(set);
  assertTextItemSpec(spec);
  const existing = new Set(set.items.map((item) => item.id));
  if (additions.some((item) => existing.has(item.id))) throw new Error(`Text Item ${spec.id} is duplicated`);
  return {
    contract: "svml.text-track-set@1",
    items: [...set.items, ...additions],
  };
}

function itemFromSpec(spec: TextItemSpec, id: string, span: TextItem["span"], tieBreak: string): TextItem {
  return {
    id,
    text: spec.text,
    span,
    z: spec.z,
    tieBreak,
    box: spec.box,
    appearance: spec.appearance,
  };
}

export function appendFullTextItem(
  set: TextTrackSet,
  header: TextTrackHeader,
  space: ProgramSpace,
  spec: TextItemSpec,
): TextTrackSet {
  assertTextTrackSet(set);
  assertTextTrackHeader(header);
  assertProgramSpaceIdentity(space);
  return appendItems(set, spec, [itemFromSpec(
    spec,
    spec.id,
    { startFrame: 0, endFrameExclusive: programSpaceFrameCount(space) },
    `${header.id}:${spec.id}:1`,
  )]);
}

export function appendSelectedTextItem(
  set: TextTrackSet,
  header: TextTrackHeader,
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  space: ProgramSpace,
  spec: TextItemSpec,
): TextTrackSet {
  assertTextTrackSet(set);
  assertTextTrackHeader(header);
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeSelectionIdentity(selection);
  assertProgramSpaceIdentity(space);
  const spans = selectionFrameSpans(map, selection, space);
  return appendItems(set, spec, spans.map((span, index) => itemFromSpec(
    spec,
    spans.length === 1 ? spec.id : `${spec.id}:${index + 1}`,
    span,
    `${header.id}:${spec.id}:${index + 1}`,
  )));
}

export function finalizeTextTrack(header: TextTrackHeader, set: TextTrackSet): TextTrackProgram {
  assertTextTrackHeader(header);
  assertTextTrackSet(set);
  if (set.items.length === 0) throw new Error("TextTrack requires at least one Item");
  const program = sealTextTrackProgram({
    contract: "svml.text-track-program@1",
    id: header.id,
    items: set.items,
  });
  return program;
}
