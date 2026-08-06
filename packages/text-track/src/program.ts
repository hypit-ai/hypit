import {
  assertProgramSpaceIdentity,
  assertVisualTrackIdentity,
  programSpaceFrameCount,
  sealVisualTrack,
} from "@svml/contracts";
import type { ProgramSpace, VisualStyleDeclaration, VisualTrack } from "@svml/contracts";
import { digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type { TextAppearance, TextItem, TextTrackProgram } from "./types.js";

export const renderTextTrackImplementationDigest = digestOf("@svml/text-track/render@1");

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

function textTrackProgramContent(value: Omit<TextTrackProgram, "digest">): Omit<TextTrackProgram, "digest"> {
  return {
    contract: "svml.text-track-program@1",
    id: value.id,
    programSpaceDigest: value.programSpaceDigest,
    items: [...value.items]
      .map(normalizeItem)
      .sort((left, right) => left.span.startFrame - right.span.startFrame
        || left.z - right.z
        || left.tieBreak.localeCompare(right.tieBreak)
        || left.id.localeCompare(right.id)),
  };
}

export function computeTextTrackProgramDigest(value: Omit<TextTrackProgram, "digest">): Digest {
  return digestOf(textTrackProgramContent(value));
}

export function sealTextTrackProgram(value: Omit<TextTrackProgram, "digest">): TextTrackProgram {
  const content = textTrackProgramContent(value);
  return { ...content, digest: digestOf(content) };
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
}

export function assertTextTrackProgramIdentity(program: TextTrackProgram, programSpace: ProgramSpace): void {
  assertProgramSpaceIdentity(programSpace);
  if (program.contract !== "svml.text-track-program@1") throw new Error("Unsupported TextTrackProgram contract.");
  assertNonEmpty(program.id, "TextTrackProgram id");
  if (program.programSpaceDigest !== programSpace.digest) {
    throw new Error("TextTrackProgram belongs to another ProgramSpace.");
  }
  const { digest: _digest, ...content } = program;
  if (!isDigest(program.digest) || program.digest !== computeTextTrackProgramDigest(content)) {
    throw new Error("TextTrackProgram digest does not match its contents.");
  }
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
  ];
}

export function renderTextTrack(programSpace: ProgramSpace, program: TextTrackProgram): VisualTrack {
  assertTextTrackProgramIdentity(program, programSpace);
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: program.id,
    programSpaceDigest: programSpace.digest,
    sources: [{ name: "program", digest: program.digest }],
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
