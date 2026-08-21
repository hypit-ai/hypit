import {
  assertEmptyElement as empty,
  assertAttributes as allowed,
  localName,
  textAttribute as text,
  optionalTextAttribute as optionalText,
  type StructuredElement,
  type StructuredSurfaceHandler,
  type SurfaceRecordDraft,
  type SurfaceResolvedReference,
  type MarkupAttributeValue,
} from "@hypit/markup";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/protocol";
import { mediaTypes } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import { textTypes } from "@hypit/text";

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
  decodeTopThreeStyle,
} from "./style.js";
import type {
  ColumnItemSpec,
  RankingItemSpec,
  RankingSoundStyle,
  RankingTextItemShell,
  RankingVariant,
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
): { readonly spec: RankingItemSpec | RankingTextItemShell; readonly content?: SurfaceResolvedReference; readonly timing?: SurfaceResolvedReference } {
  const id = itemIdentity(element, suffix);
  const stackingOrder = integer(element, "stack");
  let value: RankingItemSpec;
  if (variant === "column") {
    allowed(element, ["id", "label", "icon", "rank", "preset", "during", "stack"]);
    empty(element);
    const rank = integer(element, "rank");
    if (rank === undefined || rank < 1) throw new Error(`${element.name}.rank must be a positive integer.`);
    const preset = boolean(element, "preset", false);
    const timing = element.attributes.during === undefined ? undefined
      : reference(element.attributes.during, `${element.name}.during`, narrativeTypes.selection, resolve);
    if (preset && timing !== undefined) throw new Error(`${element.name} cannot combine preset=true with during.`);
    if (!preset && timing === undefined) throw new Error(`${element.name} requires during unless preset=true.`);
    const label = textValue(element.attributes.label, `${element.name}.label`, resolve);
    if (typeof label === "string") value = {
      variant, id, label, rank, preset,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    } satisfies ColumnItemSpec;
    else return { spec: sealRankingTextItemShell({
      variant, id, rank, preset,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    }), content: label, ...(timing === undefined ? {} : { timing }) };
    assertRankingItemSpec(value);
    return { spec: value, ...(timing === undefined ? {} : { timing }) };
  } else if (variant === "top-three") {
    allowed(element, ["id", "label", "icon", "stack"]);
    empty(element);
    const label = textValue(element.attributes.label, `${element.name}.label`, resolve);
    if (typeof label === "string") value = {
      variant, id, label,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    } satisfies TopThreeItemSpec;
    else return { spec: sealRankingTextItemShell({
      variant, id,
      ...(stackingOrder === undefined ? {} : { stackingOrder }),
    }), content: label };
  } else throw new Error(`${element.name} belongs to an unknown Ranking variant.`);
  assertRankingItemSpec(value);
  return { spec: value };
}

const variantDefinition = {
  column: { tag: "ColumnItem", style: rankingTypes.columnStyle },
  "top-three": { tag: "TopThreeItem", style: rankingTypes.topThreeStyle },
} as const;

function rankingSurface(variant: RankingVariant): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    const common = ["id", "semantic", "frame", "during", "triggers", "terminal", "style", "appear-sound", "move-sound"];
    const attributes = variant === "column"
      ? [...common.filter((name) => name !== "triggers" && name !== "terminal"), "canvas"]
      : common;
    allowed(element, attributes);
    const id = text(element, "id");
    const selected = variantDefinition[variant];
    const semantic = reference(element.attributes.semantic, `${element.name}.semantic`, semanticTrackTypes.track, resolveReference);
    const canvas = variant === "column"
      ? reference(element.attributes.canvas, `${element.name}.canvas`, spatialTypes.canvas, resolveReference)
      : undefined;
    const frame = reference(element.attributes.frame, `${element.name}.frame`, spatialTypes.frame, resolveReference);
    const outer = variant === "column"
      ? oneOfReference(element.attributes.during, `${element.name}.during`, [narrativeTypes.selection, narrativeTypes.excerpt], resolveReference)
      : reference(element.attributes.during, `${element.name}.during`, narrativeTypes.selection, resolveReference);
    const triggers = variant === "column" ? undefined
      : reference(element.attributes.triggers, `${element.name}.triggers`, narrativeTypes.moment, resolveReference);
    const terminal = variant === "column" ? undefined
      : reference(element.attributes.terminal, `${element.name}.terminal`, narrativeTypes.moment, resolveReference);
    const styleRaw = element.attributes.style;
    const style = reference(styleRaw, `${element.name}.style`, selected.style, resolveReference);
    const records: SurfaceRecordDraft[] = [];
    const headerId = `${id}.header`;
    records.push({
      id: headerId, type: rankingTypes.header,
      value: { kind: "inline", value: sealRankingHeader({ id, variant }) as unknown as CanonicalValue },
      range: element.range,
    });
    const inputs: Record<string, typeof semantic.ref> = {
      header: { kind: "record", id: headerId }, semantic: semantic.ref, frame: frame.ref,
      outer: outer.ref, style: style.ref,
      ...(canvas === undefined ? {} : { canvas: canvas.ref }),
      ...(triggers === undefined ? {} : { triggers: triggers.ref }),
      ...(terminal === undefined ? {} : { terminal: terminal.ref }),
    };
    const items: RankingFragmentItem[] = [];
    const itemIds = new Set<string>();
    let index = 0;
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
      const specId = `${id}.item.${suffix}.spec`;
      const specName = `item-${suffix}-spec`;
      records.push({ id: specId, type: authored.content === undefined ? rankingTypes.itemSpec : rankingTypes.textItemShell, value: { kind: "inline", value: spec as unknown as CanonicalValue }, range: child.range });
      inputs[specName] = { kind: "record", id: specId };
      const contentName = authored.content === undefined ? undefined : `item-${suffix}-content`;
      if (authored.content !== undefined) inputs[contentName!] = authored.content.ref;
      const timingName = authored.timing === undefined ? undefined : `item-${suffix}-timing`;
      if (authored.timing !== undefined) inputs[timingName!] = authored.timing.ref;
      let iconName: string | undefined;
      if (child.attributes.icon !== undefined) {
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
    const outerKind = sameType(outer.type, narrativeTypes.excerpt) ? "segment" : "selection";
    const fragment = createRankingFragment(variant, items, sound, outerKind);
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

export const decodeColumnSurface = rankingSurface("column");
export const decodeTopThreeSurface = rankingSurface("top-three");
