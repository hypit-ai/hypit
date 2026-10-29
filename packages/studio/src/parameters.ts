import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  StudioInspectorField,
  StudioInspectorFieldDeclaration,
  StudioSourceBinding,
  StudioSourceBindingDeclaration,
  StudioRecipeReferenceBindingDeclaration,
  StudioItemDraft,
  StudioInspectorObjectDraft,
  StudioEditSource,
  StudioPlacement,
  StudioEditHandle,
  StudioTemporalDomainView,
  StudioTemporalInstantProjection,
  StudioTemporalLineage,
  StudioTimelineGesture,
} from "@hypit/studio-companion";
import { parseRecipe } from "@hypit/hypit/recipe";
import { parseOpeningTag } from "@hypit/hypit/markup";
import { maskSourceHeader, parseSourceHeader } from "@hypit/hypit/source/text";
import { parameterControlForPresentation, parameterControlForSchema, parameterRecordSchema } from "./parameter-values.js";
import { sameType } from "@hypit/hypit/protocol";
import type { CanonicalValue } from "@hypit/hypit/protocol";

import type { StudioCompanionRegistry } from "./studio-registry.js";

import type { Range } from "./shared.js";
import type { Placement } from "./observe.js";

type StudioParameterDraft = StudioItemDraft | StudioInspectorObjectDraft;

export type StudioSourceFile = {
  readonly path: string;
  readonly text: string;
  readonly language: "svml" | "svs" | "svrun";
  readonly role?: "invocation" | "author" | "dependency";
  readonly imports?: readonly { readonly alias: string; readonly source: string }[];
};

type AuthorElement = {
  readonly range: Range;
  readonly authorElement?: string;
  readonly authorEndpoints: Readonly<Record<string, string>>;
  readonly id?: string;
  readonly sourcePath: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly references: Readonly<Record<string, string>>;
  readonly resolvedReferences: Readonly<Record<string, string>>;
  readonly records: readonly string[];
  readonly outputs: readonly string[];
  readonly attributeValueRanges: Readonly<Record<string, Range>>;
};

function authoredElements(placements: readonly Placement[]): readonly AuthorElement[] {
  return placements.flatMap((placement) => [
    {
      ...(placement.authorElement === undefined ? {} : { authorElement: placement.authorElement }),
      authorEndpoints: placement.authorEndpoints ?? {},
      ...(placement.id === undefined ? {} : { id: placement.id }),
      range: placement.range,
      sourcePath: placement.sourcePath,
      attributes: placement.attributes,
      references: placement.referenceAttributes,
      resolvedReferences: placement.resolvedReferenceAttributes ?? {},
      records: placement.records,
      outputs: placement.outputs,
      attributeValueRanges: placement.attributeValueRanges,
    },
    ...placement.children.map((child) => ({
      ...(child.authorElement === undefined ? {} : { authorElement: child.authorElement }),
      authorEndpoints: child.authorEndpoints ?? {},
      ...(child.id === undefined ? {} : { id: child.id }),
      range: child.range,
      sourcePath: child.sourcePath,
      attributes: child.attributes,
      references: child.referenceAttributes,
      resolvedReferences: child.resolvedReferenceAttributes ?? {},
      records: child.records ?? [],
      outputs: child.outputs ?? [],
      attributeValueRanges: child.attributeValueRanges,
    })),
  ]);
}

function sameLocation(
  candidate: { readonly sourcePath: string; readonly range: Range },
  location: StudioParameterDraft["elementLocation"],
): boolean {
  return location !== undefined && candidate.sourcePath === location.path
    && candidate.range.start === location.range.start && candidate.range.end === location.range.end;
}

function elementFor(placement: StudioPlacement, draft: StudioParameterDraft): AuthorElement | undefined {
  const candidates: readonly (AuthorElement & { readonly id?: string; readonly range: Range })[] = [
    {
      ...(placement.authorElement === undefined ? {} : { authorElement: placement.authorElement }),
      authorEndpoints: placement.authorEndpoints ?? {},
      sourcePath: placement.sourcePath,
      attributes: placement.attributes,
      references: placement.referenceAttributes,
      resolvedReferences: placement.resolvedReferenceAttributes ?? {},
      records: placement.records,
      outputs: placement.outputs,
      attributeValueRanges: placement.attributeValueRanges,
      ...(placement.id === undefined ? {} : { id: placement.id }),
      range: placement.range,
    },
    ...placement.children.map((child) => ({
      ...(child.authorElement === undefined ? {} : { authorElement: child.authorElement }),
      authorEndpoints: child.authorEndpoints ?? {},
      sourcePath: child.sourcePath,
      attributes: child.attributes,
      references: child.referenceAttributes,
      resolvedReferences: child.resolvedReferenceAttributes ?? {},
      records: child.records ?? [],
      outputs: child.outputs ?? [],
      attributeValueRanges: child.attributeValueRanges,
      ...(child.id === undefined ? {} : { id: child.id }),
      range: child.range,
    })),
  ];
  return candidates.find((candidate) => sameLocation(candidate, draft.elementLocation))
    ?? candidates.find((candidate) => candidate.id === draft.authoredId);
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

function recipeParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly current: StudioSourceFile;
  readonly draft: StudioParameterDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly referenceRef?: string;
  readonly placements: readonly Placement[];
  readonly recipe: StudioRecipeReferenceBindingDeclaration;
  readonly through: readonly string[];
}): readonly StudioSourceBinding[] {
  const [attribute, ...remaining] = input.through;
  if (attribute !== undefined) {
    const local = authoredElements(input.placements).find((candidate) => input.referenceRef !== undefined
      ? candidate.records.includes(input.referenceRef) || candidate.outputs.includes(input.referenceRef)
      : sourceAbsolute(input.root, candidate.sourcePath) === sourceAbsolute(input.root, input.current.path)
        && candidate.id === input.referencePath);
    if (local === undefined) return [];
    const referencePath = local.references[attribute];
    if (referencePath === undefined || referencePath === input.referencePath) return [];
    return recipeParameters({
      ...input,
      current: sourceFor(input.root, local.sourcePath, input.files) ?? input.current,
      referencePath,
      ...(local.resolvedReferences[attribute] === undefined
        ? {}
        : { referenceRef: local.resolvedReferences[attribute] }),
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
  const header = parseSourceHeader(source.path, source.text);
  const parsed = parseRecipe(source.path, maskSourceHeader(source.text, header));
  const recipe = parsed.recipes.find((item) => item.value.path === recipePath);
  if (recipe === undefined) return [];
  return input.recipe.bindings.flatMap((declaration): readonly StudioSourceBinding[] => {
    const property = recipe.properties.find((candidate) => candidate.name === declaration.name);
    if (property === undefined) {
      const fallback = typeof declaration.fallback === "function" ? declaration.fallback(recipe.value.properties) : declaration.fallback;
      if (fallback === undefined) return [];
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
        value: fallback,
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

function attributeGroup(file: StudioSourceFile, target: AuthorElement, draft: StudioParameterDraft,
  declaration: StudioSourceBindingDeclaration, binding: string, root: string): readonly StudioSourceBinding[] {
  if (declaration.schema === undefined) throw new Error(`Attribute group ${binding} needs a schema.`);
  const tag = parseOpeningTag({ name: file.path, text: file.text }, target.range.start);
  const sourceRange = { start: target.range.start, end: tag.end };
  const preimage = file.text.slice(sourceRange.start, sourceRange.end);
  const opening = /^<[\w:.-]+/u.exec(preimage);
  if (!opening) throw new Error(`Cannot locate opening tag for ${binding}.`);
  const fallback = typeof declaration.fallback === "function" ? declaration.fallback(target.attributes) : declaration.fallback;
  const value: Record<string, CanonicalValue> = fallback !== null && typeof fallback === "object" && !Array.isArray(fallback) ? { ...(fallback as Readonly<Record<string, CanonicalValue>>) } : {};
  const ranges: Record<string, Range | null> = {};
  let writable = declaration.writable === true;
  for (const name of declaration.attributes!) {
    const range = target.attributeValueRanges[name];
    ranges[name] = null;
    if (range === undefined) continue;
    if (target.references[name] !== undefined) { writable = false; value[name] = target.references[name]!; continue; }
    value[name] = target.attributes[name] ?? target.references[name] ?? "";
    const before = file.text.slice(target.range.start, range.start);
    const located = ((): number | undefined => {
      let cursor = before.length - 1;
      if (cursor < 0 || (before[cursor] !== "\"" && before[cursor] !== "'")) return undefined;
      while (cursor > 0 && /\s/u.test(before[cursor - 1]!)) cursor -= 1;
      if (cursor === 0 || before[cursor - 1] !== "=") return undefined;
      cursor -= 1;
      while (cursor > 0 && /\s/u.test(before[cursor - 1]!)) cursor -= 1;
      if (cursor < name.length || before.slice(cursor - name.length, cursor) !== name) return undefined;
      cursor -= name.length;
      if (cursor === 0 || !/\s/u.test(before[cursor - 1]!)) return undefined;
      while (cursor > 0 && /\s/u.test(before[cursor - 1]!)) cursor -= 1;
      return cursor;
    })();
    if (located === undefined) throw new Error(`Cannot locate scalar attribute ${name}.`);
    ranges[name] = { start: located, end: range.end - target.range.start + 1 };
  }
  const schema = parameterRecordSchema(declaration.schema, value);
  for (const [name, held] of Object.entries(value)) {
    if (target.references[name] !== undefined || typeof held !== "string") continue;
    const kind = schema?.fields[name]?.schema.kind;
    if (kind === "number" && held.trim() !== "") value[name] = Number(held);
    if (kind === "boolean" && (held === "true" || held === "false")) value[name] = held === "true";
  }
  return [{ id: `${draft.id}:${binding}`, binding, name: declaration.name, value, schema: declaration.schema,
    language: file.language, writable, source: { path: relative(root, sourceAbsolute(root, target.sourcePath)),
      range: sourceRange, preimage }, attributes: { insertionOffset: opening[0].length, ranges } }];
}

function omittedAttribute(file: StudioSourceFile, target: AuthorElement, draft: StudioParameterDraft,
  declaration: StudioSourceBindingDeclaration, binding: string, root: string): readonly StudioSourceBinding[] {
  const value = typeof declaration.fallback === "function" ? declaration.fallback(target.attributes) : declaration.fallback;
  if (value === undefined) return [];
  const tag = /^<[\w:.-]+/u.exec(file.text.slice(target.range.start));
  if (tag === null) throw new Error(`Cannot locate opening tag for ${binding}.`);
  const at = target.range.start + tag[0].length;
  return [{ id: `${draft.id}:${binding}`, binding, name: declaration.name, value,
    ...(declaration.schema === undefined ? {} : { schema: declaration.schema }),
    language: file.language, writable: declaration.writable === true,
    source: { path: relative(root, sourceAbsolute(root, target.sourcePath)),
      range: { start: at, end: at }, preimage: "", prefix: ` ${declaration.name}="`, suffix: '"' },
  }];
}

function referencedParameters(input: {
  readonly root: string;
  readonly files: readonly StudioSourceFile[];
  readonly draft: StudioParameterDraft;
  readonly referenceName: string;
  readonly referencePath: string;
  readonly referenceRef?: string;
  readonly declarations: readonly StudioSourceBindingDeclaration[];
  readonly placements: readonly Placement[];
}): readonly StudioSourceBinding[] {
  const targetId = input.referencePath;
  const target = authoredElements(input.placements).find((candidate) => input.referenceRef !== undefined
    ? candidate.records.includes(input.referenceRef) || candidate.outputs.includes(input.referenceRef)
    : candidate.id === targetId);
  if (target === undefined) return [];
  const file = sourceFor(input.root, target.sourcePath, input.files);
  if (file === undefined) return [];
  return input.declarations.flatMap((declaration) => {
    if (declaration.attributes) return attributeGroup(file, target, input.draft, declaration, `${input.referenceName}.${declaration.name}`, input.root);
    const nestedPath = target.references[declaration.name];
    const referenced = nestedPath === undefined || declaration.referenced === undefined ? [] : referencedParameters({
      root: input.root, files: input.files, draft: input.draft, placements: input.placements,
      referenceName: `${input.referenceName}.${declaration.name}`,
      referencePath: nestedPath,
      ...(target.resolvedReferences[declaration.name] === undefined ? {} : { referenceRef: target.resolvedReferences[declaration.name] }),
      declarations: declaration.referenced,
    });
    const recipe = nestedPath === undefined || declaration.recipe === undefined ? [] : recipeParameters({
      root: input.root, files: input.files, draft: input.draft, placements: input.placements,
      current: file, referenceName: `${input.referenceName}.${declaration.name}`,
      referencePath: nestedPath,
      ...(target.resolvedReferences[declaration.name] === undefined ? {} : { referenceRef: target.resolvedReferences[declaration.name] }), recipe: declaration.recipe,
      through: declaration.recipe.through ?? [],
    });
    const nested = [...referenced, ...recipe];
    const range = target.attributeValueRanges[declaration.name];
    if (range === undefined) return [...omittedAttribute(file, target, input.draft, declaration, `${input.referenceName}.${declaration.name}`, input.root), ...nested];
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
      language: file.language,
      writable,
      source: {
        ...(target.authorEndpoints[declaration.name] === undefined
          ? {}
          : { endpoint: target.authorEndpoints[declaration.name] }),
        path: relative(input.root, sourceAbsolute(input.root, target.sourcePath)),
        range,
        preimage,
      },
      ...(!writable
        ? { disabledReason: reference === undefined ? "该几何值由组件声明为只读。" : "引用由作者在 SVML 中绑定，面板不替换引用关系。" }
        : {}),
    } satisfies StudioSourceBinding, ...nested];
  });
}

function parameterReference(
  element: AuthorElement,
  draft: StudioParameterDraft,
  name: string,
): { readonly path: string; readonly ref?: string } | undefined {
  const projected = draft.parameterReferences?.[name];
  if (projected !== undefined) return { path: projected };
  const path = element.references[name];
  if (path === undefined) return undefined;
  const ref = element.resolvedReferences[name];
  return ref === undefined ? { path } : { path, ref };
}

/** Resolve only references opted into by the consuming Companion. */
export function composeParameterDeclarations(input: {
  readonly placement: StudioPlacement | undefined;
  readonly draft: StudioParameterDraft;
  readonly placements: readonly Placement[];
  readonly registry: StudioCompanionRegistry;
  readonly bindings: readonly StudioSourceBindingDeclaration[];
  readonly inspector: readonly StudioInspectorFieldDeclaration[];
}): { bindings: readonly StudioSourceBindingDeclaration[]; inspector: readonly StudioInspectorFieldDeclaration[] } {
  const inspector = [...input.inspector];
  const element = input.placement === undefined ? undefined : elementFor(input.placement, input.draft);
  const expand = (declarations: readonly StudioSourceBindingDeclaration[], owner: AuthorElement | undefined,
    prefix: string, seen: ReadonlySet<string>): readonly StudioSourceBindingDeclaration[] => declarations.map(declaration => {
    const path = prefix ? `${prefix}.${declaration.name}` : declaration.name;
    const reference = prefix ? owner?.references[declaration.name] : input.draft.parameterReferences?.[declaration.name] ?? owner?.references[declaration.name];
    const resolved = !prefix && input.draft.parameterReferences?.[declaration.name] !== undefined ? undefined : owner?.resolvedReferences[declaration.name];
    const target = input.placements.find(candidate => resolved !== undefined
      ? candidate.records.includes(resolved) || candidate.outputs.includes(resolved)
      : candidate.id === reference && candidate.sourcePath === owner?.sourcePath);
    const companion = declaration.companion && target !== undefined
      ? input.registry.parameterCompanionFor(target.module, target.declaration) : undefined;
    const key = target?.authorElement ?? `${target?.sourcePath}:${target?.range.start}`;
    if (companion !== undefined && seen.has(key)) throw new Error(`Circular Studio parameter reference at ${path}.`);
    if (companion !== undefined) inspector.push(...companion.inspector.map(field => ({ ...field, binding: `${path}.${field.binding}` })));
    const next = target === undefined ? undefined : elementFor(target, {
      ...input.draft,
      authoredId: target.id ?? "",
      elementLocation: { path: target.sourcePath, range: target.range },
    });
    const nested = [...(declaration.referenced ?? []), ...(companion?.bindings ?? [])];
    return { ...declaration, referenced: expand(nested, next, path, new Set([...seen, key])) };
  });
  return { bindings: expand(input.bindings, element, "", new Set()), inspector };
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
  readonly draft: StudioParameterDraft;
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
    if (declaration.attributes) return attributeGroup(file, element, input.draft, declaration, name, input.root);
    const range = element.attributeValueRanges[name];
    if (range === undefined) return omittedAttribute(file, element, input.draft, declaration, name, input.root);
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
      language: file.language,
      writable,
      source: {
        ...(element.authorEndpoints[name] === undefined ? {} : { endpoint: element.authorEndpoints[name] }),
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
    const target = parameterReference(element, input.draft, declaration.name);
    if (target === undefined) return [];
    const reference = declaration.referenced === undefined
      ? []
      : referencedParameters({
        root: input.root,
        files: input.files,
        draft: input.draft,
        referenceName: declaration.name,
        referencePath: target.path,
        ...(target.ref === undefined ? {} : { referenceRef: target.ref }),
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
        referencePath: target.path,
        ...(target.ref === undefined ? {} : { referenceRef: target.ref }),
        placements: input.placements ?? [],
        recipe: declaration.recipe,
        through: declaration.recipe.through ?? [],
      });
    return [...reference, ...recipe];
  });
  return [...direct, ...recipes];
}

/** Resolve the Companion's visible field table against real bindings and Item facts. */
export function inspectorFieldsForBindings(
  draft: StudioParameterDraft,
  bindings: readonly StudioSourceBinding[],
  declarations: readonly StudioInspectorFieldDeclaration[],
): readonly StudioInspectorField[] {
  const byBinding = new Map(bindings.map((binding) => [binding.binding, binding] as const));
  const fields = declarations.flatMap((declaration): readonly StudioInspectorField[] => {
    const binding = byBinding.get(declaration.binding);
    if (binding === undefined) return [];
    const control = declaration.control ?? (binding.attributes ? "record"
      : parameterControlForPresentation(binding.schema, declaration.valuePresentation)
        ?? parameterControlForSchema(binding.schema));
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
      ...(binding.writable ? { edit: { language: binding.language, source: binding.source, ...(binding.attributes ? { attributes: binding.attributes } : {}) } } : {}),
    }];
  });
  return [...fields, ...(draft.inspector ?? []).map((fact): StudioInspectorField => ({
    ...fact, id: `${draft.id}:inspector:fact:${fact.id}`, control: "text",
  }))];
}

/** Resolve finite timeline gestures from the exact endpoint authorities in the executed graph. */
export function resolveTimelineEditHandles(
  bindings: readonly StudioSourceBinding[],
  temporal?: StudioTemporalLineage,
  domains: readonly StudioTemporalDomainView[] = [],
): readonly StudioEditHandle[] {
  const byName = new Map<string, StudioSourceBinding>();
  for (const binding of bindings) {
    // Timing source attributes live in SVML. A nested Recipe may legitimately
    // also have a property named `start`; it must never shadow the author
    // window when a Studio Item is being dragged.
    if (binding.language === "svml" && !byName.has(binding.binding)) byName.set(binding.binding, binding);
  }
  const writable = (binding: StudioSourceBinding | undefined): binding is StudioSourceBinding =>
    binding !== undefined && binding.writable && binding.source.endpoint !== undefined;
  const disabled = (gesture: StudioTimelineGesture, reason: string): StudioEditHandle => ({
    id: `timeline.adjust:${gesture}`,
    operation: "timeline.adjust",
    gesture,
    enabled: false,
    disabledReason: reason,
  });
  if (temporal === undefined) return [];
  const projection = temporal.projection;

  const domainTarget = (endpoints: readonly StudioTemporalInstantProjection[]) => {
    const sources = endpoints.flatMap((endpoint) => endpoint.authority.kind === "domain"
      ? [endpoint.authority.source]
      : []);
    const first = sources[0];
    if (first === undefined || first.domain === undefined
      || !sources.every((candidate) => candidate.kind === first.kind
        && candidate.id === first.id
        && candidate.timelineId === first.timelineId
        && candidate.domain?.companion === first.domain?.companion
        && candidate.domain?.id === first.domain?.id)) return undefined;
    const view = domains.find((candidate) => candidate.timelineId === first.timelineId
      && candidate.companion === first.domain!.companion && candidate.id === first.domain!.id);
    const item = view?.editItems.find((candidate) => candidate.editable === true
      && candidate.source !== undefined
      && sameType(candidate.source.type, first.type)
      && candidate.source.kind === first.kind && candidate.source.id === first.id);
    if (view === undefined || item === undefined) return undefined;
    return item.kind === "span" ? {
      kind: "span" as const, companion: view.companion, domainId: view.id, itemId: item.id,
      startAnchorId: item.startAnchorId, endAnchorId: item.endAnchorId,
    } : {
      kind: "point" as const, companion: view.companion, domainId: view.id, itemId: item.id,
      anchorId: item.anchorId,
    };
  };

  const handle = (
    gesture: StudioTimelineGesture,
    changed: readonly { readonly endpoint: StudioTemporalInstantProjection; readonly role: "start" | "end" }[],
    constrained: readonly { readonly endpoint: StudioTemporalInstantProjection; readonly role: "start" | "end" }[],
    moveEffect?: "translate-window" | "move-start",
  ): StudioEditHandle => {
    const unavailable = changed.find(({ endpoint }) => endpoint.authority.kind === "fixed");
    if (unavailable !== undefined) return disabled(gesture, "该时间表达未开放时间轴回写。");
    const projected: ({ readonly missing: string } | StudioEditSource)[] = [];
    for (const { endpoint, role } of constrained) {
      if (endpoint.authority.kind !== "parameter") continue;
      if (endpoint.authority.relation === "direct"
        && !changed.some((candidate) => candidate.endpoint === endpoint)) continue;
      const binding = byName.get(endpoint.authority.owner ?? endpoint.authority.binding);
      if (!writable(binding)) {
        projected.push({ missing: endpoint.authority.binding });
        continue;
      }
      projected.push({
        role: endpoint.authority.relation === "direct" ? role : "duration" as const,
        source: binding.source,
      });
    }
    const missing = projected.find((item) => "missing" in item);
    if (missing !== undefined && "missing" in missing) {
      return disabled(gesture, `投影参数 ${missing.missing} 在当前作者源码中不可写。`);
    }
    const domainEndpoints = changed.filter(({ endpoint }) => endpoint.authority.kind === "domain").map(({ endpoint }) => endpoint);
    const target = domainTarget(domainEndpoints);
    if (domainEndpoints.length > 0 && target === undefined) {
      return disabled(gesture, "时间域端点在当前投影中没有可写的作者身份。");
    }
    const sources = projected.filter((item): item is StudioEditSource => "source" in item);
    return {
      id: `timeline.adjust:${gesture}`,
      operation: "timeline.adjust",
      gesture,
      enabled: true,
      coordinate: target === undefined ? "program-frame" : "domain-anchor",
      ...(moveEffect === undefined ? {} : { moveEffect }),
      snapTo: target === undefined ? ["frame", "domain-anchor", "item-edge"] : ["domain-anchor"],
      ...(sources.length === 0 ? {} : { sources }),
      ...(target === undefined ? {} : { domain: target }),
      temporal: projection,
      temporalRecord: temporal.record,
    };
  };

  if (projection.kind === "instant") {
    const point = [{ endpoint: projection, role: "start" as const }];
    return [handle("move", point, point, "move-start")];
  }
  const start = { endpoint: projection.start, role: "start" as const };
  const end = { endpoint: projection.end, role: "end" as const };
  return [
    handle("move", [start, end], [start, end], "translate-window"),
    handle("trim-start", [start], [start, end]),
    handle("trim-end", [end], [start, end]),
  ];
}
