import {
  canonicalize,
  canonicalStringify,
  digestOf,
  isDigest,
  link,
  sealTypedModule,
  verifyRecord,
} from "@svml/core";
import type {
  Digest,
  GraphValueRef,
  LinkedProgram,
  ResolvedModuleClosure,
  SourceRange,
  TypeRef,
  TypedModule,
  TypedRecord,
} from "@svml/protocol";

import {
  elaborateAuthorModule,
  sealAuthorModule,
} from "./author.js";
import type {
  AuthorComponent,
  AuthorElaboration,
  AuthorModule,
  AuthorValueRef,
} from "./author.js";
import type { GraphFragment } from "./fragment.js";

export type AuthorSourceUnit = {
  /** Host-canonical identity used only for recursion/cache diagnostics, never semantic identity. */
  readonly id: string;
  readonly name: string;
  readonly text: string;
};

export type AuthorSourceImport = {
  readonly from: string;
  readonly alias: string;
  readonly frontend: string;
  readonly range?: SourceRange;
};

export type AuthorSourceDiscovery = {
  readonly modules: readonly string[];
  readonly sources: readonly AuthorSourceImport[];
};

export type AuthorSourceExport = {
  /** Relative public name. The importing source contributes its own alias. */
  readonly name: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
};

export type ResolvedAuthorSourceImport = {
  readonly request: AuthorSourceImport;
  readonly source: Digest;
  readonly exports: readonly AuthorSourceExport[];
  /** Public record exports available to a package-owned Surface during author compilation. */
  readonly records: readonly TypedRecord[];
};

export type AuthorSourceDecodeContext = {
  readonly closure: ResolvedModuleClosure;
  readonly imports: readonly ResolvedAuthorSourceImport[];
};

export type DecodedAuthorSource = {
  readonly module: TypedModule;
  readonly author: AuthorModule;
  readonly fragments: readonly GraphFragment[];
  readonly exports: readonly AuthorSourceExport[];
};

export type Awaitable<T> = T | Promise<T>;

export type AuthorFrontend = {
  readonly id: string;
  readonly implementationDigest: Digest;
  discover(source: AuthorSourceUnit): Awaitable<AuthorSourceDiscovery>;
  decode(source: AuthorSourceUnit, context: AuthorSourceDecodeContext): Awaitable<DecodedAuthorSource>;
};

export interface AuthorFrontendRegistryLike {
  resolve(id: string): AuthorFrontend | undefined;
}

export class AuthorFrontendRegistry implements AuthorFrontendRegistryLike {
  readonly #frontends = new Map<string, AuthorFrontend>();

  register(frontend: AuthorFrontend): void {
    if (frontend.id.length === 0) throw new SourceClosureError("EMPTY_FRONTEND_ID", "Frontend id is empty");
    if (!isDigest(frontend.implementationDigest)) {
      throw new SourceClosureError("INVALID_FRONTEND_DIGEST", `${frontend.id} implementation digest is invalid`);
    }
    if (this.#frontends.has(frontend.id)) {
      throw new SourceClosureError("DUPLICATE_FRONTEND", `Frontend ${frontend.id} is already registered`, frontend.id);
    }
    this.#frontends.set(frontend.id, frontend);
  }

  resolve(id: string): AuthorFrontend | undefined {
    return this.#frontends.get(id);
  }
}

export type AuthorSourceResolver = (
  importer: AuthorSourceUnit,
  request: AuthorSourceImport,
) => Awaitable<AuthorSourceUnit>;

/** Host-owned admission hook; it may attach validation evidence but cannot rewrite author meaning. */
export type AuthorRecordAdmitter = (
  closure: ResolvedModuleClosure,
  record: TypedRecord,
) => Awaitable<TypedRecord>;

export type SourceClosureUnit = {
  readonly format: "svml.source-unit@1";
  readonly id: Digest;
  readonly frontend: string;
  readonly frontendDigest: Digest;
  readonly sourceDigest: Digest;
  readonly semanticDigest: Digest;
  readonly modules: readonly string[];
  readonly imports: readonly {
    readonly alias: string;
    readonly from: string;
    readonly source: Digest;
    readonly frontend: string;
  }[];
};

export type SourceClosure = {
  readonly format: "svml.source-closure@1";
  readonly id: Digest;
  readonly entry: Digest;
  readonly units: readonly SourceClosureUnit[];
};

export type CompiledSourceExport = {
  readonly name: string;
  readonly type: TypeRef;
  readonly ref: GraphValueRef;
};

export type CompiledSourceClosure = {
  readonly closure: SourceClosure;
  readonly module: TypedModule;
  readonly author: AuthorModule;
  readonly fragments: readonly GraphFragment[];
  readonly program: LinkedProgram;
  readonly elaboration: AuthorElaboration;
  readonly exports: readonly CompiledSourceExport[];
};

export type CompileSourceClosureRequest = {
  readonly entry: AuthorSourceUnit;
  readonly frontend: string;
  readonly closure: ResolvedModuleClosure;
  readonly frontends: AuthorFrontendRegistryLike;
  readonly resolveSource: AuthorSourceResolver;
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

function sourceUnitContent(unit: SourceClosureUnit): Omit<SourceClosureUnit, "id"> {
  return {
    format: "svml.source-unit@1",
    frontend: unit.frontend,
    frontendDigest: unit.frontendDigest,
    sourceDigest: unit.sourceDigest,
    semanticDigest: unit.semanticDigest,
    modules: [...unit.modules].sort(),
    imports: [...unit.imports]
      .map((item) => ({
        alias: item.alias,
        from: item.from,
        source: item.source,
        frontend: item.frontend,
      }))
      .sort((left, right) => left.alias.localeCompare(right.alias)),
  };
}

function sourceClosureContent(closure: SourceClosure): Omit<SourceClosure, "id"> {
  return {
    format: "svml.source-closure@1",
    entry: closure.entry,
    units: [...closure.units].sort((left, right) => left.id.localeCompare(right.id)),
  };
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

type HygienicSource = {
  readonly unit: SourceClosureUnit;
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
  readonly fragments: readonly GraphFragment[];
  readonly exports: readonly AuthorSourceExport[];
};

function hygienicId(kind: string, unit: Digest, local: string): string {
  return `${kind}:${digestOf({ unit, local }).slice("sha256:".length)}`;
}

function hygienizeSource(
  source: AuthorSourceUnit,
  frontend: AuthorFrontend,
  discovery: AuthorSourceDiscovery,
  decoded: DecodedAuthorSource,
  imports: readonly ResolvedAuthorSourceImport[],
): HygienicSource {
  assert(decoded.module.closureDigest.length > 0, "INVALID_SOURCE_MODULE", `${source.name} returned no closure identity`);
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
      const record = decoded.module.records.find((candidate) => candidate.id === ref.id);
      assert(record !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unknown Record ${ref.id}`);
      assert(
        sameType(record.type, item.type),
        "SOURCE_EXPORT_TYPE_MISMATCH",
        `${source.name}.${item.name} declares ${typeName(item.type)} but exports ${typeName(record.type)}`,
      );
    } else {
      const component = decoded.author.components.find((candidate) => candidate.id === ref.component);
      assert(component !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unknown component ${ref.component}`);
      const fragment = decoded.fragments.find((candidate) => candidate.id === component.fragment);
      assert(fragment !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unavailable Fragment ${component.fragment}`);
      const declaration = fragment.exports.find((candidate) => candidate.name === ref.output);
      assert(declaration !== undefined, "UNKNOWN_SOURCE_EXPORT", `${source.name}.${item.name} references unknown output ${ref.output}`);
      assert(
        sameType(declaration.type, item.type),
        "SOURCE_EXPORT_TYPE_MISMATCH",
        `${source.name}.${item.name} declares ${typeName(item.type)} but exports ${typeName(declaration.type)}`,
      );
    }
  }

  const semanticDigest = digestOf({
    frontend: frontend.id,
    implementationDigest: frontend.implementationDigest,
    records: [...decoded.module.records]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((record) => ({
        id: record.id,
        type: record.type,
        value: record.value,
        conformance: record.conformance,
      })),
    components: decoded.author.components,
    fragments: [...decoded.fragments].map((fragment) => fragment.id).sort(),
    exports: [...decoded.exports].sort((left, right) => left.name.localeCompare(right.name)),
  });
  const recordIds = new Map(decoded.module.records.map((record) => [
    record.id,
    hygienicId("source-record", semanticDigest, record.id),
  ]));
  const componentIds = new Map(decoded.author.components.map((component) => [
    component.id,
    hygienicId("source-component", semanticDigest, component.id),
  ]));
  const outputIds = new Map<string, string>();
  for (const component of decoded.author.components) {
    for (const output of Object.values(component.outputs)) {
      outputIds.set(output, hygienicId("source-output", semanticDigest, output));
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
  const records = decoded.module.records.map((record) => ({
    ...record,
    id: recordIds.get(record.id) as string,
  }));
  const components = decoded.author.components.map((component) => ({
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
    format: "svml.source-unit@1" as const,
    frontend: frontend.id,
    frontendDigest: frontend.implementationDigest,
    sourceDigest: digestOf(source.text),
    semanticDigest,
    modules: [...discovery.modules].sort(),
    imports: discovery.sources
      .map((request) => {
        const resolved = imports.find((item) => item.request === request);
        assert(resolved !== undefined, "UNRESOLVED_SOURCE_IMPORT", `${source.name} did not resolve ${request.from}`);
        return {
          alias: request.alias,
          from: request.from,
          source: resolved.source,
          frontend: request.frontend,
        };
      })
      .sort((left, right) => left.alias.localeCompare(right.alias)),
  };
  return {
    unit: {
      id: digestOf(unitContent),
      format: "svml.source-unit@1",
      frontend: frontend.id,
      frontendDigest: frontend.implementationDigest,
      sourceDigest: unitContent.sourceDigest,
      semanticDigest,
      modules: unitContent.modules,
      imports: unitContent.imports,
    },
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
  const ordered: HygienicSource[] = [];

  const compile = async (source: AuthorSourceUnit, frontendId: string): Promise<HygienicSource> => {
    assert(source.id.length > 0, "EMPTY_SOURCE_ID", "SourceUnit id is empty");
    const key = sourceKey(source, frontendId);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const cycle = visiting.indexOf(key);
    assert(
      cycle === -1,
      "SOURCE_IMPORT_CYCLE",
      `Source imports cycle through ${[...visiting.slice(cycle), key].join(" -> ")}`,
      source.id,
    );
    const frontend = request.frontends.resolve(frontendId);
    assert(frontend !== undefined, "UNKNOWN_FRONTEND", `Frontend ${frontendId} is not registered`, frontendId);
    assert(isDigest(frontend.implementationDigest), "INVALID_FRONTEND_DIGEST", `${frontendId} digest is invalid`);
    visiting.push(key);
    const discovery = await frontend.discover(source);
    const aliases = new Set<string>();
    const imports: ResolvedAuthorSourceImport[] = [];
    for (const dependency of discovery.sources) {
      assert(dependency.alias.length > 0, "EMPTY_SOURCE_ALIAS", `${source.name} has an empty source alias`);
      assert(!aliases.has(dependency.alias), "DUPLICATE_SOURCE_ALIAS", `${source.name} repeats alias ${dependency.alias}`);
      aliases.add(dependency.alias);
      const child = await request.resolveSource(source, dependency);
      const compiled = await compile(child, dependency.frontend);
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
    const rawDecoded = await frontend.decode(source, {
      closure: request.closure,
      imports: canonicalize(imports) as unknown as readonly ResolvedAuthorSourceImport[],
    });
    assert(
      rawDecoded.module.closureDigest === request.closure.digest,
      "SOURCE_MODULE_CLOSURE_MISMATCH",
      `${source.name} decoded against another module closure`,
    );
    const admittedRecords: TypedRecord[] = [];
    for (const record of rawDecoded.module.records) {
      const admitted = request.admitRecord === undefined
        ? record
        : await request.admitRecord(request.closure, record);
      assert(
        canonicalStringify({
          id: admitted.id,
          type: admitted.type,
          value: admitted.value,
          digest: admitted.digest,
          conformance: admitted.conformance,
          origin: admitted.origin,
        }) === canonicalStringify({
          id: record.id,
          type: record.type,
          value: record.value,
          digest: record.digest,
          conformance: record.conformance,
          origin: record.origin,
        }),
        "RECORD_ADMISSION_REWRITE",
        `Record admission rewrote ${source.name}:${record.id}`,
        record.id,
      );
      verifyRecord(request.closure, admitted);
      admittedRecords.push(admitted);
    }
    const decoded: DecodedAuthorSource = {
      ...rawDecoded,
      module: sealTypedModule({
        id: rawDecoded.module.id,
        closureDigest: rawDecoded.module.closureDigest,
        records: admittedRecords,
      }),
    };
    link(request.closure, [decoded.module]);
    const result = hygienizeSource(source, frontend, discovery, decoded, imports);
    visiting.pop();
    cache.set(key, result);
    ordered.push(result);
    return result;
  };

  const entry = await compile(request.entry, request.frontend);
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
  const author = sealAuthorModule({
    name: "source-closure",
    components: ordered.flatMap((unit) => unit.components),
  });
  const module = sealTypedModule({
    id: `source-closure:${digestOf(ordered.map((unit) => unit.unit.semanticDigest)).slice("sha256:".length)}`,
    closureDigest: request.closure.digest,
    records,
  });
  const program = link(request.closure, [module]);
  const catalog = [...fragments.values()].sort((left, right) => left.id.localeCompare(right.id));
  const elaboration = elaborateAuthorModule(program, author, (id) => fragments.get(id));
  const units = ordered.map((unit) => unit.unit).sort((left, right) => left.id.localeCompare(right.id));
  const closureContent = {
    format: "svml.source-closure@1" as const,
    entry: entry.unit.id,
    units,
  };
  const components = new Map(author.components.map((component) => [component.id, component]));
  const sourceClosure: SourceClosure = { ...closureContent, id: digestOf(closureContent) };
  verifySourceClosure(sourceClosure);
  return {
    closure: sourceClosure,
    module,
    author,
    fragments: catalog,
    program,
    elaboration,
    exports: entry.exports
      .map((item) => ({
        name: item.name,
        type: item.type,
        ref: graphRefForExport(item, components),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function verifySourceClosure(closure: SourceClosure): void {
  assert(closure.format === "svml.source-closure@1", "UNSUPPORTED_SOURCE_CLOSURE", "unsupported Source Closure format");
  assert(isDigest(closure.id), "INVALID_SOURCE_CLOSURE_DIGEST", "Source Closure digest is invalid");
  const units = new Map<string, SourceClosureUnit>();
  for (const unit of closure.units) {
    assert(unit.format === "svml.source-unit@1", "UNSUPPORTED_SOURCE_UNIT", "unsupported SourceUnit format");
    assert(isDigest(unit.id), "INVALID_SOURCE_UNIT_DIGEST", "SourceUnit digest is invalid");
    assert(unit.id === digestOf(sourceUnitContent(unit)), "SOURCE_UNIT_DIGEST_MISMATCH", `SourceUnit ${unit.id} digest differs`);
    assert(!units.has(unit.id), "DUPLICATE_SOURCE_UNIT", `Source Closure repeats ${unit.id}`, unit.id);
    assert(isDigest(unit.frontendDigest), "INVALID_FRONTEND_DIGEST", `${unit.id} Frontend digest is invalid`);
    assert(isDigest(unit.sourceDigest), "INVALID_SOURCE_DIGEST", `${unit.id} source digest is invalid`);
    assert(isDigest(unit.semanticDigest), "INVALID_SOURCE_SEMANTIC_DIGEST", `${unit.id} semantic digest is invalid`);
    units.set(unit.id, unit);
  }
  assert(units.has(closure.entry), "UNKNOWN_SOURCE_ENTRY", `Source Closure entry ${closure.entry} is absent`);
  for (const unit of closure.units) {
    for (const item of unit.imports) {
      assert(units.has(item.source), "UNKNOWN_SOURCE_IMPORT", `${unit.id} imports absent SourceUnit ${item.source}`);
    }
  }
  assert(
    closure.id === digestOf(sourceClosureContent(closure)),
    "SOURCE_CLOSURE_DIGEST_MISMATCH",
    "Source Closure digest differs",
  );
}

export function resolveCompiledSourceExport(
  compiled: CompiledSourceClosure,
  name: string,
  expected?: TypeRef,
): CompiledSourceExport {
  const item = compiled.exports.find((candidate) => candidate.name === name);
  assert(item !== undefined, "UNKNOWN_SOURCE_EXPORT", `unknown source export ${name}`, name);
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
