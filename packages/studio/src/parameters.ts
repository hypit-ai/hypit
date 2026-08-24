import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  StudioInspectorField,
  StudioInspectorFieldDeclaration,
  StudioSourceBinding,
  StudioSourceBindingDeclaration,
  StudioParameterControl,
  StudioRecipeReferenceBindingDeclaration,
  StudioEntityDraft,
  StudioPlacement,
  StudioEditHandle,
  StudioSemanticTimeline,
  StudioTemporalLineage,
  StudioTimelineEditDeclaration,
} from "@hypit/studio-adapter";
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
  readonly recipe: StudioRecipeReferenceBindingDeclaration;
  readonly through: readonly string[];
}): readonly StudioSourceBinding[] {
  const [attribute, ...remaining] = input.through;
  if (attribute !== undefined) {
    const local = input.placements.find((candidate) => candidate.id === input.referencePath);
    if (local === undefined) return [];
    const referencePath = local.referenceAttributes[attribute];
    if (referencePath === undefined || referencePath === input.referencePath) return [];
    return recipeParameters({
      ...input,
      current: sourceFor(input.root, local.sourcePath, input.files) ?? input.current,
      referencePath,
      through: remaining,
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
  return input.recipe.bindings.flatMap((declaration): readonly StudioSourceBinding[] => {
    const property = recipe.properties.find((candidate) => candidate.name === declaration.name);
    if (property === undefined) {
      if (declaration.fallback === undefined) return [];
      const close = recipe.range.end - 1;
      const lineStart = Math.max(source.text.lastIndexOf("\n", close - 1), source.text.lastIndexOf("\r", close - 1)) + 1;
      const closeIndent = source.text.slice(lineStart, close);
      const multiline = closeIndent.trim().length === 0;
      const first = recipe.properties[0];
      const propertyIndent = first === undefined ? `${closeIndent}  ` : (() => {
        const start = Math.max(source.text.lastIndexOf("\n", first.range.start - 1), source.text.lastIndexOf("\r", first.range.start - 1)) + 1;
        return /^\s*/u.exec(source.text.slice(start, first.range.start))?.[0] ?? `${closeIndent}  `;
      })();
      return [{
        id: `${input.draft.id}:${input.referenceName}:${declaration.name}`,
        binding: `${input.referenceName}.${declaration.name}`,
        name: declaration.name,
        value: declaration.fallback,
        ...(declaration.schema === undefined ? {} : { schema: declaration.schema }),
        language: "svs" as const,
        writable: declaration.writable ?? true,
        source: {
          path: relative(input.root, sourceAbsolute(input.root, source.path)),
          range: { start: multiline ? lineStart : close, end: multiline ? lineStart : close },
          preimage: "",
          prefix: multiline ? `${propertyIndent}${declaration.name}: ` : ` ${declaration.name}: `,
          suffix: multiline ? ";\n" : "; ",
        },
      } satisfies StudioSourceBinding];
    }
    const preimage = source.text.slice(property.valueRange.start, property.valueRange.end);
    return [{
      id: `${input.draft.id}:${input.referenceName}:${declaration.name}`,
      binding: `${input.referenceName}.${declaration.name}`,
      name: declaration.name,
      value: recipe.value.properties[declaration.name] ?? preimage.trim(),
      ...(declaration.schema === undefined ? {} : { schema: declaration.schema }),
      language: "svs" as const,
      writable: declaration.writable ?? true,
      source: {
        path: relative(input.root, sourceAbsolute(input.root, source.path)),
        range: property.valueRange,
        preimage,
      },
    } satisfies StudioSourceBinding];
  });
}

function referencedParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly draft: StudioEntityDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly declarations: readonly StudioSourceBindingDeclaration[];
  readonly placements: readonly Placement[];
}): readonly StudioSourceBinding[] {
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
      binding: `${input.referenceName}.${declaration.name}`,
      name: declaration.name,
      value,
      ...(declaration.schema === undefined ? {} : { schema: declaration.schema }),
      language: languageOf(target.sourcePath),
      writable,
      source: {
        path: relative(input.root, sourceAbsolute(input.root, target.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: reference === undefined ? "该几何值由组件声明为只读。" : "引用由作者在 SVML 中绑定，面板不替换引用关系。" }
        : {}),
    } satisfies StudioSourceBinding];
  });
}

/**
 * Expose only attributes a package explicitly registered. The source range is
 * still discovered by the generic markup frontend, while the meaning and
 * editability remain package-owned Studio ABI data.
 */
export function sourceBindingsForDraft(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly placement: StudioPlacement | undefined;
  readonly draft: StudioEntityDraft;
  readonly declarations: readonly StudioSourceBindingDeclaration[];
  readonly placements?: readonly Placement[];
}): readonly StudioSourceBinding[] {
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
      binding: name,
      name,
      value,
      ...(declaration.schema === undefined ? {} : { schema: declaration.schema }),
      language: languageOf(element.sourcePath),
      writable,
      source: {
        path: relative(input.root, sourceAbsolute(input.root, element.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: isReference ? "引用由作者在 SVML 中绑定，面板不替换引用关系。" : "该参数由组件声明为只读。" }
        : {}),
    } satisfies StudioSourceBinding];
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
        referenceName: declaration.name,
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
        referenceName: declaration.name,
        referencePath,
        placements: input.placements ?? [],
        recipe: declaration.recipe,
        through: declaration.recipe.through ?? [],
      });
    return [...reference, ...recipe];
  });
  return [...direct, ...recipes];
}

function controlForSchema(schema: StudioSourceBinding["schema"]): StudioParameterControl | undefined {
  if (schema === undefined) return undefined;
  if (schema.kind === "boolean") return "boolean";
  if (schema.kind === "number") return "number";
  if (schema.kind === "string") return schema.enum === undefined
    ? schema.format === "color" ? "color" : "text"
    : "select";
  if (schema.kind === "array") return "list";
  if (schema.kind === "object") return "record";
  return undefined;
}

/** Resolve the Companion's visible field table against real writable bindings. */
export function inspectorFieldsForBindings(
  draft: StudioEntityDraft,
  bindings: readonly StudioSourceBinding[],
  declarations: readonly StudioInspectorFieldDeclaration[],
): readonly StudioInspectorField[] {
  const byBinding = new Map(bindings.map((binding) => [binding.binding, binding] as const));
  return declarations.flatMap((declaration): readonly StudioInspectorField[] => {
    const binding = byBinding.get(declaration.binding);
    if (binding === undefined || !binding.writable) return [];
    const control = declaration.control ?? controlForSchema(binding.schema);
    if (control === undefined) {
      throw new Error(`Studio Inspector binding ${declaration.binding} has neither a control nor a supported public schema.`);
    }
    const schemaOptions = binding.schema?.kind === "string" ? binding.schema.enum : undefined;
    return [{
      ...declaration,
      id: `${draft.id}:inspector:${declaration.binding}`,
      control,
      value: binding.value,
      ...(binding.schema === undefined ? {} : { schema: binding.schema }),
      ...(declaration.options !== undefined || schemaOptions === undefined
        ? {}
        : { options: schemaOptions }),
      language: binding.language,
      source: binding.source,
    }];
  });
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
  bindings: readonly StudioSourceBinding[],
  declarations: readonly StudioTimelineEditDeclaration[],
  temporal?: StudioTemporalLineage,
  semantic?: StudioSemanticTimeline,
): readonly StudioEditHandle[] {
  const byName = new Map<string, StudioSourceBinding>();
  for (const binding of bindings) {
    // Timing source attributes live in SVML. A nested Recipe may legitimately
    // also have a property named `start`; it must never shadow the author
    // window when a clip is being dragged.
    if (binding.language === "svml" && !byName.has(binding.binding)) byName.set(binding.binding, binding);
  }
  const absolute = (binding: StudioSourceBinding | undefined): binding is StudioSourceBinding =>
    binding !== undefined && binding.writable && typeof binding.value === "string" && ABSOLUTE_DURATION.test(binding.value);
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
