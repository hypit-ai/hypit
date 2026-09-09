import { createTemporalSpace, resolveTemporalContext } from "@hypit/temporal-markup";
import {
  assertEmptyElement as empty,
  assertAttributes as allowed,
  localName,
  textAttribute as text,
  optionalTextAttribute as optionalText,
  type StructuredElement,
  type StructuredSurfaceHandler,
  type SurfaceComponentDraft,
  type SurfaceRecordDraft,
  type SurfaceResolvedReference,
  type MarkupAttributeValue,
} from "@hypit/markup";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/protocol";
import { mediaTypes } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import { textTypes } from "@hypit/text";
import { createTemporalInstantProjection, createTemporalWindowProjection, temporalInstantAttributeNames } from "@hypit/temporal-markup";

import { createRankingFragment } from "./fragment.js";
import type { RankingFragmentItem, RankingFragmentSound } from "./fragment.js";
import { rankingTypes } from "./manifest.js";
import {
  assertRankingItemSpec,
  sealRankingHeader,
  sealRankingTextItemShell,
} from "./schedule.js";
import {
  decodeColumnStyle,
  decodeTierBoardStyle,
  decodeTopThreeStyle,
} from "./style.js";
import type {
  ColumnItemSpec,
  RankingItemSpec,
  RankingSoundStyle,
  RankingTextItemShell,
  RankingVariant,
  TierBoardItemSpec,
  TopThreeItemSpec,
} from "./types.js";

function integer(element: StructuredElement, name: string): number | undefined {
  const source = optionalText(element, name);
  if (source === undefined) return undefined;
  const value = Number(source);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer.`);
  return value;
}

function boolean(element: StructuredElement, name: string, fallback: boolean): boolean {
  const source = optionalText(element, name);
  if (source === undefined) return fallback;
  if (source === "true") return true;
  if (source === "false") return false;
  throw new Error(`${element.name}.${name} must be true or false.`);
}

function reference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function oneOfReference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: readonly TypeRef[],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !expected.some((type) => sameType(value.type, type))) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function inline<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value.value as unknown as T;
}

function styleSurface<T>(
  styleType: TypeRef,
  decode: (recipe: SvsRecipe, font: FontArtifactRef | FontStackRef) => { readonly style: T; readonly sound: RankingSoundStyle },
): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    allowed(element, ["id", "recipe", "font"]);
    empty(element);
    const id = text(element, "id");
    const recipeRef = reference(element.attributes.recipe, `${element.name}.recipe`, svsRecipeType, resolveReference);
    const fontRef = oneOfReference(element.attributes.font, `${element.name}.font`, [mediaTypes.fontArtifact, mediaTypes.fontStack], resolveReference);
    const decoded = decode(inline<SvsRecipe>(recipeRef, `${element.name}.recipe`), inline<FontArtifactRef | FontStackRef>(fontRef, `${element.name}.font`));
    return {
      records: [
        { id, type: styleType, value: { kind: "inline", value: decoded.style as unknown as CanonicalValue }, range: element.range },
        { id: `${id}.sound`, type: rankingTypes.soundStyle, value: { kind: "inline", value: decoded.sound as unknown as CanonicalValue }, range: element.range },
      ],
      components: [], fragments: [],
    };
  };
}

export const decodeTierBoardStyleSurface = styleSurface(rankingTypes.tierStyle, decodeTierBoardStyle);
export const decodeColumnStyleSurface = styleSurface(rankingTypes.columnStyle, decodeColumnStyle);
export const decodeTopThreeStyleSurface = styleSurface(rankingTypes.topThreeStyle, decodeTopThreeStyle);
function textValue(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): string | SurfaceResolvedReference {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return reference(raw, label, textTypes.text, resolve);
}

function itemIdentity(element: StructuredElement, suffix: string): string {
  return optionalText(element, "id") ?? `${localName(element.name).replace(/Item$/u, "").toLowerCase()}-${suffix}`;
}

function itemSpec(
  element: StructuredElement,
  variant: RankingVariant,
  suffix: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): { readonly spec: RankingItemSpec | RankingTextItemShell; readonly content?: SurfaceResolvedReference; readonly timed: boolean } {
  const id = itemIdentity(element, suffix);
  const stackingOrder = integer(element, "stack");
  let value: RankingItemSpec;
  if (variant === "tier-board") {
    allowed(element, ["id", "tier", "entry", "icon", "preset", "during", "stack"]);
    empty(element);
    const preset = boolean(element, "preset", false);
    const timed = element.attributes.during !== undefined;
    if (preset && timed) throw new Error(`${element.name} cannot combine preset=true with during.`);
    if (preset && element.attributes.entry !== undefined) throw new Error(`${element.name} preset Items do not have an entry mode.`);
    if (!preset && !timed) throw new Error(`${element.name} requires during unless preset=true.`);
    const common = { variant, id, tier: text(element, "tier"),
      ...(stackingOrder === undefined ? {} : { stackingOrder }) } as const;
    if (preset) value = { ...common, preset: true } satisfies TierBoardItemSpec;
    else {
      const entry = text(element, "entry");
      if (entry !== "direct" && entry !== "drop") throw new Error(`${element.name}.entry must be direct or drop.`);
      value = { ...common, preset: false, entry } satisfies TierBoardItemSpec;
    }
    assertRankingItemSpec(value);
    return { spec: value, timed };
  } else if (variant === "column") {
    allowed(element, ["id", "label", "icon", "rank", "preset", "during", "stack"]);
    empty(element);
    const rank = integer(element, "rank");
    if (rank === undefined || rank < 1) throw new Error(`${element.name}.rank must be a positive integer.`);
    const preset = boolean(element, "preset", false);
    const timed = element.attributes.during !== undefined;
    if (preset && timed) throw new Error(`${element.name} cannot combine preset=true with during.`);
    if (!preset && !timed) throw new Error(`${element.name} requires during unless preset=true.`);
    const label = textValue(element.attributes.label, `${element.name}.label`, resolve);
    if (typeof label === "string") value = {
      variant, id, label, rank, preset,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    } satisfies ColumnItemSpec;
    else return { spec: sealRankingTextItemShell({
      variant, id, rank, preset,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    }), content: label, timed };
    assertRankingItemSpec(value);
    return { spec: value, timed };
  } else if (variant === "top-three") {
    allowed(element, ["id", "label", "icon", ...temporalInstantAttributeNames, "stack"]);
    empty(element);
    const label = textValue(element.attributes.label, `${element.name}.label`, resolve);
    if (typeof label === "string") value = {
      variant, id, label,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    } satisfies TopThreeItemSpec;
    else return { spec: sealRankingTextItemShell({
      variant, id,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    }), content: label, timed: true };
    assertRankingItemSpec(value);
    return { spec: value, timed: true };
  }
  throw new Error(`${element.name} belongs to an unknown Ranking variant.`);
}

const variantDefinition = {
  "tier-board": { tag: "TierItem", style: rankingTypes.tierStyle },
  column: { tag: "ColumnItem", style: rankingTypes.columnStyle },
  "top-three": { tag: "TopThreeItem", style: rankingTypes.topThreeStyle },
} as const;

function rankingSurface(variant: RankingVariant): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    const common = ["id", "semantic", "space", "frame", "during", "terminal", "style", "appear-sound", "move-sound"];
    const attributes = variant === "column" || variant === "tier-board"
      ? [...common.filter((name) => name !== "terminal"), "canvas"]
      : common;
    allowed(element, attributes);
    const id = text(element, "id");
    const selected = variantDefinition[variant];
    const context = resolveTemporalContext({ element, resolveReference });
    const time = createTemporalSpace({ id, element, ...context });
    const canvas = variant === "column" || variant === "tier-board"
      ? reference(element.attributes.canvas, `${element.name}.canvas`, spatialTypes.canvas, resolveReference)
      : undefined;
    const frame = reference(element.attributes.frame, `${element.name}.frame`, spatialTypes.frame, resolveReference);
    const outerTemporal = createTemporalWindowProjection({ id: `${id}.outer`, subjectId: id, element, ...context, space: time.space, resolveReference });
    const terminalTemporal = variant === "top-three"
      ? createTemporalInstantProjection({
          id: `${id}.terminal`, subjectId: id, element, ...context, space: time.space, resolveReference,
          semanticAttribute: "terminal", projectedAttribute: false,
        })
      : undefined;
    const styleRaw = element.attributes.style;
    const style = reference(styleRaw, `${element.name}.style`, selected.style, resolveReference);
    const records: SurfaceRecordDraft[] = [...outerTemporal.records, ...(terminalTemporal?.records ?? [])];
    const temporalComponents: SurfaceComponentDraft[] = [...time.components, ...outerTemporal.components, ...(terminalTemporal?.components ?? [])];
    const temporalFragments = [...time.fragments, ...outerTemporal.fragments, ...(terminalTemporal?.fragments ?? [])];
    const headerId = `${id}.header`;
    records.push({
      id: headerId, type: rankingTypes.header,
      value: { kind: "inline", value: sealRankingHeader({ id, variant }) as unknown as CanonicalValue },
      range: element.range,
    });
    const inputs: Record<string, typeof time.space.ref> = {
      header: { kind: "record", id: headerId }, space: time.space.ref, frame: frame.ref,
      outer: outerTemporal.ref, style: style.ref,
      ...(canvas === undefined ? {} : { canvas: canvas.ref }),
      ...(terminalTemporal === undefined ? {} : { terminal: terminalTemporal.ref }),
    };
    const items: RankingFragmentItem[] = [];
    const itemIds = new Set<string>();
    let index = 0;
    let hasDrop = false;
    for (const child of element.children) {
      if (child.kind === "text") {
        if (child.value.trim().length > 0) throw new Error(`${element.name} accepts ${selected.tag} children only.`);
        continue;
      }
      if (localName(child.name) !== selected.tag) throw new Error(`${element.name} accepts ${selected.tag} children only.`);
      index += 1;
      const suffix = String(index).padStart(4, "0");
      const authored = itemSpec(child, variant, suffix, resolveReference);
      const spec = authored.spec;
      if (itemIds.has(spec.id)) throw new Error(`${element.name} has duplicate Item id ${spec.id}.`);
      itemIds.add(spec.id);
      hasDrop ||= spec.variant === "tier-board" && !spec.preset && spec.entry === "drop";
      const specId = `${id}.item.${suffix}.spec`;
      const specName = `item-${suffix}-spec`;
      records.push({ id: specId, type: authored.content === undefined ? rankingTypes.itemSpec : rankingTypes.textItemShell, value: { kind: "inline", value: spec as unknown as CanonicalValue }, range: child.range });
      inputs[specName] = { kind: "record", id: specId };
      const contentName = authored.content === undefined ? undefined : `item-${suffix}-content`;
      if (authored.content !== undefined) inputs[contentName!] = authored.content.ref;
      const itemTemporal = !authored.timed ? undefined : variant === "top-three"
        ? createTemporalInstantProjection({ id: `${id}.item.${suffix}`, subjectId: spec.id, element: child, ...context, space: time.space, resolveReference })
        : createTemporalWindowProjection({ id: `${id}.item.${suffix}`, subjectId: spec.id, element: child, ...context, space: time.space, resolveReference });
      if (itemTemporal !== undefined) {
        records.push(...itemTemporal.records);
        temporalComponents.push(...itemTemporal.components);
        temporalFragments.push(...itemTemporal.fragments);
      }
      const timingName = itemTemporal === undefined ? undefined : `item-${suffix}-timing`;
      if (itemTemporal !== undefined) inputs[timingName!] = itemTemporal.ref;
      let iconName: string | undefined;
      if (variant === "tier-board" || child.attributes.icon !== undefined) {
        const icon = reference(child.attributes.icon, `${child.name}.icon`, mediaTypes.blobArtifact, resolveReference);
        iconName = `item-${suffix}-icon`;
        inputs[iconName] = icon.ref;
      }
      items.push({ suffix, specName,
        ...(contentName === undefined ? {} : { contentName }),
        ...(iconName === undefined ? {} : { iconName }),
        ...(timingName === undefined ? {} : { timingName }),
      });
    }
    if (items.length === 0) throw new Error(`${element.name} requires at least one ${selected.tag}.`);
    const sound: RankingFragmentSound = {
      ...(element.attributes["appear-sound"] === undefined ? {} : { appearName: "appear-sound" }),
      ...(element.attributes["move-sound"] === undefined ? {} : { moveName: "move-sound" }),
    };
    if (sound.moveName !== undefined && variant === "top-three") throw new Error(`${element.name} has no move sound phase.`);
    if (sound.moveName !== undefined && variant === "tier-board" && !hasDrop) throw new Error(`${element.name}.move-sound requires one drop TierItem.`);
    for (const [attribute, inputName] of [["appear-sound", sound.appearName], ["move-sound", sound.moveName]] as const) {
      if (inputName === undefined) continue;
      inputs[inputName] = reference(element.attributes[attribute], `${element.name}.${attribute}`, mediaTypes.synchronized, resolveReference).ref;
    }
    if (sound.appearName !== undefined || sound.moveName !== undefined) {
      if (typeof styleRaw !== "object" || styleRaw.kind !== "reference") throw new Error(`${element.name}.style must be a reference.`);
      const soundStyle = resolveReference(`${styleRaw.path}.sound`);
      if (soundStyle === undefined || !sameType(soundStyle.type, rankingTypes.soundStyle)) {
        throw new Error(`${element.name}.style does not expose its Ranking sound style.`);
      }
      inputs["sound-style"] = soundStyle.ref;
    }
    const fragment = createRankingFragment(variant, items, sound);
    return {
      records,
      components: [...temporalComponents, {
        id, fragment: fragment.id, inputs,
        outputs: {
          schedule: `${id}.schedule`, program: `${id}.program`, visual: `${id}.visual`,
          ...(sound.appearName === undefined && sound.moveName === undefined ? {} : { audio: `${id}.audio` }),
        },
        range: element.range,
      }],
      fragments: [...temporalFragments, fragment],
      exports: [`${id}.schedule`, `${id}.program`, `${id}.visual`, ...(sound.appearName === undefined && sound.moveName === undefined ? [] : [`${id}.audio`])],
    };
  };
}

export const decodeTierBoardSurface = rankingSurface("tier-board");
export const decodeColumnSurface = rankingSurface("column");
export const decodeTopThreeSurface = rankingSurface("top-three");
