import {
  canonicalize,
  canonicalStringify,
  sealRecord,
} from "@narratage/core";
import type {
  ModuleRef,
  ResolvedModule,
  TypedRecord,
} from "@narratage/protocol";
import type {
  AuthorComponent,
  AuthorSourceExport,
  AuthorValueRef,
  GraphFragment,
} from "@narratage/elaborator";

import { MarkupFrontendError } from "./error.js";
import {
  closeDocument,
  discoverMarkup,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "./syntax.js";
import type {
  RawSurfaceHandler,
  MarkupSource,
  StructuredSurfaceHandler,
  SurfaceComponentDraft,
  SurfaceDecodeOutput,
  SurfaceResolvedReference,
  RegisteredSurface,
  MarkupDecodeContext,
  MarkupDecodeResult,
  MarkupAuthorFrontend,
  MarkupAuthorFrontendOptions,
  MarkupImportRequest,
} from "./types.js";
export const markupAuthorFrontendId = "@narratage/markup@1";

type BoundSurface = {
  readonly tag: string;
  readonly module: ResolvedModule;
  readonly surface: RegisteredSurface;
};

function moduleKey(ref: ModuleRef): string {
  return `${ref.name}@${ref.version}`;
}

function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name && left.version === right.version;
}

function resolvedModuleRef(module: ResolvedModule): ModuleRef {
  return { name: module.manifest.name, version: module.manifest.version };
}

function fail(source: MarkupSource, code: string, message: string, offset?: number): never {
  throw new MarkupFrontendError(code, message, source.name, offset, source.text);
}

function moduleForImport(
  source: MarkupSource,
  request: MarkupImportRequest,
  context: MarkupDecodeContext,
  modules: ReadonlyMap<string, ResolvedModule>,
): ResolvedModule {
  const ref = context.resolveModule(request);
  const module = modules.get(moduleKey(ref));
  if (!module) {
    fail(source, "MARKUP_IMPORT_CLOSURE", `${moduleKey(ref)} is not present in the resolved closure.`, request.range.start);
  }
  return module;
}

function surfaceScope(
  source: MarkupSource,
  imports: readonly MarkupImportRequest[],
  context: MarkupDecodeContext,
): Map<string, BoundSurface> {
  const scope = new Map<string, BoundSurface>();
  const aliases = new Set<string>();
  const modules = new Map(context.closure.modules.map((item) => [moduleKey(item.manifest), item]));
  const types = new Set(context.closure.modules.flatMap((item) => item.manifest.types.map((type) =>
    `${moduleKey(item.manifest)}#${type.name}`)));
  for (const request of imports) {
    if (request.alias !== undefined) {
      if (aliases.has(request.alias)) fail(source, "MARKUP_ALIAS_DUPLICATE", `Duplicate import alias "${request.alias}".`, request.range.start);
      aliases.add(request.alias);
    }
    if (request.kind === "source") continue;
    const module = moduleForImport(source, request, context, modules);
    const moduleRef = resolvedModuleRef(module);
    const allowed = new Set([
      moduleKey(moduleRef),
      ...module.manifest.dependencies.map((dependency) => moduleKey(dependency.module)),
    ]);
    for (const declaration of context.registry.surfaces(moduleRef)) {
      for (const output of declaration.outputs) {
        if (!allowed.has(moduleKey(output.module))) {
          fail(source, "MARKUP_SURFACE_DEPENDENCY", `Surface ${moduleKey(moduleRef)}#${declaration.surface} outputs ${moduleKey(output.module)}#${output.name} without a Module dependency.`, request.range.start);
        }
        if (!types.has(`${moduleKey(output.module)}#${output.name}`)) {
          fail(source, "MARKUP_SURFACE_OUTPUT_TYPE", `Surface ${moduleKey(moduleRef)}#${declaration.surface} outputs unknown Type ${moduleKey(output.module)}#${output.name}.`, request.range.start);
        }
      }
      const tag = request.alias === undefined ? declaration.tag : `${request.alias}:${declaration.tag}`;
      if (scope.has(tag)) fail(source, "MARKUP_SURFACE_COLLISION", `Surface tag <${tag}> is imported more than once.`, request.range.start);
      scope.set(tag, { tag, module, surface: declaration });
    }
  }
  return scope;
}

export async function decodeMarkup(source: MarkupSource, context: MarkupDecodeContext): Promise<MarkupDecodeResult> {
  const discovery = discoverMarkup(source);
  const sourceImports = context.sourceImports ?? [];
  const sourceImportsByRequest = new Map(sourceImports.map((item) => [
    `${item.request.from}\u0000${item.request.alias}`,
    item,
  ]));
  const importedBindings = new Map<string, AuthorSourceExport>();
  const importedReferences = new Map<string, SurfaceResolvedReference>();
  for (const request of discovery.imports.filter((item) => item.kind === "source")) {
    const resolved = sourceImportsByRequest.get(`${request.from}\u0000${request.alias}`);
    if (resolved === undefined) {
      fail(
        source,
        "MARKUP_SOURCE_IMPORT_UNRESOLVED",
        `Source import "${request.from}" must be decoded before this source.`,
        request.range.start,
      );
    }
    const importedRecords = new Map(resolved.records.map((record) => [record.id, record]));
    for (const item of resolved.exports) {
      const name = `${request.alias}.${item.name}`;
      if (importedBindings.has(name)) {
        fail(source, "MARKUP_SOURCE_EXPORT_COLLISION", `Imported binding ${name} is duplicated.`, request.range.start);
      }
      importedBindings.set(name, item);
      const recordId = item.ref.kind === "record" ? item.ref.id : undefined;
      const record = recordId === undefined
        ? undefined
        : importedRecords.get(recordId);
      importedReferences.set(name, {
        path: name,
        ref: item.ref,
        type: item.type,
        ...(record === undefined ? {} : { record }),
      });
    }
  }
  const scope = surfaceScope(source, discovery.imports, context);
  const records: TypedRecord[] = [];
  const recordsById = new Map<string, TypedRecord>();
  const components: AuthorComponent[] = [];
  const componentRanges = new Map<string, SurfaceComponentDraft["range"]>();
  const fragments = new Map<string, GraphFragment>();
  const fragmentExports = new Map<string, ReadonlyMap<string, GraphFragment["exports"][number]>>();
  const componentReferences = new Map<string, SurfaceResolvedReference>();
  const waitingComponents = new Map<string, AuthorComponent[]>();
  const indexComponent = (component: AuthorComponent, fragment: GraphFragment): void => {
    const declarations = fragmentExports.get(fragment.id)
      ?? new Map(fragment.exports.map((item) => [item.name, item]));
    fragmentExports.set(fragment.id, declarations);
    for (const [output, path] of Object.entries(component.outputs)) {
      const declaration = declarations.get(output);
      if (declaration === undefined) continue;
      componentReferences.set(path, {
        path,
        ref: { kind: "component-output", component: component.id, output },
        type: declaration.type,
      });
    }
  };
  const recordIds = new Set<string>();
  const componentIds = new Set<string>();
  const privateBindings = new Set<string>();
  let cursor = discovery.bodyStart;
  let closed = false;
  while (cursor < source.text.length) {
    cursor = skipTextTrivia(source, cursor);
    if (source.text.startsWith("</", cursor)) {
      cursor = closeDocument(source, cursor);
      closed = true;
      break;
    }
    if (source.text[cursor] !== "<") {
      fail(source, "MARKUP_BODY_TEXT", "Natural-language text is not allowed directly under <svml>.", cursor);
    }
    const opening = parseOpeningTag(source, cursor);
    if (opening.name === "import") {
      fail(source, "MARKUP_IMPORT_AFTER_BODY", "All imports must appear in the leading Import Prologue.", cursor);
    }
    const bound = scope.get(opening.name);
    if (!bound) fail(source, "MARKUP_UNKNOWN_SURFACE", `No imported module declares <${opening.name}>.`, cursor);
    const registered = bound.surface;
    let output: SurfaceDecodeOutput;
    if (registered.mode === "raw") {
      if (opening.selfClosing) fail(source, "MARKUP_RAW_SELF_CLOSING", `Raw Surface <${opening.name}> cannot be self-closing.`, cursor);
      const rawOutput = await (registered.handler as RawSurfaceHandler)({
        sourceName: source.name,
        source: source.text,
        tag: opening.name,
        openingStart: opening.start,
        contentStart: opening.end,
        attributes: opening.attributes,
        resolveAsset(request) {
          if (context.resolveAsset === undefined) {
            fail(source, "MARKUP_ASSET_RESOLVER_MISSING", `Surface <${opening.name}> requested ${request.from}, but this Markup Host has no asset resolver.`, request.range?.start ?? opening.start);
          }
          return context.resolveAsset(request);
        },
      });
      if (!Number.isInteger(rawOutput.nextOffset) || rawOutput.nextOffset <= opening.end || rawOutput.nextOffset > source.text.length) {
        fail(source, "MARKUP_SURFACE_CURSOR", `Raw Surface <${opening.name}> returned an invalid cursor.`, cursor);
      }
      cursor = rawOutput.nextOffset;
      output = rawOutput;
    } else {
      const parsed = parseStructuredElement(source, cursor);
      output = await (registered.handler as StructuredSurfaceHandler)({
        sourceName: source.name,
        element: parsed.element,
        resolveReference(path) {
          const imported = importedReferences.get(path);
          if (imported !== undefined) {
            return imported.record === undefined
              ? imported
              : { ...imported, record: canonicalize(imported.record) as unknown as TypedRecord };
          }
          const record = recordsById.get(path);
          if (record !== undefined) {
            return {
                path,
                ref: { kind: "record", id: record.id },
                type: record.type,
                record: canonicalize(record) as unknown as TypedRecord,
            };
          }
          return componentReferences.get(path);
        },
        resolveAsset(request) {
          if (context.resolveAsset === undefined) {
            fail(source, "MARKUP_ASSET_RESOLVER_MISSING", `Surface <${opening.name}> requested ${request.from}, but this Markup Host has no asset resolver.`, request.range?.start ?? opening.start);
          }
          return context.resolveAsset(request);
        },
      });
      cursor = parsed.nextOffset;
    }
    if (output.exports !== undefined) {
      const generated = [
        ...output.records.map((draft) => draft.id),
        ...output.components.flatMap((draft) => Object.values(draft.outputs)),
      ];
      const available = new Set(generated);
      const published = new Set<string>();
      for (const name of output.exports) {
        if (!available.has(name)) {
          fail(
            source,
            "MARKUP_SURFACE_EXPORT_UNKNOWN",
            `Surface ${moduleKey(bound.module.manifest)}#${registered.surface} publishes unknown binding ${name}.`,
            opening.start,
          );
        }
        if (published.has(name)) {
          fail(
            source,
            "MARKUP_SURFACE_EXPORT_DUPLICATE",
            `Surface ${moduleKey(bound.module.manifest)}#${registered.surface} publishes ${name} more than once.`,
            opening.start,
          );
        }
        published.add(name);
      }
      for (const name of generated) if (!published.has(name)) privateBindings.add(name);
    }
    for (const draft of output.records) {
      if (
        !Number.isInteger(draft.range.start)
        || !Number.isInteger(draft.range.end)
        || draft.range.start < opening.start
        || draft.range.end < draft.range.start
        || draft.range.end > cursor
      ) {
        fail(
          source,
          "MARKUP_SURFACE_RANGE",
          `Surface ${moduleKey(bound.module.manifest)}#${registered.surface} returned an invalid source range.`,
          opening.start,
        );
      }
      if (recordIds.has(draft.id)) fail(source, "MARKUP_RECORD_DUPLICATE", `Duplicate authored record "${draft.id}".`, draft.range.start);
      if (!registered.outputs.some((output) => sameModule(output.module, draft.type.module) && output.name === draft.type.name)) {
        fail(
          source,
          "MARKUP_SURFACE_OUTPUT",
          `Surface ${moduleKey(bound.module.manifest)}#${registered.surface} did not declare output type ${moduleKey(draft.type.module)}#${draft.type.name}.`,
          draft.range.start,
        );
      }
      recordIds.add(draft.id);
      const record = sealRecord({
        id: draft.id,
        type: draft.type,
        value: draft.value,
      });
      records.push(record);
      recordsById.set(record.id, record);
    }
    for (const draft of output.components) {
      if (
        !Number.isInteger(draft.range.start)
        || !Number.isInteger(draft.range.end)
        || draft.range.start < opening.start
        || draft.range.end < draft.range.start
        || draft.range.end > cursor
      ) {
        fail(
          source,
          "MARKUP_COMPONENT_RANGE",
          `Surface ${moduleKey(bound.module.manifest)}#${registered.surface} returned an invalid component source range.`,
          opening.start,
        );
      }
      if (draft.id.length === 0) {
        fail(source, "MARKUP_COMPONENT_ID", "Surface returned a component with an empty id.", draft.range.start);
      }
      if (componentIds.has(draft.id)) {
        fail(source, "MARKUP_COMPONENT_DUPLICATE", `Duplicate author component "${draft.id}".`, draft.range.start);
      }
      if (draft.fragment.length === 0) {
        fail(source, "MARKUP_COMPONENT_FRAGMENT", `${draft.id} returned an empty Fragment id.`, draft.range.start);
      }
      componentIds.add(draft.id);
      componentRanges.set(draft.id, draft.range);
      const component = {
        id: draft.id,
        fragment: draft.fragment,
        inputs: draft.inputs,
        outputs: draft.outputs,
      };
      components.push(component);
      const fragment = fragments.get(component.fragment);
      if (fragment === undefined) {
        const waiting = waitingComponents.get(component.fragment) ?? [];
        waiting.push(component);
        waitingComponents.set(component.fragment, waiting);
      } else {
        indexComponent(component, fragment);
      }
    }
    for (const fragment of output.fragments) {
      if (fragment.format !== "narratage.fragment@1" || fragment.id.length === 0) {
        fail(
          source,
          "MARKUP_FRAGMENT_IDENTITY",
          `Surface ${moduleKey(bound.module.manifest)}#${registered.surface} returned an invalid Graph Fragment.`,
          opening.start,
        );
      }
      const existing = fragments.get(fragment.id);
      if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(fragment)) {
        fail(source, "MARKUP_FRAGMENT_CONFLICT", `Graph Fragment ${fragment.id} has conflicting definitions.`, opening.start);
      }
      fragments.set(fragment.id, fragment);
      fragmentExports.set(fragment.id, new Map(fragment.exports.map((item) => [item.name, item])));
      for (const component of waitingComponents.get(fragment.id) ?? []) indexComponent(component, fragment);
      waitingComponents.delete(fragment.id);
    }
  }
  if (!closed) {
    fail(source, "MARKUP_ROOT_UNCLOSED", "Document is missing </svml>.", source.text.length);
  }
  for (const component of components) {
    if (!fragments.has(component.fragment)) {
      fail(
        source,
        "MARKUP_COMPONENT_FRAGMENT_MISSING",
        `${component.id} references Fragment ${component.fragment} that no Surface contributed.`,
        componentRanges.get(component.id)?.start,
      );
    }
  }
  const resolveImportedRef = (ref: AuthorValueRef): AuthorValueRef => {
    const path = ref.kind === "record" ? ref.id : `${ref.component}.${ref.output}`;
    return importedBindings.get(path)?.ref ?? ref;
  };
  const resolvedComponents = components.map((component) => ({
    ...component,
    inputs: Object.fromEntries(Object.entries(component.inputs).map(([name, ref]) => [
      name,
      resolveImportedRef(ref),
    ])),
  }));
  const exports: AuthorSourceExport[] = records.filter((record) => !privateBindings.has(record.id)).map((record) => ({
    name: record.id,
    ref: { kind: "record", id: record.id },
    type: record.type,
  }));
  const exportNames = new Set(exports.map((item) => item.name));
  for (const component of resolvedComponents) {
    const fragment = fragments.get(component.fragment) as GraphFragment;
    for (const [output, name] of Object.entries(component.outputs)) {
      if (privateBindings.has(name)) continue;
      if (exportNames.has(name)) fail(source, "MARKUP_EXPORT_DUPLICATE", `Duplicate public export ${name}.`);
      const declaration = fragmentExports.get(fragment.id)?.get(output);
      if (declaration === undefined) {
        fail(source, "MARKUP_COMPONENT_EXPORT", `${component.id} binds unknown Fragment export ${output}.`);
      }
      exportNames.add(name);
      exports.push({
        name,
        ref: { kind: "component-output", component: component.id, output },
        type: declaration.type,
      });
    }
  }
  return {
    records,
    components: resolvedComponents,
    fragments: [...fragments.values()].sort((left, right) => left.id.localeCompare(right.id)),
    exports: exports.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

/** Adapt the official Markup decoder to the domain-neutral recursive Source Closure ABI. */
export function createMarkupAuthorFrontend(options: MarkupAuthorFrontendOptions): MarkupAuthorFrontend {
  return {
    id: markupAuthorFrontendId,
    discover(source) {
      const discovery = discoverMarkup(source);
      return {
        modules: discovery.imports.filter((item) => item.kind === "module").map((item) => item.from),
        sources: discovery.imports
          .filter((item): item is MarkupImportRequest & { alias: string; kind: "source" } =>
            item.kind === "source" && item.alias !== undefined)
          .map((item) => ({
            from: item.from,
            alias: item.alias,
            range: item.range,
          })),
      };
    },
    async decode(source, context) {
      const result = await decodeMarkup(
        { name: source.name, text: source.text },
        {
          closure: context.closure,
          registry: options.registry,
          resolveModule: options.resolveModule,
          sourceImports: context.imports,
          resolveAsset: context.resolveAsset,
        },
      );
      return {
        records: result.records,
        components: result.components,
        fragments: result.fragments,
        exports: result.exports,
      };
    },
  };
}
