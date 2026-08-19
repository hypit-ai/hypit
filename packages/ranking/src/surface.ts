import { mediaTypes } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { semanticMapTypes } from "@hypit/semantic-map";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import { textTypes } from "@hypit/text";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";

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

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function allowed(element: StructuredElement, names: readonly string[]): void {
  const permit = new Set(names);
  const unknown = Object.keys(element.attributes).filter((name) => !permit.has(name));
  if (unknown.length > 0) throw new Error(`${element.name} has unsupported attributes ${unknown.join(", ")}.`);
}

function empty(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
}

function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function integer(element: StructuredElement, name: string): number | undefined {
  const source = optionalText(element, name);
  if (source === undefined) return undefined;
  const value = Number(source);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer.`);
  return value;
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

function localName(element: StructuredElement): string {
  return element.name.slice(element.name.lastIndexOf(":") + 1);
}

function textValue(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): string | SurfaceResolvedReference {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return reference(raw, label, textTypes.text, resolve);
}

function itemIdentity(element: StructuredElement, suffix: string): string {
  return optionalText(element, "id") ?? `${localName(element).replace(/Item$/u, "").toLowerCase()}-${suffix}`;
}

function itemSpec(
  element: StructuredElement,
  variant: RankingVariant,
  suffix: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): { readonly spec: RankingItemSpec | RankingTextItemShell; readonly content?: SurfaceResolvedReference } {
  const id = itemIdentity(element, suffix);
  const stackingOrder = integer(element, "stack");
  let value: RankingItemSpec;
  if (variant === "tier-board") {
    allowed(element, ["id", "tier", "entry", "icon", "stack"]);
    empty(element);
    const entry = text(element, "entry", "direct");
    if (entry !== "direct" && entry !== "stage") throw new Error(`${element.name}.entry must be direct or stage.`);
    value = {
      variant, id, tier: text(element, "tier"), entry,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    } satisfies TierBoardItemSpec;
  } else if (variant === "column" || variant === "top-three") {
    allowed(element, ["id", "label", "icon", "stack"]);
    empty(element);
    const label = textValue(element.attributes.label, `${element.name}.label`, resolve);
    if (typeof label !== "string") return { spec: sealRankingTextItemShell({
      variant, id,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    }), content: label };
    value = {
      variant, id, label,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    } satisfies ColumnItemSpec | TopThreeItemSpec;
  } else throw new Error(`${element.name} belongs to an unknown Ranking variant.`);
  assertRankingItemSpec(value);
  return { spec: value };
}

const variantDefinition = {
  "tier-board": { tag: "TierItem", style: rankingTypes.tierStyle },
  column: { tag: "ColumnItem", style: rankingTypes.columnStyle },
  "top-three": { tag: "TopThreeItem", style: rankingTypes.topThreeStyle },
} as const;

function rankingSurface(variant: RankingVariant): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    allowed(element, ["id", "map", "space", "frame", "during", "triggers", "terminal", "style", "appear-sound", "move-sound"]);
    const id = text(element, "id");
    const selected = variantDefinition[variant];
    const map = reference(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolveReference);
    const space = reference(element.attributes.space, `${element.name}.space`, programSpaceTypes.programSpace, resolveReference);
    const frame = reference(element.attributes.frame, `${element.name}.frame`, spatialTypes.frame, resolveReference);
    const outer = reference(element.attributes.during, `${element.name}.during`, narrativeTypes.selection, resolveReference);
    const triggers = reference(element.attributes.triggers, `${element.name}.triggers`, narrativeTypes.moment, resolveReference);
    const terminal = reference(element.attributes.terminal, `${element.name}.terminal`, narrativeTypes.moment, resolveReference);
    const styleRaw = element.attributes.style;
    const style = reference(styleRaw, `${element.name}.style`, selected.style, resolveReference);
    const records: SurfaceRecordDraft[] = [];
    const headerId = `${id}.header`;
    records.push({
      id: headerId, type: rankingTypes.header,
      value: { kind: "inline", value: sealRankingHeader({ id, variant }) as unknown as CanonicalValue },
      range: element.range,
    });
    const inputs: Record<string, typeof map.ref> = {
      header: { kind: "record", id: headerId }, map: map.ref, space: space.ref, frame: frame.ref,
      outer: outer.ref, triggers: triggers.ref, terminal: terminal.ref, style: style.ref,
    };
    const items: RankingFragmentItem[] = [];
    const itemIds = new Set<string>();
    let index = 0;
    let hasStage = false;
    for (const child of element.children) {
      if (child.kind === "text") {
        if (child.value.trim().length > 0) throw new Error(`${element.name} accepts ${selected.tag} children only.`);
        continue;
      }
      if (localName(child) !== selected.tag) throw new Error(`${element.name} accepts ${selected.tag} children only.`);
      index += 1;
      const suffix = String(index).padStart(4, "0");
      const authored = itemSpec(child, variant, suffix, resolveReference);
      const spec = authored.spec;
      if (itemIds.has(spec.id)) throw new Error(`${element.name} has duplicate Item id ${spec.id}.`);
      itemIds.add(spec.id);
      hasStage ||= spec.variant === "tier-board" && spec.entry === "stage";
      const specId = `${id}.item.${suffix}.spec`;
      const specName = `item-${suffix}-spec`;
      records.push({ id: specId, type: authored.content === undefined ? rankingTypes.itemSpec : rankingTypes.textItemShell, value: { kind: "inline", value: spec as unknown as CanonicalValue }, range: child.range });
      inputs[specName] = { kind: "record", id: specId };
      const contentName = authored.content === undefined ? undefined : `item-${suffix}-content`;
      if (authored.content !== undefined) inputs[contentName!] = authored.content.ref;
      let iconName: string | undefined;
      if (variant === "tier-board" || child.attributes.icon !== undefined) {
        const icon = reference(child.attributes.icon, `${child.name}.icon`, mediaTypes.blobArtifact, resolveReference);
        iconName = `item-${suffix}-icon`;
        inputs[iconName] = icon.ref;
      }
      items.push({ suffix, specName, ...(contentName === undefined ? {} : { contentName }), ...(iconName === undefined ? {} : { iconName }) });
    }
    if (items.length === 0) throw new Error(`${element.name} requires at least one ${selected.tag}.`);
    const sound: RankingFragmentSound = {
      ...(element.attributes["appear-sound"] === undefined ? {} : { appearName: "appear-sound" }),
      ...(element.attributes["move-sound"] === undefined ? {} : { moveName: "move-sound" }),
    };
    if (sound.moveName !== undefined && variant === "top-three") throw new Error(`${element.name} has no move sound phase.`);
    if (sound.moveName !== undefined && variant === "tier-board" && !hasStage) throw new Error(`${element.name}.move-sound requires one staged TierItem.`);
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
      components: [{
        id, fragment: fragment.id, inputs,
        outputs: {
          schedule: `${id}.schedule`, program: `${id}.program`, visual: `${id}.visual`,
          ...(sound.appearName === undefined && sound.moveName === undefined ? {} : { audio: `${id}.audio` }),
        },
        range: element.range,
      }],
      fragments: [fragment],
    };
  };
}

export const decodeTierBoardSurface = rankingSurface("tier-board");
export const decodeColumnSurface = rankingSurface("column");
export const decodeTopThreeSurface = rankingSurface("top-three");
