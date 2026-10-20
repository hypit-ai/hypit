import { link, verifyRecordStructure } from "@hypit/kernel";
import { isResourceId, sameType, typeKey } from "@hypit/protocol";
import type {
  GraphValueRef,
  ResolvedModuleClosure,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import type {
  ResolvedSource,
  SourceAssetResolver,
  SourceResolver,
} from "@hypit/source";
import { elaborateAuthorGraph } from "@hypit/author";
import type {
  AuthorComponent,
  AuthorElementProvenance,
  AuthorFrontend,
  AuthorFrontendRegistryLike,
  AuthorFrontendSourceUnit,
  AuthorRecordValidator,
  AuthorSourceDiscovery,
  AuthorSourceExport,
  AuthorSourceIdentity,
  AuthorSourceUnit,
  AuthorValueRef,
  CompiledSourceClosure,
  DecodedAuthorSource,
  ResolvedAuthorSourceAsset,
  ResolvedAuthorSourceImport,
  SourceClosure,
  SourceClosureUnit,
} from "@hypit/author";

type Awaitable<T> = T | Promise<T>;

export type CompileSourceClosureRequest = {
  readonly entry: ResolvedSource;
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
  readonly resolveSource: SourceResolver;
  readonly resolveAsset?: SourceAssetResolver;
  readonly validateRecord?: AuthorRecordValidator;
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
  return typeKey(type);
}

function sourceKey(source: AuthorSourceUnit, frontend: string): string {
  return `${source.id}\u0000${frontend}`;
}

type HygienicSource = {
  readonly unit: SourceClosureUnit;
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
  readonly exports: readonly AuthorSourceExport[];
  readonly identities: readonly AuthorSourceIdentity[];
  readonly provenance: readonly AuthorElementProvenance[];
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
      const declaration = component.fragment.exports.find((output) => output.name === ref.output);
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
    name: source.name,
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
    exports,
    identities: decoded.identities ?? [],
    provenance: (decoded.provenance ?? []).map((element) => ({
      id: hygienicId("element", source.id, `${element.range.start}:${element.range.end}`),
      source: source.id,
      sourceName: source.name,
      frontend: frontend.id,
      range: { ...element.range },
      records: element.records.map((id) => ({ local: id, id: recordIds.get(id) ?? id })),
      components: element.components.map((id) => ({ local: id, id: componentIds.get(id) ?? id })),
      outputs: element.outputs.map((output) => ({
        component: componentIds.get(output.component) ?? output.component,
        name: output.name,
        local: output.id,
        id: outputIds.get(output.id) ?? output.id,
      })),
      inputs: element.inputs.map((input) => ({
        id: hygienicId("endpoint", source.id, `${element.range.start}:${input.name}`),
        name: input.name,
        range: { ...input.range },
        kind: input.kind,
        ...(input.ref === undefined ? {} : { ref: mapRef(input.ref) }),
      })),
    })),
  };
}

function graphRefForExport(
  item: AuthorSourceExport,
  components: ReadonlyMap<string, AuthorComponent>,
): GraphValueRef {
  if (item.ref.kind === "record") return item.ref;
  const component = components.get(item.ref.component);
  assert(component !== undefined, "UNKNOWN_SOURCE_EXPORT", `export ${item.name} references ${item.ref.component}`);
  const output = Object.hasOwn(component.outputs, item.ref.output) ? component.outputs[item.ref.output] : undefined;
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

  const compile = async (resolvedSource: ResolvedSource): Promise<HygienicSource> => {
    const rawSource = resolvedSource.unit;
    assert(rawSource.id.length > 0, "EMPTY_SOURCE_ID", "SourceUnit id is empty");
    const source = rawSource;
    const frontendId = resolvedSource.frontend;
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
            existing.blob.mediaType === assetRequest.mediaType,
            "SOURCE_ASSET_MEDIA_TYPE_CONFLICT",
            `${source.name} assigns conflicting media types to ${assetRequest.from}`,
            assetRequest.from,
          );
          return { blob: existing.blob };
        }
        assert(
          request.resolveAsset !== undefined,
          "SOURCE_ASSET_RESOLVER_MISSING",
          `${source.name} requires source asset ${assetRequest.from}, but the Host has no asset resolver`,
          assetRequest.from,
        );
        const resolved = await request.resolveAsset(rawSource, assetRequest);
        const blob = resolved.blob;
        assert(blob.kind === "blob", "INVALID_SOURCE_ASSET", `${assetRequest.from} did not resolve to a BlobRef`);
        assert(isResourceId(blob.resource), "INVALID_SOURCE_ASSET_RESOURCE", `${assetRequest.from} has an invalid Resource identity`);
        assert(Number.isSafeInteger(blob.size) && blob.size >= 0, "INVALID_SOURCE_ASSET_SIZE", `${assetRequest.from} has an invalid size`);
        assert(
          blob.mediaType === assetRequest.mediaType,
          "SOURCE_ASSET_MEDIA_TYPE_MISMATCH",
          `${assetRequest.from} resolved as ${blob.mediaType}, expected ${assetRequest.mediaType}`,
          assetRequest.from,
        );
        assets.set(assetRequest.from, { blob });
        return { blob };
      },
    });
    const validatedRecords: TypedRecord[] = [];
    for (const record of rawDecoded.records) {
      verifyRecordStructure(request.closure, record);
      await request.validateRecord?.(record);
      validatedRecords.push(record);
    }
    const decoded: DecodedAuthorSource = {
      ...rawDecoded,
      records: validatedRecords,
    };
    const result = hygienizeSource(source, frontend, decoded, imports);
    visiting.pop();
    visitingAt.delete(key);
    cache.set(key, result);
    ordered.push(result);
    return result;
  };

  const entry = await compile(request.entry);
  const identities = new Map<string, { readonly source: string; readonly identity: AuthorSourceIdentity }>();
  for (const unit of ordered) {
    for (const identity of unit.identities) {
      assert(identity.id.length > 0, "EMPTY_SOURCE_IDENTITY", `${unit.unit.id} declares an empty public identity`);
      const key = `${typeName(identity.namespace)}\u0000${identity.id}`;
      const existing = identities.get(key);
      assert(
        existing === undefined,
        "DUPLICATE_SOURCE_IDENTITY",
        `${typeName(identity.namespace)} identity ${identity.id} is declared by both ${existing?.source ?? unit.unit.id} and ${unit.unit.id}`,
        identity.id,
      );
      identities.set(key, { source: unit.unit.id, identity });
    }
  }
  const records = ordered.flatMap((unit) => unit.records);
  const recordIds = new Set<string>();
  for (const record of records) {
    assert(!recordIds.has(record.id), "SOURCE_RECORD_COLLISION", `Source closure repeats Record ${record.id}`, record.id);
    recordIds.add(record.id);
  }
  const components = ordered.flatMap((unit) => unit.components);
  const program = link(request.closure, records);
  const graph = elaborateAuthorGraph(program, components);
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
    provenance: {
      format: "hypit.author-provenance@1",
      elements: ordered.flatMap((unit) => unit.provenance),
    },
    exports: entry.exports
      .map((item) => ({
        name: item.name,
        type: item.type,
        ref: graphRefForExport(item, componentsById),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}
