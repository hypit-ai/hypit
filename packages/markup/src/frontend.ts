import {
  canonicalize,
  canonicalStringify,
  digestOf,
  isDigest,
  sealRecord,
  sealTypedModule,
  verifyClosure,
  verifyRecordStructure,
} from "@narratage/core";
import type {
  CanonicalValue,
  ModuleRef,
  ResolvedModule,
  SurfaceDeclaration,
  TypedRecord,
} from "@narratage/protocol";
import { sealAuthorModule } from "@narratage/elaborator";
import type {
  AuthorComponent,
  AuthorSourceExport,
  AuthorValueRef,
  GraphFragment,
  ResolvedAuthorSourceImport,
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
  SourceUnit,
  StructuredSurfaceHandler,
  SurfaceComponentDraft,
  SurfaceDecodeOutput,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
  MarkupDecodeContext,
  MarkupDecodeResult,
  MarkupAuthorFrontend,
  MarkupAuthorFrontendOptions,
  MarkupImportRequest,
} from "./types.js";

export const markupFrontendRef = { module: "@narratage/markup", version: "1", name: "markup" } as const;
export const markupFrontendImplementationDigest = digestOf("@narratage/markup/frontend@1");
export const markupAuthorFrontendId = "@narratage/markup@1";

type BoundSurface = {
  readonly tag: string;
  readonly module: ResolvedModule;
  readonly declaration: SurfaceDeclaration;
};

function moduleKey(ref: ModuleRef): string {
  return `${ref.name}@${ref.version}`;
}

function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name && left.version === right.version;
}

function fail(source: SourceUnit, code: string, message: string, offset?: number): never {
  throw new MarkupFrontendError(code, message, source.name, offset, source.text);
}

function moduleForImport(
  source: SourceUnit,
  request: MarkupImportRequest,
  context: MarkupDecodeContext,
): ResolvedModule {
  const ref = context.resolveModule(request);
  const module = context.closure.modules.find((item) => sameModule(item.ref, ref));
  if (!module) {
    fail(source, "MARKUP_IMPORT_CLOSURE", `${moduleKey(ref)} is not present in the resolved closure.`, request.range.start);
  }
  return module;
}

function surfaceScope(
  source: SourceUnit,
  imports: readonly MarkupImportRequest[],
  context: MarkupDecodeContext,
): Map<string, BoundSurface> {
  const scope = new Map<string, BoundSurface>();
  const aliases = new Set<string>();
  for (const request of imports) {
    if (request.alias !== undefined) {
      if (aliases.has(request.alias)) fail(source, "MARKUP_ALIAS_DUPLICATE", `Duplicate import alias "${request.alias}".`, request.range.start);
      aliases.add(request.alias);
    }
    if (request.kind === "source") continue;
    const module = moduleForImport(source, request, context);
    for (const declaration of module.manifest.surfaces) {
      const tag = request.alias === undefined ? declaration.tag : `${request.alias}:${declaration.tag}`;
      if (scope.has(tag)) fail(source, "MARKUP_SURFACE_COLLISION", `Surface tag <${tag}> is imported more than once.`, request.range.start);
      scope.set(tag, { tag, module, declaration });
    }
  }
  return scope;
}

export async function decodeMarkup(source: SourceUnit, context: MarkupDecodeContext): Promise<MarkupDecodeResult> {
  verifyClosure(context.closure);
  const discovery = discoverMarkup(source);
  const sourceImports = context.sourceImports ?? [];
  const importedBindings = new Map<string, AuthorSourceExport>();
  const importedReferences = new Map<string, SurfaceResolvedReference>();
  for (const request of discovery.imports.filter((item) => item.kind === "source")) {
    const resolved = sourceImports.find((item) =>
      item.request.from === request.from
      && item.request.alias === request.alias);
    if (resolved === undefined) {
      fail(
        source,
        "MARKUP_SOURCE_IMPORT_UNRESOLVED",
        `Source import "${request.from}" must be decoded before this SourceUnit.`,
        request.range.start,
      );
    }
    for (const item of resolved.exports) {
      const name = `${request.alias}.${item.name}`;
      if (importedBindings.has(name)) {
        fail(source, "MARKUP_SOURCE_EXPORT_COLLISION", `Imported binding ${name} is duplicated.`, request.range.start);
      }
      importedBindings.set(name, item);
      const recordId = item.ref.kind === "record" ? item.ref.id : undefined;
      const record = recordId === undefined
        ? undefined
        : resolved.records.find((candidate) => candidate.id === recordId);
      importedReferences.set(name, {
        path: name,
        ref: item.ref,
        type: item.type,
        ...(record === undefined ? {} : { record }),
      });
    }
  }
  const scope = surfaceScope(source, discovery.imports, context);
  const sourceDigest = source.sourceDigest ?? digestOf(source.text);
  const frontendClosureDigest = digestOf({
    frontend: markupFrontendImplementationDigest,
    surfaces: [...scope.values()]
      .sort((left, right) => left.tag.localeCompare(right.tag))
      .map((surface) => ({
        tag: surface.tag,
        module: surface.module.ref,
        moduleDigest: surface.module.digest,
        name: surface.declaration.name,
        implementationDigest: surface.declaration.implementation.digest,
      })),
    sourceImports: sourceImports
      .map((item) => ({
        from: item.request.from,
        alias: item.request.alias,
        frontend: item.frontend,
        frontendDigest: item.frontendDigest,
        source: item.source,
        exports: item.exports,
      }))
      .sort((left, right) => left.alias.localeCompare(right.alias)),
  });
  const records: TypedRecord[] = [];
  const components: AuthorComponent[] = [];
  const componentRanges = new Map<string, SurfaceComponentDraft["range"]>();
  const fragments = new Map<string, GraphFragment>();
  const sourceMaps: CanonicalValue[] = [];
  const recordIds = new Set<string>();
  const componentIds = new Set<string>();
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
    const registered = context.registry.resolve(bound.module.ref, bound.declaration.name);
    if (!registered) {
      fail(source, "MARKUP_SURFACE_UNREGISTERED", `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} is not registered.`, cursor);
    }
    if (
      registered.mode !== bound.declaration.mode
      || registered.implementationDigest !== bound.declaration.implementation.digest
    ) {
      fail(source, "MARKUP_SURFACE_MISMATCH", `Registered Surface ${bound.declaration.name} does not match the locked Manifest.`, cursor);
    }
    let output: SurfaceDecodeOutput;
    if (bound.declaration.mode === "raw") {
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
          const record = records.find((candidate) => candidate.id === path);
          if (record !== undefined) {
            return {
                path,
                ref: { kind: "record", id: record.id },
                type: record.type,
                record: canonicalize(record) as unknown as TypedRecord,
            };
          }
          for (const component of components) {
            const output = Object.entries(component.outputs).find(([, publicName]) => publicName === path);
            if (output === undefined) continue;
            const fragment = fragments.get(component.fragment);
            const declaration = fragment?.exports.find((candidate) => candidate.name === output[0]);
            if (declaration === undefined) continue;
            return {
              path,
              ref: { kind: "component-output", component: component.id, output: output[0] },
              type: declaration.type,
            };
          }
          return undefined;
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
          `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} returned an invalid source range.`,
          opening.start,
        );
      }
      if (recordIds.has(draft.id)) fail(source, "MARKUP_RECORD_DUPLICATE", `Duplicate authored record "${draft.id}".`, draft.range.start);
      if (!bound.declaration.outputs.some((output) => sameModule(output.module, draft.type.module) && output.name === draft.type.name)) {
        fail(
          source,
          "MARKUP_SURFACE_OUTPUT",
          `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} did not declare output type ${moduleKey(draft.type.module)}#${draft.type.name}.`,
          draft.range.start,
        );
      }
      recordIds.add(draft.id);
      const record = sealRecord({
        id: draft.id,
        type: draft.type,
        value: draft.value,
        origin: { kind: "authored" },
      });
      verifyRecordStructure(context.closure, record);
      records.push(record);
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
          `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} returned an invalid component source range.`,
          opening.start,
        );
      }
      if (draft.id.length === 0) {
        fail(source, "MARKUP_COMPONENT_ID", "Surface returned a component with an empty id.", draft.range.start);
      }
      if (componentIds.has(draft.id)) {
        fail(source, "MARKUP_COMPONENT_DUPLICATE", `Duplicate author component "${draft.id}".`, draft.range.start);
      }
      if (!isDigest(draft.fragment)) {
        fail(source, "MARKUP_COMPONENT_FRAGMENT", `${draft.id} returned an invalid Fragment digest.`, draft.range.start);
      }
      componentIds.add(draft.id);
      componentRanges.set(draft.id, draft.range);
      components.push({
        id: draft.id,
        fragment: draft.fragment,
        inputs: draft.inputs,
        outputs: draft.outputs,
      });
    }
    for (const fragment of output.fragments) {
      if (fragment.format !== "svml.fragment@1" || !isDigest(fragment.id)) {
        fail(
          source,
          "MARKUP_FRAGMENT_IDENTITY",
          `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} returned an invalid Graph Fragment identity.`,
          opening.start,
        );
      }
      const existing = fragments.get(fragment.id);
      if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(fragment)) {
        fail(source, "MARKUP_FRAGMENT_CONFLICT", `Graph Fragment ${fragment.id} has conflicting definitions.`, opening.start);
      }
      fragments.set(fragment.id, fragment);
    }
    sourceMaps.push(...(output.sourceMaps ?? []));
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
  const exports: AuthorSourceExport[] = records.map((record) => ({
    name: record.id,
    ref: { kind: "record", id: record.id },
    type: record.type,
  }));
  const exportNames = new Set(exports.map((item) => item.name));
  for (const component of resolvedComponents) {
    const fragment = fragments.get(component.fragment) as GraphFragment;
    for (const [output, name] of Object.entries(component.outputs)) {
      if (exportNames.has(name)) fail(source, "MARKUP_EXPORT_DUPLICATE", `Duplicate public export ${name}.`);
      const declaration = fragment.exports.find((item) => item.name === output);
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
    module: sealTypedModule({
      id: `source:${source.name}`,
      closureDigest: context.closure.digest,
      records,
    }),
    author: sealAuthorModule({
      name: `source:${source.name}`,
      components: resolvedComponents,
    }),
    fragments: [...fragments.values()].sort((left, right) => left.id.localeCompare(right.id)),
    exports: exports.sort((left, right) => left.name.localeCompare(right.name)),
    imports: discovery.imports,
    frontendClosureDigest,
    sourceMaps,
  };
}

export const markupFrontend = {
  id: markupFrontendRef,
  discover: discoverMarkup,
  decode: decodeMarkup,
} as const;

/** Adapt the official Markup decoder to the domain-neutral recursive Source Closure ABI. */
export function createMarkupAuthorFrontend(options: MarkupAuthorFrontendOptions): MarkupAuthorFrontend {
  return {
    id: markupAuthorFrontendId,
    implementationDigest: markupFrontendImplementationDigest,
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
        { name: source.name, text: source.text, sourceDigest: source.sourceDigest },
        {
          closure: context.closure,
          registry: options.registry,
          resolveModule: options.resolveModule,
          sourceImports: context.imports,
          resolveAsset: context.resolveAsset,
        },
      );
      return {
        module: result.module,
        author: result.author,
        fragments: result.fragments,
        exports: result.exports,
      };
    },
  };
}
