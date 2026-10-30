import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationCompiler, type AuthorResolvedReference, type AuthorValueRef } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes, type FontArtifactRef, type FontStackRef } from "@hypit/media";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { textTypes } from "@hypit/hypit/text";
import { resolveAuthorInstant, resolveAuthorTimeline, resolveAuthorWindow,
  temporalContextFieldShape, temporalInstantFieldShape, temporalWindowFieldShape } from "@hypit/temporal/author";

import { createRankingFragment, type RankingFragmentItem, type RankingFragmentSound } from "./fragment.js";
import { rankingModuleRef, rankingTypes } from "./manifest.js";
import { assertRankingItemSpec, sealRankingHeader, sealRankingTextItemShell } from "./schedule.js";
import { decodeColumnStyle, decodeTierBoardStyle, decodeTopThreeStyle } from "./style.js";
import type { ColumnItemSpec, RankingItemSpec, RankingSoundStyle, RankingTextItemShell,
  RankingVariant, TierBoardItemSpec, TopThreeItemSpec } from "./types.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Ranking ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  return declarationField(declaration, name) === undefined ? undefined : literal(declaration, name);
}

function integer(declaration: DeclarationLike, name: string): number | undefined {
  const source = optionalLiteral(declaration, name);
  if (source === undefined) return undefined;
  const value = Number(source);
  if (!Number.isSafeInteger(value)) throw new Error(`Ranking ${declaration.name}.${name} must be an integer.`);
  return value;
}

function flag(declaration: DeclarationLike, name: string, fallback: boolean): boolean {
  const source = optionalLiteral(declaration, name);
  if (source === undefined) return fallback;
  if (source === "true") return true;
  if (source === "false") return false;
  throw new Error(`Ranking ${declaration.name}.${name} must be true or false.`);
}

async function reference(declaration: DeclarationLike, name: string, expected: readonly TypeRef[],
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Ranking ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !expected.some((type) => sameType(value.type, type))) {
    throw new Error(`Ranking ${declaration.name}.${name} has the wrong Type.`);
  }
  return value;
}

function authored<T>(value: AuthorResolvedReference, label: string): T {
  if (value.record === undefined) throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value as unknown as T;
}

const styleFields = (type: TypeRef) => [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the Ranking style." },
  { name: "recipe", kind: "reference" as const, required: true, accepts: [recipeType], summary: "Selects the Ranking Recipe." },
  { name: "font", kind: "reference" as const, required: true,
    accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack], summary: `Selects the font for ${type.name}.` },
];

function styleCompiler<T>(options: { declaration: "tier-style" | "column-style" | "top-three-style";
  type: TypeRef; decode: (recipe: Recipe, font: FontArtifactRef | FontStackRef) =>
    { readonly style: T; readonly sound: RankingSoundStyle } }): AuthorDeclarationCompiler {
  return {
    module: rankingModuleRef,
    declaration: options.declaration,
    outputs: [options.type, rankingTypes.soundStyle],
    shape: { summary: `Compiles ${options.type.name} and its sound style.`, fields: styleFields(options.type) },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [
        { name: id, ref: { kind: "record", id }, type: options.type },
        { name: `${id}.sound`, ref: { kind: "record", id: `${id}.sound` }, type: rankingTypes.soundStyle },
      ];
    },
    async compile({ declaration, resolveReference }) {
      const id = literal(declaration, "id");
      const recipe = await reference(declaration, "recipe", [recipeType], resolveReference);
      const font = await reference(declaration, "font", [mediaTypes.fontArtifact, mediaTypes.fontStack], resolveReference);
      const decoded = options.decode(authored<Recipe>(recipe, "Ranking recipe"),
        authored<FontArtifactRef | FontStackRef>(font, "Ranking font"));
      return { records: [
        { id, type: options.type, value: decoded.style as unknown as CanonicalValue, range: declaration.range },
        { id: `${id}.sound`, type: rankingTypes.soundStyle,
          value: decoded.sound as unknown as CanonicalValue, range: declaration.range },
      ], components: [] };
    },
  };
}

export const tierBoardStyleAuthorDeclaration = styleCompiler({ declaration: "tier-style",
  type: rankingTypes.tierStyle, decode: decodeTierBoardStyle });
export const columnStyleAuthorDeclaration = styleCompiler({ declaration: "column-style",
  type: rankingTypes.columnStyle, decode: decodeColumnStyle });
export const topThreeStyleAuthorDeclaration = styleCompiler({ declaration: "top-three-style",
  type: rankingTypes.topThreeStyle, decode: decodeTopThreeStyle });

async function textValue(declaration: AuthorDeclarationChild, name: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<string | AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind === "literal" && field.value.trim().length > 0) return field.value.trim();
  return await reference(declaration, name, [textTypes.text], resolve);
}

function itemIdentity(declaration: AuthorDeclarationChild, suffix: string): string {
  return optionalLiteral(declaration, "id") ?? `${declaration.name.replace(/Item$/u, "").toLowerCase()}-${suffix}`;
}

async function itemSpec(declaration: AuthorDeclarationChild, variant: RankingVariant, suffix: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<{ spec: RankingItemSpec | RankingTextItemShell; content?: AuthorResolvedReference; timed: boolean }> {
  const id = itemIdentity(declaration, suffix);
  const stackingOrder = integer(declaration, "stack");
  if (variant === "tier-board") {
    const preset = flag(declaration, "preset", false);
    const timed = declarationField(declaration, "during") !== undefined;
    if (preset && timed) throw new Error("TierItem cannot combine preset=true with during.");
    if (preset && declarationField(declaration, "entry") !== undefined) throw new Error("Preset TierItems do not have an entry mode.");
    if (!preset && !timed) throw new Error("TierItem requires during unless preset=true.");
    const common = { variant, id, tier: literal(declaration, "tier"),
      ...(stackingOrder === undefined ? {} : { stackingOrder }) } as const;
    let value: TierBoardItemSpec;
    if (preset) value = { ...common, preset: true };
    else {
      const entry = literal(declaration, "entry");
      if (entry !== "direct" && entry !== "drop") throw new Error("TierItem.entry must be direct or drop.");
      value = { ...common, preset: false, entry };
    }
    assertRankingItemSpec(value);
    return { spec: value, timed };
  }
  if (variant === "column") {
    const rank = integer(declaration, "rank");
    if (rank === undefined || rank < 1) throw new Error("ColumnItem.rank must be a positive integer.");
    const preset = flag(declaration, "preset", false);
    const timed = declarationField(declaration, "during") !== undefined;
    if (preset && timed) throw new Error("ColumnItem cannot combine preset=true with during.");
    if (!preset && !timed) throw new Error("ColumnItem requires during unless preset=true.");
    const label = await textValue(declaration, "label", resolve);
    if (typeof label === "string") {
      const value: ColumnItemSpec = { variant, id, label, rank, preset,
        ...(stackingOrder === undefined ? {} : { stackingOrder }) };
      assertRankingItemSpec(value);
      return { spec: value, timed };
    }
    return { spec: sealRankingTextItemShell({ variant, id, rank, preset,
      ...(stackingOrder === undefined ? {} : { stackingOrder }) }), content: label, timed };
  }
  const label = await textValue(declaration, "label", resolve);
  if (typeof label === "string") {
    const value: TopThreeItemSpec = { variant, id, label,
      ...(stackingOrder === undefined ? {} : { stackingOrder }) };
    assertRankingItemSpec(value);
    return { spec: value, timed: true };
  }
  return { spec: sealRankingTextItemShell({ variant, id,
    ...(stackingOrder === undefined ? {} : { stackingOrder }) }), content: label, timed: true };
}

const commonTrackFields = [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the Ranking program." },
  temporalContextFieldShape,
  { name: "frame", kind: "reference" as const, required: true, accepts: [spatialTypes.frame], summary: "Selects the board Frame." },
  temporalWindowFieldShape,
  { name: "appear-sound", kind: "reference" as const, required: false, accepts: [mediaTypes.prepared], summary: "Selects the appear sound." },
];

function trackCompiler(variant: RankingVariant): AuthorDeclarationCompiler {
  const selected = variant === "tier-board"
    ? { declaration: "tier" as const, child: "TierItem", style: rankingTypes.tierStyle, program: rankingTypes.tierProgram }
    : variant === "column"
      ? { declaration: "column" as const, child: "ColumnItem", style: rankingTypes.columnStyle, program: rankingTypes.columnProgram }
      : { declaration: "top-three" as const, child: "TopThreeItem", style: rankingTypes.topThreeStyle, program: rankingTypes.topThreeProgram };
  const windowed = variant !== "top-three";
  const childFields = variant === "tier-board" ? [
    { name: "id", kind: "identifier" as const, required: false, summary: "Names the Item." },
    { name: "tier", kind: "literal" as const, required: true, summary: "Selects the target tier." },
    { name: "entry", kind: "literal" as const, required: false, values: ["direct", "drop"], summary: "Selects the reveal mode." },
    { name: "icon", kind: "reference" as const, required: true, accepts: [mediaTypes.blobArtifact], summary: "Selects the Item icon." },
    { name: "preset", kind: "literal" as const, required: false, values: ["true", "false"], summary: "Settles the Item from the start." },
    { ...temporalWindowFieldShape, required: false },
    { name: "stack", kind: "literal" as const, required: false, summary: "Overrides Item draw order." },
  ] : variant === "column" ? [
    { name: "id", kind: "identifier" as const, required: false, summary: "Names the Item." },
    { name: "label", kind: "expression" as const, required: true, accepts: [textTypes.text], summary: "States or selects the Item label." },
    { name: "icon", kind: "reference" as const, required: false, accepts: [mediaTypes.blobArtifact], summary: "Selects the Item icon." },
    { name: "rank", kind: "literal" as const, required: true, summary: "Sets the rank." },
    { name: "preset", kind: "literal" as const, required: false, values: ["true", "false"], summary: "Settles the Item from the start." },
    { ...temporalWindowFieldShape, required: false },
    { name: "stack", kind: "literal" as const, required: false, summary: "Overrides Item draw order." },
  ] : [
    { name: "id", kind: "identifier" as const, required: false, summary: "Names the Item." },
    { name: "label", kind: "expression" as const, required: true, accepts: [textTypes.text], summary: "States or selects the Item label." },
    { name: "icon", kind: "reference" as const, required: false, accepts: [mediaTypes.blobArtifact], summary: "Selects the Item icon." },
    temporalInstantFieldShape,
    { name: "stack", kind: "literal" as const, required: false, summary: "Overrides Item draw order." },
  ];
  return {
    module: rankingModuleRef,
    declaration: selected.declaration,
    outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell,
      rankingTypes.schedule, selected.program, compositionTypes.visualTrack,
      rankingTypes.soundEvents, compositionTypes.audioTrack],
    shape: { summary: `Builds one ${variant} Ranking Track.`, fields: [
      ...commonTrackFields,
      ...(windowed ? [
        { name: "within", kind: "reference" as const, required: true, accepts: [spatialTypes.frame], summary: "Selects the placement Frame." },
        { name: "move-sound", kind: "reference" as const, required: false, accepts: [mediaTypes.prepared], summary: "Selects the move sound." },
      ] : [
        { name: "terminal", kind: "expression" as const, required: true, accepts: [temporalInstantFieldShape.accepts![0]!], summary: "Selects the terminal Instant." },
      ]),
      { name: "style", kind: "reference", required: true, accepts: [selected.style], summary: "Selects the matching Ranking style." },
    ], children: [{ name: selected.child, cardinality: "many", summary: "Declares one Ranking Item.", fields: childFields }] },
    bindings(declaration) {
      const id = literal(declaration, "id");
      const sound = declarationField(declaration, "appear-sound") !== undefined
        || declarationField(declaration, "move-sound") !== undefined;
      return [
        { name: `${id}.schedule`, ref: { kind: "component-output", component: id, output: "schedule" }, type: rankingTypes.schedule },
        { name: `${id}.program`, ref: { kind: "component-output", component: id, output: "program" }, type: selected.program },
        { name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack },
        ...(sound ? [
          { name: `${id}.events`, ref: { kind: "component-output" as const, component: id, output: "events" }, type: rankingTypes.soundEvents },
          { name: `${id}.audio`, ref: { kind: "component-output" as const, component: id, output: "audio" }, type: compositionTypes.audioTrack },
        ] : []),
      ];
    },
    async compile({ declaration, resolveReference }) {
      if (declaration.children.length === 0) throw new Error(`Ranking ${selected.declaration} requires at least one ${selected.child}.`);
      const id = literal(declaration, "id");
      const timeline = await resolveAuthorTimeline(declaration, resolveReference);
      const frame = await reference(declaration, "frame", [spatialTypes.frame], resolveReference);
      const outer = await resolveAuthorWindow(declaration, resolveReference);
      const within = windowed ? await reference(declaration, "within", [spatialTypes.frame], resolveReference) : undefined;
      const terminal = !windowed ? await resolveAuthorInstant(declaration, resolveReference, "terminal") : undefined;
      const style = await reference(declaration, "style", [selected.style], resolveReference);
      const headerId = `${id}.header`;
      const records: { id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }[] = [{
        id: headerId, type: rankingTypes.header,
        value: sealRankingHeader({ id, variant }) as unknown as CanonicalValue, range: declaration.range,
      }];
      const inputs: Record<string, AuthorValueRef> = { header: { kind: "record", id: headerId },
        timeline: timeline.ref, frame: frame.ref, outer: outer.ref, style: style.ref,
        ...(within === undefined ? {} : { within: within.ref }),
        ...(terminal === undefined ? {} : { terminal: terminal.ref }) };
      const items: RankingFragmentItem[] = [];
      const itemIds = new Set<string>();
      let hasDrop = false;
      for (const child of declaration.children) {
        if (child.name !== selected.child) throw new Error(`Ranking ${selected.declaration} does not accept ${child.name}.`);
        const suffix = String(items.length + 1).padStart(4, "0");
        const authored = await itemSpec(child, variant, suffix, resolveReference);
        if (itemIds.has(authored.spec.id)) throw new Error(`Ranking has duplicate Item id ${authored.spec.id}.`);
        itemIds.add(authored.spec.id);
        hasDrop ||= authored.spec.variant === "tier-board" && !authored.spec.preset && authored.spec.entry === "drop";
        const specId = `${id}.item.${suffix}.spec`;
        const specName = `item-${suffix}-spec`;
        records.push({ id: specId,
          type: authored.content === undefined ? rankingTypes.itemSpec : rankingTypes.textItemShell,
          value: authored.spec as unknown as CanonicalValue, range: child.range ?? declaration.range });
        inputs[specName] = { kind: "record", id: specId };
        const contentName = authored.content === undefined ? undefined : `item-${suffix}-content`;
        if (authored.content !== undefined) inputs[contentName!] = authored.content.ref;
        const timing = !authored.timed ? undefined : variant === "top-three"
          ? await resolveAuthorInstant(child, resolveReference)
          : await resolveAuthorWindow(child, resolveReference);
        const timingName = timing === undefined ? undefined : `item-${suffix}-timing`;
        if (timing !== undefined) inputs[timingName!] = timing.ref;
        let iconName: string | undefined;
        if (variant === "tier-board" || declarationField(child, "icon") !== undefined) {
          const icon = await reference(child, "icon", [mediaTypes.blobArtifact], resolveReference);
          iconName = `item-${suffix}-icon`;
          inputs[iconName] = icon.ref;
        }
        items.push({ suffix, specName,
          ...(contentName === undefined ? {} : { contentName }),
          ...(iconName === undefined ? {} : { iconName }),
          ...(timingName === undefined ? {} : { timingName }) });
      }
      const sound: RankingFragmentSound = {
        ...(declarationField(declaration, "appear-sound") === undefined ? {} : { appearName: "appear-sound" }),
        ...(declarationField(declaration, "move-sound") === undefined ? {} : { moveName: "move-sound" }),
      };
      if (sound.moveName !== undefined && variant === "tier-board" && !hasDrop) {
        throw new Error("Ranking move-sound requires one drop TierItem.");
      }
      for (const [attribute, name] of [["appear-sound", sound.appearName], ["move-sound", sound.moveName]] as const) {
        if (name !== undefined) inputs[name] = (await reference(declaration, attribute, [mediaTypes.prepared], resolveReference)).ref;
      }
      if (sound.appearName !== undefined || sound.moveName !== undefined) {
        const field = declarationField(declaration, "style");
        if (field?.kind !== "reference") throw new Error("Ranking style must be a reference when sound is authored.");
        const soundStyle = await resolveReference(`${field.path}.sound`);
        if (soundStyle === undefined || !sameType(soundStyle.type, rankingTypes.soundStyle)) {
          throw new Error("Ranking style does not expose its sound style.");
        }
        inputs["sound-style"] = soundStyle.ref;
      }
      const hasSound = sound.appearName !== undefined || sound.moveName !== undefined;
      return { records, components: [{ id, fragment: createRankingFragment(variant, items, sound), inputs,
        outputs: { schedule: `${id}.schedule`, program: `${id}.program`, visual: `${id}.visual`,
          ...(hasSound ? { events: `${id}.events`, audio: `${id}.audio` } : {}) }, range: declaration.range }] };
    },
  };
}

export const tierBoardAuthorDeclaration = trackCompiler("tier-board");
export const columnAuthorDeclaration = trackCompiler("column");
export const topThreeAuthorDeclaration = trackCompiler("top-three");

export const rankingAuthorDeclarations = [tierBoardStyleAuthorDeclaration, columnStyleAuthorDeclaration,
  topThreeStyleAuthorDeclaration, tierBoardAuthorDeclaration, columnAuthorDeclaration,
  topThreeAuthorDeclaration] as const;
export const rankingMarkupDeclarations = [
  { name: "tier-style", tag: "TierBoardStyle" }, { name: "column-style", tag: "ColumnStyle" },
  { name: "top-three-style", tag: "TopThreeStyle" }, { name: "tier", tag: "TierBoard" },
  { name: "column", tag: "Column" }, { name: "top-three", tag: "TopThree" },
] as const;
