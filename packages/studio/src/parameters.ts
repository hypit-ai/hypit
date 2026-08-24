import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  StudioParameter,
  StudioParameterDeclaration,
  StudioRecipeReferenceDeclaration,
  StudioEntityDraft,
  StudioPlacement,
  StudioEditHandle,
  StudioSemanticTimeline,
  StudioTemporalLineage,
  StudioTimelineEditDeclaration,
} from "@hypit/studio-adapter";
import type { MarkupSurfaceRegistryLike, SurfaceRecipePropertyVocabulary } from "@hypit/markup";
import { parseSvs } from "@hypit/svs";

import type { Range } from "./shared.js";
import type { Placement } from "./observe.js";

export type StudioSourceFile = {
  readonly path: string;
  readonly text: string;
  readonly language: "svml" | "svs" | "svrun";
  readonly role?: "run" | "author" | "dependency";
  readonly imports?: readonly { readonly alias: string; readonly source: string }[];
};

type AuthorElement = {
  readonly id?: string;
  readonly sourcePath: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly references: Readonly<Record<string, string>>;
  readonly attributeValueRanges: Readonly<Record<string, Range>>;
};

function authoredElements(placements: readonly Placement[]): readonly AuthorElement[] {
  return placements.flatMap((placement) => [
    {
      ...(placement.id === undefined ? {} : { id: placement.id }),
      sourcePath: placement.sourcePath,
      attributes: placement.attributes,
      references: placement.referenceAttributes,
      attributeValueRanges: placement.attributeValueRanges,
    },
    ...placement.children.map((child) => ({
      ...(child.id === undefined ? {} : { id: child.id }),
      sourcePath: child.sourcePath,
      attributes: child.attributes,
      references: child.referenceAttributes,
      attributeValueRanges: child.attributeValueRanges,
    })),
  ]);
}

function sameRange(left: Range | undefined, right: Range | undefined): boolean {
  return left !== undefined && right !== undefined && left.start === right.start && left.end === right.end;
}

function elementFor(placement: StudioPlacement, draft: StudioEntityDraft): AuthorElement | undefined {
  const candidates: readonly (AuthorElement & { readonly id?: string; readonly range: Range })[] = [
    {
      sourcePath: placement.sourcePath,
      attributes: placement.attributes,
      references: placement.referenceAttributes,
      attributeValueRanges: placement.attributeValueRanges,
      ...(placement.id === undefined ? {} : { id: placement.id }),
      range: placement.range,
    },
    ...placement.children.map((child) => ({
      sourcePath: child.sourcePath,
      attributes: child.attributes,
      references: child.referenceAttributes,
      attributeValueRanges: child.attributeValueRanges,
      ...(child.id === undefined ? {} : { id: child.id }),
      range: child.range,
    })),
  ];
  return candidates.find((candidate) => sameRange(candidate.range, draft.elementRange))
    ?? candidates.find((candidate) => candidate.id === draft.authoredId);
}

function languageOf(path: string): StudioSourceFile["language"] {
  if (path.endsWith(".svs")) return "svs";
  if (path.endsWith(".svrun")) return "svrun";
  return "svml";
}

function sourceFor(
  root: string,
  path: string,
  files: readonly StudioSourceFile[],
  base?: string,
): StudioSourceFile | undefined {
  const absolute = sourceAbsolute(root, path, base);
  return files.find((file) => sourceAbsolute(root, file.path) === absolute)
    ?? files.find((file) => file.path === relative(root, absolute));
}

function sourceAbsolute(root: string, path: string, base?: string): string {
  if (isAbsolute(path)) return resolve(path);
  const directory = base === undefined ? root : dirname(sourceAbsolute(root, base));
  return resolve(directory, path);
}

function svsText(source: string): string {
  const header = /^\s*<\?svml[\s\S]*?\?>/u.exec(source);
  if (header === null) return source;
  return `${header[0].replace(/[^\r\n]/gu, " ")}${source.slice(header[0].length)}`;
}

function recipeParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly current: StudioSourceFile;
  readonly draft: StudioEntityDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly placements: readonly Placement[];
  readonly surfaces?: MarkupSurfaceRegistryLike;
  readonly vocabulary?: readonly SurfaceRecipePropertyVocabulary[];
  readonly recipe: StudioRecipeReferenceDeclaration;
  readonly through: readonly string[];
}): readonly StudioParameter[] {
  const [attribute, ...remaining] = input.through;
  if (attribute !== undefined) {
    const local = input.placements.find((candidate) => candidate.id === input.referencePath);
    if (local === undefined) return [];
    const referencePath = local.referenceAttributes[attribute];
    if (referencePath === undefined || referencePath === input.referencePath) return [];
    const vocabulary = input.surfaces
      ?.resolve(local.module, local.surface)
      ?.vocabulary?.attributes
      .find((candidate) => candidate.name === attribute)
      ?.recipe;
    const selectedVocabulary = vocabulary ?? input.vocabulary;
    return recipeParameters({
      ...input,
      current: sourceFor(input.root, local.sourcePath, input.files) ?? input.current,
      referencePath,
      through: remaining,
      ...(selectedVocabulary === undefined ? {} : { vocabulary: selectedVocabulary }),
    });
  }
  const [alias, ...parts] = input.referencePath.split(".");
  if (alias === undefined || parts.length === 0) return [];
  const imported = input.current.imports?.find((item) => item.alias === alias);
  if (imported === undefined) return [];
  const source = sourceFor(input.root, imported.source, input.files, input.current.path);
  if (source === undefined || source.language !== "svs") return [];
  const recipePath = parts.join(".");
  const parsed = parseSvs(source.path, svsText(source.text));
  const recipe = parsed.recipes.find((item) => item.value.path === recipePath);
  if (recipe === undefined) return [];
  return recipe.properties.flatMap((property): readonly StudioParameter[] => {
    const presentation = input.recipe.parameters.find((candidate) => candidate.name === property.name);
    if (presentation === undefined) return [];
    const declaration = input.vocabulary?.find((candidate) => candidate.name === property.name);
    const preimage = source.text.slice(property.valueRange.start, property.valueRange.end);
    const raw = preimage.trim();
    const options = presentation?.options ?? declaration?.values;
    const summary = presentation?.summary ?? declaration?.summary;
    const control = presentation?.control ?? (options !== undefined
      ? "select" as const
      : raw === "true" || raw === "false"
      ? "boolean" as const
      : /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(raw) ? "number" as const : "text" as const);
    return [{
      id: `${input.draft.id}:${input.referenceName}:${property.name}`,
      name: property.name,
      label: presentation?.label ?? (declaration === undefined ? `${input.referenceName} · ${property.name}` : property.name),
      ...(presentation?.group === undefined ? {} : { group: presentation.group }),
      ...(presentation?.section === undefined ? {} : { section: presentation.section }),
      ...(summary === undefined ? {} : { summary }),
      control,
      value: raw,
      language: "svs" as const,
      writable: presentation?.writable ?? true,
      ...(options === undefined ? {} : { options }),
      ...(presentation?.unit === undefined ? {} : { unit: presentation.unit }),
      source: {
        path: relative(input.root, sourceAbsolute(input.root, source.path)),
        range: property.valueRange,
        preimage,
      },
    } satisfies StudioParameter];
  });
}

function referencedParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly draft: StudioEntityDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly declarations: readonly StudioParameterDeclaration[];
  readonly placements: readonly Placement[];
}): readonly StudioParameter[] {
  const targetId = input.referencePath;
  const target = authoredElements(input.placements).find((candidate) => candidate.id === targetId);
  if (target === undefined) return [];
  const file = sourceFor(input.root, target.sourcePath, input.files);
  if (file === undefined) return [];
  return input.declarations.flatMap((declaration) => {
    const range = target.attributeValueRanges[declaration.name];
    if (range === undefined) return [];
    const preimage = file.text.slice(range.start, range.end);
    const reference = target.references[declaration.name];
    const value = reference === undefined ? (target.attributes[declaration.name] ?? preimage) : reference;
    const writable = declaration.writable === true && reference === undefined;
    return [{
      id: `${input.draft.id}:${input.referenceName}:${targetId}:${declaration.name}`,
      name: declaration.name,
      label: `${input.referenceName} · ${declaration.label ?? declaration.name}`,
      control: declaration.control ?? "text",
      value,
      language: languageOf(target.sourcePath),
      writable,
      ...(declaration.options === undefined ? {} : { options: declaration.options }),
      ...(declaration.unit === undefined ? {} : { unit: declaration.unit }),
      source: {
        path: relative(input.root, sourceAbsolute(input.root, target.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: reference === undefined ? "该几何值由组件声明为只读。" : "引用由作者在 SVML 中绑定，面板不替换引用关系。" }
        : {}),
    } satisfies StudioParameter];
  });
}

/**
 * Expose only attributes a package explicitly registered. The source range is
 * still discovered by the generic markup frontend, while the meaning and
 * editability remain package-owned Studio ABI data.
 */
export function parametersForDraft(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly placement: StudioPlacement | undefined;
  readonly draft: StudioEntityDraft;
  readonly declarations: readonly StudioParameterDeclaration[];
  readonly placements?: readonly Placement[];
  readonly surfaces?: MarkupSurfaceRegistryLike;
}): readonly StudioParameter[] {
  const placement = input.placement;
  if (placement === undefined || input.declarations.length === 0) return [];
  const element = elementFor(placement, input.draft);
  if (element === undefined) return [];
  const file = sourceFor(input.root, element.sourcePath, input.files);
  if (file === undefined) return [];

  const direct = input.declarations.flatMap((declaration) => {
    const name = declaration.name;
    const range = element.attributeValueRanges[name];
    if (range === undefined) return [];
    const preimage = file.text.slice(range.start, range.end);
    const reference = element.references[name];
    const value = reference === undefined
      ? (element.attributes[name] ?? preimage)
      : reference;
    const isReference = reference !== undefined;
    const writable = declaration.writable === true && !isReference;
    return [{
      id: `${input.draft.id}:${name}`,
      name,
      label: declaration.label ?? name,
      control: declaration.control ?? "text",
      value,
      language: languageOf(element.sourcePath),
      writable,
      ...(declaration.options === undefined ? {} : { options: declaration.options }),
      ...(declaration.unit === undefined ? {} : { unit: declaration.unit }),
      source: {
        path: relative(input.root, sourceAbsolute(input.root, element.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: isReference ? "引用由作者在 SVML 中绑定，面板不替换引用关系。" : "该参数由组件声明为只读。" }
        : {}),
    } satisfies StudioParameter];
  });
  const recipes = input.declarations.flatMap((declaration) => {
    const referencePath = input.draft.parameterReferences?.[declaration.name]
      ?? element.references[declaration.name];
    if (referencePath === undefined) return [];
    const reference = declaration.referenced === undefined
      ? []
      : referencedParameters({
        root: input.root,
        files: input.files,
        draft: input.draft,
        referenceName: declaration.label ?? declaration.name,
        referencePath,
        declarations: declaration.referenced,
        placements: input.placements ?? [],
      });
    const recipe = declaration.recipe === undefined
      ? []
      : recipeParameters({
        root: input.root,
        files: input.files,
        current: file,
        draft: input.draft,
        referenceName: declaration.label ?? declaration.name,
        referencePath,
        placements: input.placements ?? [],
        ...(input.surfaces === undefined ? {} : { surfaces: input.surfaces }),
        recipe: declaration.recipe,
        through: declaration.recipe.through ?? [],
      });
    return [...reference, ...recipe];
  });
  return [...direct, ...recipes];
}

const ABSOLUTE_DURATION = /^\s*\d+(?:\.\d+)?(?:f|ms|s)\s*$/u;

/**
 * Resolve an adapter-declared gesture through the entity's actual temporal
 * lineage. A Selection is the writable author identity, so every rectangle
 * projected from it edits the same Script markers. Literal absolute Windows
 * remain directly writable. Other projections stay visible but read-only
 * until their package declares an unambiguous inverse.
 */
export function resolveTimelineEditHandles(
  parameters: readonly StudioParameter[],
  declarations: readonly StudioTimelineEditDeclaration[],
  temporal?: StudioTemporalLineage,
  semantic?: StudioSemanticTimeline,
): readonly StudioEditHandle[] {
  const byName = new Map<string, StudioParameter>();
  for (const parameter of parameters) {
    // Timing source attributes live in SVML. A nested Recipe may legitimately
    // also have a property named `start`; it must never shadow the author
    // window when a clip is being dragged.
    if (parameter.language === "svml" && !byName.has(parameter.name)) byName.set(parameter.name, parameter);
  }
  const absolute = (parameter: StudioParameter | undefined): parameter is StudioParameter =>
    parameter !== undefined && parameter.writable && ABSOLUTE_DURATION.test(parameter.value);
  const disabled = (gesture: StudioTimelineEditDeclaration["gesture"], reason: string): StudioEditHandle => ({
    id: `timeline.adjust:${gesture}`,
    operation: "timeline.adjust",
    gesture,
    enabled: false,
    disabledReason: reason,
  });
  const handles: StudioEditHandle[] = [];
  if (temporal === undefined) return handles;
  const matches = (when: { readonly source: string; readonly projection?: string }): boolean =>
    temporal.source.kind === when.source
    && (when.projection === undefined || temporal.projection?.kind === when.projection);
  for (const declaration of declarations) {
    const before = handles.length;
    let relevant = false;
    let unavailable: string | undefined;
    for (const target of declaration.targets) {
      if (target.kind === "semantic-source") {
        if (temporal.source.kind !== target.source) continue;
        relevant = true;
        const id = temporal.source.id;
        if (id === undefined) {
          unavailable = `该 ${target.source} 投影没有公共作者身份。`;
          continue;
        }
        if (target.source === "selection") {
          const selection = semantic?.selections.find((candidate) => candidate.id === id);
          if (selection === undefined) {
            unavailable = `Selection ${id} 没有出现在当前语义 Candidate 中。`;
            continue;
          }
          handles.push({
            id: `timeline.adjust:${declaration.gesture}`,
            operation: "timeline.adjust",
            gesture: declaration.gesture,
            enabled: true,
            coordinate: "semantic-anchor",
            ...(target.moveEffect === undefined ? {} : { moveEffect: target.moveEffect }),
            snapTo: ["semantic-anchor"],
            semantic: {
              kind: "selection",
              id: selection.id,
              startAnchorId: selection.startAnchorId,
              endAnchorId: selection.endAnchorId,
            },
          });
        } else {
          const moment = semantic?.moments.find((candidate) => candidate.id === id);
          if (moment === undefined) {
            unavailable = `Moment ${id} 没有出现在当前语义 Candidate 中。`;
            continue;
          }
          handles.push({
            id: `timeline.adjust:${declaration.gesture}`,
            operation: "timeline.adjust",
            gesture: declaration.gesture,
            enabled: true,
            coordinate: "semantic-anchor",
            ...(target.moveEffect === undefined ? {} : { moveEffect: target.moveEffect }),
            snapTo: ["semantic-anchor"],
            semantic: { kind: "moment", id: moment.id, anchorId: moment.anchorId },
          });
        }
        break;
      }
      if (!matches(target.when)) continue;
      relevant = true;
      if (target.kind === "disabled") {
        handles.push(disabled(declaration.gesture, target.reason));
        break;
      }
      const resolved = target.parameters.map(({ role, parameter }) => ({ role, parameter: byName.get(parameter) }));
      if (resolved.some((item) => !absolute(item.parameter))) {
        unavailable = `Companion 声明的源码参数不可用：${target.parameters.map((item) => item.parameter).join(", ")}。`;
        continue;
      }
      handles.push({
        id: `timeline.adjust:${declaration.gesture}`,
        operation: "timeline.adjust",
        gesture: declaration.gesture,
        enabled: true,
        coordinate: "program-frame",
        snapTo: ["frame", "semantic-anchor", "item-edge"],
        sources: resolved.map((item) => ({ role: item.role, source: item.parameter!.source })),
      });
      break;
    }
    if (relevant && handles.length === before) {
      handles.push(disabled(declaration.gesture, unavailable ?? "Companion 声明的作者逆变换在当前实体上不可用。"));
    }
  }
  return handles;
}
