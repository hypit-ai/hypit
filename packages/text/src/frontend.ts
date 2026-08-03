import {
  digestOf,
  sealRecord,
  sealTypedModule,
  verifyClosure,
  verifyRecord,
} from "@svml/core";
import type { CanonicalValue, ModuleRef, ResolvedModule, SurfaceDeclaration } from "@svml/protocol";

import { TextFrontendError } from "./error.js";
import {
  closeDocument,
  discoverText,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "./syntax.js";
import type {
  RawSurfaceHandler,
  SourceUnit,
  StructuredSurfaceHandler,
  SurfaceRecordDraft,
  TextDecodeContext,
  TextDecodeResult,
  TextImportRequest,
} from "./types.js";

export const textFrontendRef = { module: "@svml/text", version: "0.0.0-dev", name: "text" } as const;
export const textFrontendImplementationDigest = digestOf("@svml/text/frontend@0");

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
  throw new TextFrontendError(code, message, source.name, offset);
}

function moduleForImport(
  source: SourceUnit,
  request: TextImportRequest,
  context: TextDecodeContext,
): ResolvedModule {
  const ref = context.resolveModule(request);
  const module = context.closure.modules.find((item) => sameModule(item.ref, ref));
  if (!module) {
    fail(source, "TEXT_IMPORT_CLOSURE", `${moduleKey(ref)} is not present in the resolved closure.`, request.range.start);
  }
  return module;
}

function surfaceScope(
  source: SourceUnit,
  imports: readonly TextImportRequest[],
  context: TextDecodeContext,
): Map<string, BoundSurface> {
  const scope = new Map<string, BoundSurface>();
  const aliases = new Set<string>();
  for (const request of imports) {
    if (request.alias !== undefined) {
      if (aliases.has(request.alias)) fail(source, "TEXT_ALIAS_DUPLICATE", `Duplicate import alias "${request.alias}".`, request.range.start);
      aliases.add(request.alias);
    }
    if (request.using !== undefined) continue;
    const module = moduleForImport(source, request, context);
    for (const declaration of module.manifest.surfaces) {
      const tag = request.alias === undefined ? declaration.tag : `${request.alias}:${declaration.tag}`;
      if (scope.has(tag)) fail(source, "TEXT_SURFACE_COLLISION", `Surface tag <${tag}> is imported more than once.`, request.range.start);
      scope.set(tag, { tag, module, declaration });
    }
  }
  return scope;
}

export function decodeText(source: SourceUnit, context: TextDecodeContext): TextDecodeResult {
  verifyClosure(context.closure);
  const discovery = discoverText(source);
  if (discovery.imports.some((request) => request.using !== undefined)) {
    const request = discovery.imports.find((item) => item.using !== undefined)!;
    fail(
      source,
      "TEXT_SOURCE_IMPORT_UNRESOLVED",
      `Source import "${request.from}" must be decoded by Driver before this SourceUnit.`,
      request.range.start,
    );
  }
  const scope = surfaceScope(source, discovery.imports, context);
  const sourceDigest = digestOf(source.text);
  const frontendClosureDigest = digestOf({
    frontend: textFrontendImplementationDigest,
    surfaces: [...scope.values()]
      .sort((left, right) => left.tag.localeCompare(right.tag))
      .map((surface) => ({
        tag: surface.tag,
        module: surface.module.ref,
        moduleDigest: surface.module.digest,
        name: surface.declaration.name,
        implementationDigest: surface.declaration.implementation.digest,
      })),
  });
  const records = [];
  const sourceMaps: CanonicalValue[] = [];
  const recordIds = new Set<string>();
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
      fail(source, "TEXT_BODY_TEXT", "Natural-language text is not allowed directly under <svml>.", cursor);
    }
    const opening = parseOpeningTag(source, cursor);
    if (opening.name === "import") {
      fail(source, "TEXT_IMPORT_AFTER_BODY", "All imports must appear in the leading Import Prologue.", cursor);
    }
    const bound = scope.get(opening.name);
    if (!bound) fail(source, "TEXT_UNKNOWN_SURFACE", `No imported module declares <${opening.name}>.`, cursor);
    const registered = context.registry.resolve(bound.module.ref, bound.declaration.name);
    if (!registered) {
      fail(source, "TEXT_SURFACE_UNREGISTERED", `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} is not registered.`, cursor);
    }
    if (
      registered.mode !== bound.declaration.mode
      || registered.implementationDigest !== bound.declaration.implementation.digest
    ) {
      fail(source, "TEXT_SURFACE_MISMATCH", `Registered Surface ${bound.declaration.name} does not match the locked Manifest.`, cursor);
    }
    let drafts: readonly SurfaceRecordDraft[];
    let maps: readonly CanonicalValue[] | undefined;
    if (bound.declaration.mode === "raw") {
      if (opening.selfClosing) fail(source, "TEXT_RAW_SELF_CLOSING", `Raw Surface <${opening.name}> cannot be self-closing.`, cursor);
      const output = (registered.handler as RawSurfaceHandler)({
        sourceName: source.name,
        source: source.text,
        tag: opening.name,
        openingStart: opening.start,
        contentStart: opening.end,
        attributes: opening.attributes,
      });
      if (!Number.isInteger(output.nextOffset) || output.nextOffset <= opening.end || output.nextOffset > source.text.length) {
        fail(source, "TEXT_SURFACE_CURSOR", `Raw Surface <${opening.name}> returned an invalid cursor.`, cursor);
      }
      cursor = output.nextOffset;
      drafts = output.records;
      maps = output.sourceMaps;
    } else {
      const parsed = parseStructuredElement(source, cursor);
      const output = (registered.handler as StructuredSurfaceHandler)({
        sourceName: source.name,
        element: parsed.element,
      });
      cursor = parsed.nextOffset;
      drafts = output.records;
      maps = output.sourceMaps;
    }
    for (const draft of drafts) {
      if (
        !Number.isInteger(draft.range.start)
        || !Number.isInteger(draft.range.end)
        || draft.range.start < opening.start
        || draft.range.end < draft.range.start
        || draft.range.end > cursor
      ) {
        fail(
          source,
          "TEXT_SURFACE_RANGE",
          `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} returned an invalid source range.`,
          opening.start,
        );
      }
      if (recordIds.has(draft.id)) fail(source, "TEXT_RECORD_DUPLICATE", `Duplicate authored record "${draft.id}".`, draft.range.start);
      if (!bound.declaration.outputs.some((output) => sameModule(output.module, draft.type.module) && output.name === draft.type.name)) {
        fail(
          source,
          "TEXT_SURFACE_OUTPUT",
          `Surface ${moduleKey(bound.module.ref)}#${bound.declaration.name} did not declare output type ${moduleKey(draft.type.module)}#${draft.type.name}.`,
          draft.range.start,
        );
      }
      recordIds.add(draft.id);
      const record = sealRecord({
        id: draft.id,
        type: draft.type,
        value: draft.value,
        conformance: "exact",
        origin: {
          kind: "authored",
          sourceDigest,
          frontendClosureDigest,
          sourceName: source.name,
          range: draft.range,
        },
      });
      verifyRecord(context.closure, record);
      records.push(record);
    }
    sourceMaps.push(...(maps ?? []));
  }
  if (!closed) {
    fail(source, "TEXT_ROOT_UNCLOSED", "Document is missing </svml>.", source.text.length);
  }
  return {
    module: sealTypedModule({
      id: `source:${source.name}`,
      closureDigest: context.closure.digest,
      records,
    }),
    imports: discovery.imports,
    frontendClosureDigest,
    sourceMaps,
  };
}

export const textFrontend = {
  id: textFrontendRef,
  discover: discoverText,
  decode: decodeText,
} as const;
