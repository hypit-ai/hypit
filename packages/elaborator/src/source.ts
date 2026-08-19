import { link } from "@hypit/core";
import { canonicalStringify, isDigest } from "@hypit/protocol";
import type {
  CompiledGraph,
  GraphValueRef,
  LinkedProgram,
  ResolvedModuleClosure,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import {
  maskSourceHeader,
  parseSourceHeader,
} from "@hypit/source";
import type {
  ResolvedSourceAsset,
  SourceAssetRequest,
  SourceAssetResolver,
  SourceHeader,
  SourceImportRequest,
  SourceResolver,
  SourceUnit,
} from "@hypit/source";

import {
  elaborateAuthorGraph,
} from "./author.js";
import type {
  AuthorComponent,
  AuthorValueRef,
} from "./author.js";
import type { GraphFragment } from "./fragment.js";

export type AuthorSourceUnit = SourceUnit;

/** Source presented to a Frontend after the mandatory Header has been admitted and masked. */
export type AuthorFrontendSourceUnit = AuthorSourceUnit & {
  readonly header: SourceHeader;
};

export type AuthorSourceImport = SourceImportRequest;

export type AuthorSourceDiscovery = {
  readonly modules: readonly string[];
  readonly sources: readonly AuthorSourceImport[];
};

/** A semantic source dependency requested by a Frontend or package-owned Surface. */
export type AuthorSourceAssetRequest = SourceAssetRequest;

export type ResolvedAuthorSourceAsset = ResolvedSourceAsset;

export type AuthorSourceExport = {
  /** Relative public name. The importing source contributes its own alias. */
  readonly name: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
};

export type ResolvedAuthorSourceImport = {
  readonly request: AuthorSourceImport;
  readonly source: string;
  readonly exports: readonly AuthorSourceExport[];
  /** Public record exports available to a package-owned Surface during author compilation. */
  readonly records: readonly TypedRecord[];
};

export type AuthorSourceDecodeContext = {
  readonly closure: ResolvedModuleClosure;
  readonly imports: readonly ResolvedAuthorSourceImport[];
  /** Host authority: Frontends declare asset dependencies but never open files themselves. */
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<ResolvedAuthorSourceAsset>;
};

export type DecodedAuthorSource = {
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
  readonly fragments: readonly GraphFragment[];
  readonly exports: readonly AuthorSourceExport[];
};

export type Awaitable<T> = T | Promise<T>;

export type AuthorFrontend = {
  readonly id: string;
  discover(source: AuthorFrontendSourceUnit): Awaitable<AuthorSourceDiscovery>;
  decode(source: AuthorFrontendSourceUnit, context: AuthorSourceDecodeContext): Awaitable<DecodedAuthorSource>;
};

export interface AuthorFrontendRegistryLike {
  resolve(id: string): AuthorFrontend | undefined;
}

export class AuthorFrontendRegistry implements AuthorFrontendRegistryLike {
  readonly #frontends = new Map<string, AuthorFrontend>();

  register(frontend: AuthorFrontend): void {
    if (frontend.id.length === 0) throw new SourceClosureError("EMPTY_FRONTEND_ID", "Frontend id is empty");
    if (this.#frontends.has(frontend.id)) {
      throw new SourceClosureError("DUPLICATE_FRONTEND", `Frontend ${frontend.id} is already registered`, frontend.id);
    }
    this.#frontends.set(frontend.id, frontend);
  }

  resolve(id: string): AuthorFrontend | undefined {
    return this.#frontends.get(id);
  }
}

export type AuthorSourceResolver = SourceResolver;

export type AuthorSourceAssetResolver = SourceAssetResolver;

/** Host-owned admission gate for one already sealed authored Record. */
export type AuthorRecordAdmitter = (
  closure: ResolvedModuleClosure,
  record: TypedRecord,
) => Awaitable<void>;

export type SourceClosureUnit = {
  readonly id: string;
  readonly frontend: string;
  readonly imports: readonly {
    readonly alias: string;
    readonly source: string;
  }[];
};

export type SourceClosure = {
  readonly entry: string;
  readonly units: readonly SourceClosureUnit[];
};

export type CompiledSourceExport = {
  readonly name: string;
  readonly type: TypeRef;
  readonly ref: GraphValueRef;
};

export type CompiledSourceClosure = {
  readonly closure: SourceClosure;
  readonly program: LinkedProgram;
  readonly graph: CompiledGraph;
  readonly exports: readonly CompiledSourceExport[];
};

export type CompileSourceClosureRequest = {
  readonly entry: AuthorSourceUnit;
  readonly closure: ResolvedModuleClosure;
  readonly frontends: AuthorFrontendRegistryLike;
  /**
   * Optional Host-frozen discovery result. A Host that used discovery to construct `closure`
   * should pass that exact result back instead of executing Frontend discovery a second time.
   */
  readonly discover?: (
    source: AuthorFrontendSourceUnit,
    frontend: AuthorFrontend,
  ) => Awaitable<AuthorSourceDiscovery>;
  readonly resolveSource: AuthorSourceResolver;
  readonly resolveAsset?: AuthorSourceAssetResolver;
  readonly admitRecord?: AuthorRecordAdmitter;
};

export class SourceClosureError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "SourceClosureError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(
  condition: unknown,
  code: string,
  message: string,
  subject?: string,
): asserts condition {
  if (!condition) throw new SourceClosureError(code, message, subject);
}

function typeName(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}#${type.name}`;
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function sourceKey(source: AuthorSourceUnit, frontend: string): string {
  return `${source.id}\u0000${frontend}`;
}

export function prepareAuthorSource(source: AuthorSourceUnit): AuthorFrontendSourceUnit {
  const header = parseSourceHeader(source.name, source.text);
  return {
    ...source,
    text: maskSourceHeader(source.text, header),
    header,
  };
}

type HygienicSource = {
  readonly unit: SourceClosureUnit;
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
  readonly fragments: readonly GraphFragment[];
  readonly exports: readonly AuthorSourceExport[];
};

function hygienicId(kind: string, unit: string, local: string): string {
  return `${unit}::${kind}::${local}`;
}

function hygienizeSource(
  source: AuthorFrontendSourceUnit,
  frontend: AuthorFrontend,
  decoded: DecodedAuthorSource,
  imports: readonly ResolvedAuthorSourceImport[],
): HygienicSource {
  const recordsById = new Map(decoded.records.map((record) => [record.id, record]));
  const componentsById = new Map(decoded.components.map((component) => [component.id, component]));
  const fragmentsById = new Map(decoded.fragments.map((fragment) => [fragment.id, fragment]));
  const fragmentExports = new Map(decoded.fragments.map((fragment) => [
    fragment.id,
    new Map(fragment.exports.map((item) => [item.name, item])),
  ]));
  const fragmentIds = new Set<string>();
  for (const fragment of decoded.fragments) {
    assert(!fragmentIds.has(fragment.id), "DUPLICATE_SOURCE_FRAGMENT", `${source.name} repeats Fragment ${fragment.id}`);
    fragmentIds.add(fragment.id);
  }
  const exportNames = new Set<string>();
  for (const item of decoded.exports) {
    assert(item.name.length > 0, "EMPTY_SOURCE_EXPORT", `${source.name} returned an empty export`);
    assert(!exportNames.has(item.name), "DUPLICATE_SOURCE_EXPORT", `${source.name} repeats export ${item.name}`, item.name);
    exportNames.add(item.name);
    const ref = item.ref;
    if (ref.kind === "record") {
      const record = recordsById.get(ref.id);
      assert(record !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unknown Record ${ref.id}`);
      assert(
        sameType(record.type, item.type),
        "SOURCE_EXPORT_TYPE_MISMATCH",
        `${source.name}.${item.name} declares ${typeName(item.type)} but exports ${typeName(record.type)}`,
      );
    } else {
      const component = componentsById.get(ref.component);
      assert(component !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unknown component ${ref.component}`);
      const fragment = fragmentsById.get(component.fragment);
      assert(fragment !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unavailable Fragment ${component.fragment}`);
      const declaration = fragmentExports.get(fragment.id)?.get(ref.output);
      assert(declaration !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unknown output ${ref.output}`);
      assert(
        sameType(declaration.type, item.type),
        "SOURCE_EXPORT_TYPE_MISMATCH",
        `${source.name}.${item.name} declares ${typeName(item.type)} but exports ${typeName(declaration.type)}`,
      );
    }
  }

  const recordIds = new Map(decoded.records.map((record) => [
    record.id,
    hygienicId("record", source.id, record.id),
  ]));
  const componentIds = new Map(decoded.components.map((component) => [
    component.id,
    hygienicId("component", source.id, component.id),
  ]));
  const outputIds = new Map<string, string>();
  for (const component of decoded.components) {
    for (const output of Object.values(component.outputs)) {
      outputIds.set(output, hygienicId("output", source.id, output));
    }
  }
  const mapRef = (ref: AuthorValueRef): AuthorValueRef => {
    if (ref.kind === "record") {
      return { kind: "record", id: recordIds.get(ref.id) ?? ref.id };
    }
    return {
      kind: "component-output",
      component: componentIds.get(ref.component) ?? ref.component,
      output: ref.output,
    };
  };
  const records = decoded.records.map((record) => ({
    ...record,
    id: recordIds.get(record.id) as string,
  }));
  const components = decoded.components.map((component) => ({
    id: componentIds.get(component.id) as string,
    fragment: component.fragment,
    inputs: Object.fromEntries(Object.entries(component.inputs).map(([name, ref]) => [name, mapRef(ref)])),
    outputs: Object.fromEntries(Object.entries(component.outputs).map(([name, id]) => [
      name,
      outputIds.get(id) as string,
    ])),
  }));
  const exports = decoded.exports.map((item) => ({ ...item, ref: mapRef(item.ref) }));
  const unitContent = {
    id: source.id,
    frontend: frontend.id,
    imports: imports
      .map((item) => ({
        alias: item.request.alias,
        source: item.source,
      }))
      .sort((left, right) => left.alias.localeCompare(right.alias)),
  };
  return {
    unit: unitContent,
    records,
    components,
    fragments: decoded.fragments,
    exports,
  };
}

function graphRefForExport(
  item: AuthorSourceExport,
  components: ReadonlyMap<string, AuthorComponent>,
): GraphValueRef {
  if (item.ref.kind === "record") return item.ref;
  const component = components.get(item.ref.component);
  assert(component !== undefined, "UNKNOWN_SOURCE_EXPORT", `export ${item.name} references ${item.ref.component}`);
  const output = component.outputs[item.ref.output];
  assert(output !== undefined, "UNKNOWN_SOURCE_EXPORT", `export ${item.name} references ${item.ref.component}.${item.ref.output}`);
  return { kind: "logical-output", id: output };
}

export async function compileSourceClosure(
  request: CompileSourceClosureRequest,
): Promise<CompiledSourceClosure> {
  const cache = new Map<string, HygienicSource>();
  const visiting: string[] = [];
  const visitingAt = new Map<string, number>();
  const ordered: HygienicSource[] = [];

  const compile = async (rawSource: AuthorSourceUnit): Promise<HygienicSource> => {
    assert(rawSource.id.length > 0, "EMPTY_SOURCE_ID", "SourceUnit id is empty");
    const source = prepareAuthorSource(rawSource);
    const frontendId = source.header.using;
    const key = sourceKey(rawSource, frontendId);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const cycle = visitingAt.get(key) ?? -1;
    assert(
      cycle === -1,
      "SOURCE_IMPORT_CYCLE",
      `Source imports cycle through ${[...visiting.slice(cycle), key].join(" -> ")}`,
      rawSource.id,
    );
    const frontend = request.frontends.resolve(frontendId);
    assert(frontend !== undefined, "UNKNOWN_FRONTEND", `Frontend ${frontendId} is not registered`, frontendId);
    visitingAt.set(key, visiting.length);
    visiting.push(key);
    const discovery = await (request.discover === undefined
      ? frontend.discover(source)
      : request.discover(source, frontend));
    const aliases = new Set<string>();
    const imports: ResolvedAuthorSourceImport[] = [];
    for (const dependency of discovery.sources) {
      assert(dependency.alias.length > 0, "EMPTY_SOURCE_ALIAS", `${source.name} has an empty source alias`);
      assert(!aliases.has(dependency.alias), "DUPLICATE_SOURCE_ALIAS", `${source.name} repeats alias ${dependency.alias}`);
      aliases.add(dependency.alias);
      const child = await request.resolveSource(rawSource, dependency);
      const compiled = await compile(child);
      const publicRecordIds = new Set(compiled.exports
        .filter((item) => item.ref.kind === "record")
        .map((item) => item.ref.kind === "record" ? item.ref.id : ""));
      imports.push({
        request: dependency,
        source: compiled.unit.id,
        exports: compiled.exports,
        records: compiled.records.filter((record) => publicRecordIds.has(record.id)),
      });
    }
    const assets = new Map<string, ResolvedAuthorSourceAsset>();
    const rawDecoded = await frontend.decode(source, {
      closure: request.closure,
      imports: structuredClone(imports),
      async resolveAsset(assetRequest) {
        assert(assetRequest.from.trim().length > 0, "EMPTY_SOURCE_ASSET", `${source.name} requested an empty asset`);
        assert(assetRequest.mediaType.trim().length > 0, "EMPTY_SOURCE_ASSET_MEDIA_TYPE", `${source.name} requested an asset without a media type`);
        const existing = assets.get(assetRequest.from);
        if (existing !== undefined) {
          assert(
            existing.artifact.mediaType === assetRequest.mediaType,
            "SOURCE_ASSET_MEDIA_TYPE_CONFLICT",
            `${source.name} assigns conflicting media types to ${assetRequest.from}`,
            assetRequest.from,
          );
          return { artifact: existing.artifact };
        }
        assert(
          request.resolveAsset !== undefined,
          "SOURCE_ASSET_RESOLVER_MISSING",
          `${source.name} requires source asset ${assetRequest.from}, but the Host has no asset resolver`,
          assetRequest.from,
        );
        const resolved = await request.resolveAsset(rawSource, assetRequest);
        const artifact = resolved.artifact;
        assert(artifact.kind === "blob", "INVALID_SOURCE_ASSET", `${assetRequest.from} did not resolve to a BlobRef`);
        assert(isDigest(artifact.digest), "INVALID_SOURCE_ASSET_DIGEST", `${assetRequest.from} has an invalid digest`);
        assert(Number.isSafeInteger(artifact.size) && artifact.size >= 0, "INVALID_SOURCE_ASSET_SIZE", `${assetRequest.from} has an invalid size`);
        assert(
          artifact.mediaType === assetRequest.mediaType,
          "SOURCE_ASSET_MEDIA_TYPE_MISMATCH",
          `${assetRequest.from} resolved as ${artifact.mediaType}, expected ${assetRequest.mediaType}`,
          assetRequest.from,
        );
        assets.set(assetRequest.from, { artifact });
        return { artifact };
      },
    });
    const admittedRecords: TypedRecord[] = [];
    for (const record of rawDecoded.records) {
      await request.admitRecord?.(request.closure, record);
      admittedRecords.push(record);
    }
    const decoded: DecodedAuthorSource = {
      ...rawDecoded,
      records: admittedRecords,
    };
    const result = hygienizeSource(source, frontend, decoded, imports);
    visiting.pop();
    visitingAt.delete(key);
    cache.set(key, result);
    ordered.push(result);
    return result;
  };

  const entry = await compile(request.entry);
  const records = ordered.flatMap((unit) => unit.records);
  const recordIds = new Set<string>();
  for (const record of records) {
    assert(!recordIds.has(record.id), "SOURCE_RECORD_COLLISION", `Source closure repeats Record ${record.id}`, record.id);
    recordIds.add(record.id);
  }
  const fragments = new Map<string, GraphFragment>();
  for (const fragment of ordered.flatMap((unit) => unit.fragments)) {
    const existing = fragments.get(fragment.id);
    assert(
      existing === undefined || canonicalStringify(existing) === canonicalStringify(fragment),
      "SOURCE_FRAGMENT_CONFLICT",
      `Source closure has conflicting Fragment ${fragment.id}`,
      fragment.id,
    );
    fragments.set(fragment.id, fragment);
  }
  const components = ordered.flatMap((unit) => unit.components);
  const program = link(request.closure, records);
  const graph = elaborateAuthorGraph(program, components, (id) => fragments.get(id));
  const units = ordered.map((unit) => unit.unit).sort((left, right) => left.id.localeCompare(right.id));
  const sourceClosure: SourceClosure = {
    entry: entry.unit.id,
    units,
  };
  const componentsById = new Map(components.map((component) => [component.id, component]));
  return {
    closure: sourceClosure,
    program,
    graph,
    exports: entry.exports
      .map((item) => ({
        name: item.name,
        type: item.type,
        ref: graphRefForExport(item, componentsById),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function resolveCompiledSourceExport(
  compiled: CompiledSourceClosure,
  name: string,
  expected?: TypeRef,
): CompiledSourceExport {
  const item = compiled.exports.find((candidate) => candidate.name === name);
  if (item === undefined) {
    throw new SourceClosureError("UNKNOWN_SOURCE_EXPORT", `unknown source export ${name}`, name);
  }
  if (expected !== undefined) {
    assert(
      sameType(item.type, expected),
      "SOURCE_EXPORT_TYPE_MISMATCH",
      `${name} is ${typeName(item.type)}, expected ${typeName(expected)}`,
      name,
    );
  }
  return item;
}
