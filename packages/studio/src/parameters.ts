import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  StudioInspectorField,
  StudioInspectorFieldDeclaration,
  StudioSourceBinding,
  StudioSourceBindingDeclaration,
  StudioParameterControl,
  StudioRecipeReferenceBindingDeclaration,
  StudioEntityDraft,
  StudioEditSource,
  StudioPlacement,
  StudioEditHandle,
  StudioSemanticTimeline,
  StudioTemporalInstantProjection,
  StudioTemporalLineage,
  StudioTimelineGesture,
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

function sameRange(left: Range | undefined, right: Range | undefined): boolean {
  return left !== undefined && right !== undefined && left.start === right.start && left.end === right.end;
}

function elementFor(placement: StudioPlacement, draft: StudioEntityDraft): AuthorElement | undefined {
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
  return candidates.find((candidate) => sameRange(candidate.range, draft.elementRange))
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
    } satisfies StudioSourceBinding];
  });
}

function parameterReference(
  element: AuthorElement,
  draft: StudioEntityDraft,
  name: string,
): { readonly path: string; readonly ref?: string } | undefined {
  const projected = draft.parameterReferences?.[name];
  if (projected !== undefined) return { path: projected };
  const path = element.references[name];
  if (path === undefined) return undefined;
  const ref = element.resolvedReferences[name];
  return ref === undefined ? { path } : { path, ref };
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

/** Runtime authority, rather than a Companion allowlist, makes timing fields writable. */
export function temporalBindingDeclarations(
  temporal?: StudioTemporalLineage,
): readonly StudioSourceBindingDeclaration[] {
  if (temporal === undefined) return [];
  const endpoints = temporal.projection.kind === "instant"
    ? [temporal.projection]
    : [temporal.projection.start, temporal.projection.end];
  return [...new Set(endpoints.flatMap((endpoint) => endpoint.authority.kind === "parameter"
    ? [endpoint.authority.binding]
    : []))].map((name) => ({ name, writable: true }));
}

/** Resolve finite timeline gestures from the exact endpoint authorities in the executed graph. */
export function resolveTimelineEditHandles(
  bindings: readonly StudioSourceBinding[],
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

  const semanticTarget = (endpoints: readonly StudioTemporalInstantProjection[]) => {
    const sources = endpoints.flatMap((endpoint) => endpoint.authority.kind === "semantic"
      ? [endpoint.authority.source]
      : []);
    const first = sources[0];
    if (first === undefined || first.narrativeId === undefined
      || first.spaceId !== semantic?.spaceId
      || first.narrativeId !== semantic.narrativeId
      || !sources.every((candidate) => candidate.kind === first.kind
        && candidate.id === first.id
        && candidate.spaceId === first.spaceId
        && candidate.narrativeId === first.narrativeId)) return undefined;
    if (first.kind === "selection") {
      const selection = semantic?.selections.find((candidate) => candidate.id === first.id);
      return selection === undefined ? undefined : {
        kind: "selection" as const,
        narrativeId: first.narrativeId,
        id: selection.id,
        startAnchorId: selection.startAnchorId,
        endAnchorId: selection.endAnchorId,
      };
    }
    if (first.kind === "moment") {
      const moment = semantic?.moments.find((candidate) => candidate.id === first.id);
      return moment === undefined ? undefined : {
        kind: "moment" as const,
        narrativeId: first.narrativeId,
        id: moment.id,
        anchorId: moment.anchorId,
      };
    }
    return undefined;
  };

  const handle = (
    gesture: StudioTimelineGesture,
    affected: readonly { readonly endpoint: StudioTemporalInstantProjection; readonly role: "start" | "end" }[],
    moveEffect?: "translate-window" | "move-start",
  ): StudioEditHandle => {
    const unavailable = affected.find(({ endpoint }) => endpoint.authority.kind === "fixed");
    if (unavailable !== undefined) return disabled(gesture, "该端点由 Program 或 Segment 结构固定，不能从组件时间线反写。");
    const projected: ({ readonly missing: string } | StudioEditSource)[] = [];
    for (const { endpoint, role } of affected) {
      if (endpoint.authority.kind !== "parameter") continue;
      const binding = byName.get(endpoint.authority.binding);
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
    const semanticEndpoints = affected.filter(({ endpoint }) => endpoint.authority.kind === "semantic").map(({ endpoint }) => endpoint);
    const target = semanticTarget(semanticEndpoints);
    if (semanticEndpoints.length > 0 && target === undefined) {
      return disabled(gesture, "语义端点在当前 Candidate 中没有可写的作者身份。");
    }
    const sources = projected.filter((item): item is StudioEditSource => "source" in item);
    return {
      id: `timeline.adjust:${gesture}`,
      operation: "timeline.adjust",
      gesture,
      enabled: true,
      coordinate: target === undefined ? "program-frame" : "semantic-anchor",
      ...(moveEffect === undefined ? {} : { moveEffect }),
      snapTo: target === undefined ? ["frame", "semantic-anchor", "item-edge"] : ["semantic-anchor"],
      ...(sources.length === 0 ? {} : { sources }),
      ...(target === undefined ? {} : { semantic: target }),
      temporal: projection,
    };
  };

  if (projection.kind === "instant") {
    return [handle("move", [{ endpoint: projection, role: "start" }], "move-start")];
  }
  const start = { endpoint: projection.start, role: "start" as const };
  const end = { endpoint: projection.end, role: "end" as const };
  const move = projection.end.authority.kind === "parameter" && projection.end.authority.relation === "after-start"
    ? [start]
    : projection.start.authority.kind === "parameter" && projection.start.authority.relation === "before-end"
      ? [end]
      : [start, end];
  const trimStart = projection.start.authority.kind === "parameter" && projection.start.authority.relation === "before-end"
    ? [start]
    : projection.end.authority.kind === "parameter" && projection.end.authority.relation === "after-start"
      ? [start, end]
      : [start];
  const trimEnd = projection.end.authority.kind === "parameter" && projection.end.authority.relation === "after-start"
    ? [end]
    : projection.start.authority.kind === "parameter" && projection.start.authority.relation === "before-end"
      ? [start, end]
      : [end];
  return [
    handle("move", move, "translate-window"),
    handle("trim-start", trimStart),
    handle("trim-end", trimEnd),
  ];
}
