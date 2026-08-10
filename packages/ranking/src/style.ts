import {
  assertFontArtifactRef,
  assertFontStackRef,
} from "@narratage/media";
import type {
  FontArtifactRef,
  FontStackRef,
} from "@narratage/media";
import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import {
  assertColumnStyle,
  assertRankingSoundStyle,
  assertTierBoardStyle,
  assertTopThreeStyle,
  assertTypewriterListStyle,
} from "./schedule.js";
import type {
  ColumnStyle,
  RankingBoardPaint,
  RankingMotionStyle,
  RankingSoundStyle,
  RankingTextStyle,
  TierBoardStyle,
  TierRowStyle,
  TopThreeStyle,
  TypewriterListStyle,
} from "./types.js";

/**
 * One group per reader below, so a variant's list of properties is the list of
 * readers its decoder calls. Everything else that offers these properties — an
 * author's Recipe form, above all — composes the same groups, so a property
 * added to a reader reaches a form without anyone remembering to add it twice.
 */
const TEXT_KEYS = ["font-size", "font-weight", "text-color", "line-height"] as const;

const BOARD_KEYS = [
  "board-background", "board-border-color", "board-border-width", "board-radius",
  "board-shadow-x", "board-shadow-y", "board-shadow-blur", "board-shadow-spread", "board-shadow-color",
] as const;

const MOTION_KEYS = ["appear-frames", "move-frames", "motion-easing"] as const;

const SOUND_KEYS = ["appear-gain", "move-gain", "sound-fade-frames"] as const;

const STACK_KEYS = ["board-stack", "item-stack"] as const;

/** Where an item waits, and how large it is, before it flies to its place. */
const STAGE_KEYS = ["stage-x", "stage-y", "stage-size", "stage-stack"] as const;

const ICON_KEYS = ["icon-size", "icon-radius", "icon-fit"] as const;

export const TIER_BOARD_PROPERTIES = [
  ...TEXT_KEYS, ...BOARD_KEYS, ...MOTION_KEYS, ...SOUND_KEYS, ...STACK_KEYS, ...STAGE_KEYS, ...ICON_KEYS,
  "rows", "label-width", "padding", "row-height", "row-gap", "cell-gap",
] as const;

export const COLUMN_PROPERTIES = [
  ...TEXT_KEYS, ...BOARD_KEYS, ...MOTION_KEYS, ...SOUND_KEYS, ...STACK_KEYS, ...STAGE_KEYS, ...ICON_KEYS,
  "rank-colors", "padding", "row-height", "row-gap",
] as const;

/** No board and no stage: three slots are drawn straight onto the frame. */
export const TOP_THREE_PROPERTIES = [
  ...TEXT_KEYS, ...MOTION_KEYS, ...SOUND_KEYS, ...STACK_KEYS, ...ICON_KEYS,
  "slot-colors", "center-x", "baseline-y", "slot-gap", "ring-width", "label-gap",
] as const;

/** Two typographies rather than one, and letters appear instead of moving. */
export const TYPEWRITER_LIST_PROPERTIES = [
  ...BOARD_KEYS, ...SOUND_KEYS, ...STACK_KEYS,
  "title-font-size", "title-font-weight", "title-color", "title-line-height",
  "item-font-size", "item-font-weight", "item-color", "item-line-height",
  "emphasis-color", "winner-color", "padding", "row-gap", "title-gap", "rotation",
  "frames-per-grapheme", "winner-frames",
] as const;

/**
 * The two variants that read less than they were once handed.
 *
 * Both were written against a single list common to all four and so still accept
 * properties they never consult. Rejecting those now would turn Recipes that are
 * merely wasteful into Recipes that fail, so they remain accepted here and stay
 * out of the lists above, which say what a variant honours.
 */
const TOP_THREE_ACCEPTED = [...TOP_THREE_PROPERTIES, ...BOARD_KEYS, "stage-stack"] as const;

const TYPEWRITER_ACCEPTED = [
  ...TYPEWRITER_LIST_PROPERTIES, ...TEXT_KEYS, ...MOTION_KEYS, "stage-stack",
] as const;

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`Ranking Recipe ${recipe.path} ${message}`);
}

function known(recipe: SvsRecipe, allowed: readonly string[]): void {
  const set = new Set(allowed);
  const unknown = Object.keys(recipe.properties).filter((key) => !set.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
}

function number(recipe: SvsRecipe, name: string, fallback: number): number {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function integer(recipe: SvsRecipe, name: string, fallback: number): number {
  const value = number(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}

function text(recipe: SvsRecipe, name: string, fallback: string): string {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function oneOf<T extends string>(recipe: SvsRecipe, name: string, values: readonly T[], fallback: T): T {
  const value = text(recipe, name, fallback);
  if (!values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function exactFonts(value: FontStackRef | FontArtifactRef): FontArtifactRef[] {
  if (value.contract === "svml.font-stack@1") {
    assertFontStackRef(value, "Ranking font");
    return [...structuredClone(value.faces)];
  }
  assertFontArtifactRef(value, "Ranking font");
  return [structuredClone(value)];
}

/**
 * The other direction: what a reader came to, spelled as a `.svs` spells it.
 *
 * A Recipe leaves nearly all of itself to the fallbacks above, and those live
 * in the readers and nowhere else, so what a property comes to is read back out
 * of what a decoder built rather than stated a second time here. Only spelling
 * is this half's own work, and only where a reader took one property apart:
 * each rejoining sits beside the split it undoes so the two cannot drift.
 */
type Written = Readonly<Record<string, CanonicalValue>>;

function typography(
  recipe: SvsRecipe,
  fonts: readonly FontArtifactRef[],
  prefix: "" | "title-" | "item-" = "",
  defaults: { readonly size: number; readonly weight: number; readonly color: string; readonly lineHeight: number } = {
    size: 28, weight: 700, color: "#ffffff", lineHeight: 1.15,
  },
): RankingTextStyle {
  return {
    fonts: structuredClone(fonts),
    sizePx: number(recipe, `${prefix}font-size`, defaults.size),
    weight: integer(recipe, `${prefix}font-weight`, defaults.weight),
    color: text(recipe, `${prefix}${prefix.length === 0 ? "text-color" : "color"}`, defaults.color),
    lineHeight: number(recipe, `${prefix}line-height`, defaults.lineHeight),
  };
}

function typographyWritten(value: RankingTextStyle, prefix: "" | "title-" | "item-" = ""): Written {
  return {
    [`${prefix}font-size`]: value.sizePx,
    [`${prefix}font-weight`]: value.weight,
    [`${prefix}${prefix.length === 0 ? "text-color" : "color"}`]: value.color,
    [`${prefix}line-height`]: value.lineHeight,
  };
}

function board(recipe: SvsRecipe): RankingBoardPaint {
  return {
    background: text(recipe, "board-background", "#151821"),
    borderColor: text(recipe, "board-border-color", "#ffffff33"),
    borderWidthPx: number(recipe, "board-border-width", 1),
    radiusPx: number(recipe, "board-radius", 18),
    shadow: {
      offsetX: number(recipe, "board-shadow-x", 0),
      offsetY: number(recipe, "board-shadow-y", 10),
      blurPx: number(recipe, "board-shadow-blur", 24),
      spreadPx: number(recipe, "board-shadow-spread", 0),
      color: text(recipe, "board-shadow-color", "#00000066"),
    },
  };
}

function boardWritten(value: RankingBoardPaint): Written {
  return {
    "board-background": value.background,
    "board-border-color": value.borderColor,
    "board-border-width": value.borderWidthPx,
    "board-radius": value.radiusPx,
    "board-shadow-x": value.shadow.offsetX,
    "board-shadow-y": value.shadow.offsetY,
    "board-shadow-blur": value.shadow.blurPx,
    "board-shadow-spread": value.shadow.spreadPx,
    "board-shadow-color": value.shadow.color,
  };
}

function motion(recipe: SvsRecipe): RankingMotionStyle {
  return {
    appearFrames: integer(recipe, "appear-frames", 6),
    moveFrames: integer(recipe, "move-frames", 8),
    easing: oneOf(recipe, "motion-easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-in-out"),
  };
}

function motionWritten(value: RankingMotionStyle): Written {
  return {
    "appear-frames": value.appearFrames,
    "move-frames": value.moveFrames,
    "motion-easing": value.easing,
  };
}

function soundStyle(recipe: SvsRecipe): RankingSoundStyle {
  return {
    contract: "svml.ranking-sound-style@1",
    appearGain: number(recipe, "appear-gain", 1),
    moveGain: number(recipe, "move-gain", 1),
    fadeFrames: integer(recipe, "sound-fade-frames", 0),
  };
}

function sound(recipe: SvsRecipe): RankingSoundStyle {
  const value = soundStyle(recipe);
  assertRankingSoundStyle(value);
  return canonicalize(value) as unknown as RankingSoundStyle;
}

function soundWritten(value: RankingSoundStyle): Written {
  return {
    "appear-gain": value.appearGain,
    "move-gain": value.moveGain,
    "sound-fade-frames": value.fadeFrames,
  };
}

function rowList(recipe: SvsRecipe): TierRowStyle[] {
  const raw = text(recipe, "rows", "s:S:#ef4444|a:A:#f59e0b|b:B:#22c55e|c:C:#3b82f6");
  return raw.split("|").map((item, index) => {
    const [id, label, color] = item.split(":").map((part) => part.trim());
    if (!id || !label || !color) fail(recipe, `rows entry ${index + 1} must be id:label:color.`);
    return { id, label, color };
  });
}

function rowsWritten(rows: readonly TierRowStyle[]): string {
  return rows.map((row) => `${row.id}:${row.label}:${row.color}`).join("|");
}

function colorList(recipe: SvsRecipe, name: string, fallback: string): string[] {
  const result = text(recipe, name, fallback).split("|").map((value) => value.trim()).filter(Boolean);
  if (result.length === 0) fail(recipe, `${name} is empty.`);
  return result;
}

function colorsWritten(colors: readonly string[]): string {
  return colors.join("|");
}

/** The three groups each decoder reads inline, and so reports inline as well. */
function iconsWritten(
  style: { readonly iconSizePx: number; readonly iconRadiusPx: number; readonly iconFit: "contain" | "cover" },
): Written {
  return { "icon-size": style.iconSizePx, "icon-radius": style.iconRadiusPx, "icon-fit": style.iconFit };
}

function stageWritten(
  style: {
    readonly stagePoint: { readonly x: number; readonly y: number };
    readonly stageSizePx: number;
    readonly stageStackingOrder: number;
  },
): Written {
  return {
    "stage-x": style.stagePoint.x,
    "stage-y": style.stagePoint.y,
    "stage-size": style.stageSizePx,
    "stage-stack": style.stageStackingOrder,
  };
}

function stacksWritten(
  style: { readonly boardStackingOrder: number; readonly itemStackingOrder: number },
): Written {
  return { "board-stack": style.boardStackingOrder, "item-stack": style.itemStackingOrder };
}

/**
 * Building a Style and judging it are separate, so that a Recipe can be read
 * back without media.
 *
 * A report is of the properties, and no property names a font — but a Style is
 * not valid without one, and its validator says so. Each decoder therefore
 * builds first and asserts after, and the report builds with no faces at all
 * and never asserts. Lowering keeps both halves, so nothing reaches a Producer
 * unjudged.
 */
function tierBoardStyle(recipe: SvsRecipe, fonts: readonly FontArtifactRef[]): TierBoardStyle {
  return {
    contract: "svml.tier-board-style@1",
    rows: rowList(recipe),
    board: board(recipe),
    text: typography(recipe, fonts),
    labelWidthPx: number(recipe, "label-width", 72),
    paddingPx: number(recipe, "padding", 18),
    rowHeightPx: number(recipe, "row-height", 92),
    rowGapPx: number(recipe, "row-gap", 10),
    cellGapPx: number(recipe, "cell-gap", 12),
    iconSizePx: number(recipe, "icon-size", 72),
    iconRadiusPx: number(recipe, "icon-radius", 12),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    stagePoint: { x: number(recipe, "stage-x", 0.5), y: number(recipe, "stage-y", 0.23) },
    stageSizePx: number(recipe, "stage-size", 108),
    motion: motion(recipe),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    stageStackingOrder: integer(recipe, "stage-stack", 25),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
}

function columnStyle(recipe: SvsRecipe, fonts: readonly FontArtifactRef[]): ColumnStyle {
  return {
    contract: "svml.column-style@1",
    board: board(recipe),
    text: typography(recipe, fonts),
    rankColors: colorList(recipe, "rank-colors", "#facc15|#d1d5db|#fb923c|#60a5fa|#a78bfa"),
    paddingPx: number(recipe, "padding", 18),
    rowHeightPx: number(recipe, "row-height", 74),
    rowGapPx: number(recipe, "row-gap", 10),
    iconSizePx: number(recipe, "icon-size", 58),
    iconRadiusPx: number(recipe, "icon-radius", 10),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    stagePoint: { x: number(recipe, "stage-x", 0.5), y: number(recipe, "stage-y", 0.24) },
    stageSizePx: number(recipe, "stage-size", 132),
    motion: motion(recipe),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    stageStackingOrder: integer(recipe, "stage-stack", 25),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
}

function topThreeStyle(recipe: SvsRecipe, fonts: readonly FontArtifactRef[]): TopThreeStyle {
  return {
    contract: "svml.top-three-style@1",
    text: typography(recipe, fonts),
    slotColors: colorList(recipe, "slot-colors", "#facc15|#d1d5db|#fb923c"),
    centerX: number(recipe, "center-x", 0.5),
    baselineY: number(recipe, "baseline-y", 0.55),
    slotGapPx: number(recipe, "slot-gap", 24),
    iconSizePx: number(recipe, "icon-size", 104),
    iconRadiusPx: number(recipe, "icon-radius", 52),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    ringWidthPx: number(recipe, "ring-width", 5),
    labelGapPx: number(recipe, "label-gap", 12),
    motion: motion(recipe),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
}

function typewriterListStyle(recipe: SvsRecipe, fonts: readonly FontArtifactRef[]): TypewriterListStyle {
  return {
    contract: "svml.typewriter-list-style@1",
    paper: board(recipe),
    title: typography(recipe, fonts, "title-", { size: 34, weight: 800, color: "#111827", lineHeight: 1.1 }),
    item: typography(recipe, fonts, "item-", { size: 26, weight: 600, color: "#1f2937", lineHeight: 1.2 }),
    emphasisColor: text(recipe, "emphasis-color", "#dc2626"),
    winnerColor: text(recipe, "winner-color", "#eab308"),
    paddingPx: number(recipe, "padding", 28),
    rowGapPx: number(recipe, "row-gap", 16),
    titleGapPx: number(recipe, "title-gap", 22),
    rotationDeg: number(recipe, "rotation", -1.2),
    framesPerGrapheme: integer(recipe, "frames-per-grapheme", 2),
    winnerFrames: integer(recipe, "winner-frames", 5),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
}

export function decodeTierBoardStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TierBoardStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TIER_BOARD_PROPERTIES);
  const style = tierBoardStyle(recipe, exactFonts(font));
  assertTierBoardStyle(style);
  return { style: canonicalize(style) as unknown as TierBoardStyle, sound: sound(recipe) };
}

export function reportTierBoardStyle(recipe: SvsRecipe): Written {
  known(recipe, TIER_BOARD_PROPERTIES);
  const style = tierBoardStyle(recipe, []);
  return {
    ...typographyWritten(style.text),
    ...boardWritten(style.board),
    ...motionWritten(style.motion),
    ...soundWritten(soundStyle(recipe)),
    ...stacksWritten(style),
    ...stageWritten(style),
    ...iconsWritten(style),
    rows: rowsWritten(style.rows),
    "label-width": style.labelWidthPx,
    padding: style.paddingPx,
    "row-height": style.rowHeightPx,
    "row-gap": style.rowGapPx,
    "cell-gap": style.cellGapPx,
  };
}

export function decodeColumnStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: ColumnStyle; readonly sound: RankingSoundStyle } {
  known(recipe, COLUMN_PROPERTIES);
  const style = columnStyle(recipe, exactFonts(font));
  assertColumnStyle(style);
  return { style: canonicalize(style) as unknown as ColumnStyle, sound: sound(recipe) };
}

export function reportColumnStyle(recipe: SvsRecipe): Written {
  known(recipe, COLUMN_PROPERTIES);
  const style = columnStyle(recipe, []);
  return {
    ...typographyWritten(style.text),
    ...boardWritten(style.board),
    ...motionWritten(style.motion),
    ...soundWritten(soundStyle(recipe)),
    ...stacksWritten(style),
    ...stageWritten(style),
    ...iconsWritten(style),
    "rank-colors": colorsWritten(style.rankColors),
    padding: style.paddingPx,
    "row-height": style.rowHeightPx,
    "row-gap": style.rowGapPx,
  };
}

export function decodeTopThreeStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TopThreeStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TOP_THREE_ACCEPTED);
  const style = topThreeStyle(recipe, exactFonts(font));
  assertTopThreeStyle(style);
  return { style: canonicalize(style) as unknown as TopThreeStyle, sound: sound(recipe) };
}

/**
 * The report answers for what the variant honours, and the decoder accepts more
 * than that. A Recipe carrying a board it never draws is still decodable, so it
 * is still reportable, and the board simply goes unmentioned.
 */
export function reportTopThreeStyle(recipe: SvsRecipe): Written {
  known(recipe, TOP_THREE_ACCEPTED);
  const style = topThreeStyle(recipe, []);
  return {
    ...typographyWritten(style.text),
    ...motionWritten(style.motion),
    ...soundWritten(soundStyle(recipe)),
    ...stacksWritten(style),
    ...iconsWritten(style),
    "slot-colors": colorsWritten(style.slotColors),
    "center-x": style.centerX,
    "baseline-y": style.baselineY,
    "slot-gap": style.slotGapPx,
    "ring-width": style.ringWidthPx,
    "label-gap": style.labelGapPx,
  };
}

export function decodeTypewriterListStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TypewriterListStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TYPEWRITER_ACCEPTED);
  const style = typewriterListStyle(recipe, exactFonts(font));
  assertTypewriterListStyle(style);
  return { style: canonicalize(style) as unknown as TypewriterListStyle, sound: sound(recipe) };
}

export function reportTypewriterListStyle(recipe: SvsRecipe): Written {
  known(recipe, TYPEWRITER_ACCEPTED);
  const style = typewriterListStyle(recipe, []);
  return {
    ...typographyWritten(style.title, "title-"),
    ...typographyWritten(style.item, "item-"),
    ...boardWritten(style.paper),
    ...soundWritten(soundStyle(recipe)),
    ...stacksWritten(style),
    "emphasis-color": style.emphasisColor,
    "winner-color": style.winnerColor,
    padding: style.paddingPx,
    "row-gap": style.rowGapPx,
    "title-gap": style.titleGapPx,
    rotation: style.rotationDeg,
    "frames-per-grapheme": style.framesPerGrapheme,
    "winner-frames": style.winnerFrames,
  };
}
