import type {
  Digest,
  LinkedProgram,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  ResolvedModule,
  ResolvedModuleClosure,
  ResolvedProducerDeclaration,
  ResolvedTypeDeclaration,
  TypeRef,
  TypedModule,
  TypedRecord,
} from "@svml/protocol";

import { digestOf, isDigest, recordDigest, semanticRecordsDigest } from "./canonical.js";
import { CoreError, invariant } from "./error.js";
import { moduleKey, producerKey, sameModule, typeKey } from "./reference.js";
import { validateStoredValue } from "./schema.js";

export type TypedRecordDraft = Omit<TypedRecord, "digest">;

function manifestRef(manifest: ModuleManifest): ModuleRef {
  return { name: manifest.name, version: manifest.version };
}

export function computeModuleDigest(manifest: ModuleManifest): Digest {
  return digestOf(manifest);
}

export function computeClosureDigest(modules: readonly ResolvedModule[]): Digest {
  return digestOf({
    format: "svml.closure@0",
    modules: [...modules]
      .sort((left, right) => moduleKey(left.ref).localeCompare(moduleKey(right.ref)))
      .map((module) => ({ ref: module.ref, digest: module.digest })),
  });
}

export function createResolvedClosure(
  manifests: readonly ModuleManifest[],
): ResolvedModuleClosure {
  const modules = manifests.map((manifest) => ({
    ref: manifestRef(manifest),
    digest: computeModuleDigest(manifest),
    manifest,
  }));
  const closure: ResolvedModuleClosure = {
    format: "svml.closure@0",
    modules,
    digest: computeClosureDigest(modules),
  };
  verifyClosure(closure);
  return closure;
}

function ensureUniqueNames(names: readonly string[], kind: string, owner: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    invariant(name.length > 0, "EMPTY_NAME", `${kind} name in ${owner} is empty`, owner);
    invariant(!seen.has(name), "DUPLICATE_EXPORT", `${owner} declares duplicate ${kind} ${name}`, name);
    seen.add(name);
  }
}

export function verifyClosure(closure: ResolvedModuleClosure): void {
  invariant(closure.format === "svml.closure@0", "UNSUPPORTED_CLOSURE", "unsupported closure format");
  invariant(isDigest(closure.digest), "INVALID_DIGEST", "closure digest is invalid");

  const modules = new Map<string, ResolvedModule>();
  for (const module of closure.modules) {
    const key = moduleKey(module.ref);
    invariant(module.ref.name.length > 0, "EMPTY_MODULE_NAME", "module name is empty");
    invariant(module.ref.version.length > 0, "EMPTY_MODULE_VERSION", `${module.ref.name} version is empty`);
    invariant(module.manifest.format === "svml.module@0", "UNSUPPORTED_MODULE", `${key} format is unsupported`);
    invariant(!modules.has(key), "DUPLICATE_MODULE", `duplicate module ${key}`, key);
    invariant(
      sameModule(module.ref, manifestRef(module.manifest)),
      "MODULE_ID_MISMATCH",
      `${key} does not match its manifest identity`,
      key,
    );
    invariant(isDigest(module.digest), "INVALID_DIGEST", `${key} digest is invalid`, key);
    invariant(
      module.digest === computeModuleDigest(module.manifest),
      "MODULE_DIGEST_MISMATCH",
      `${key} manifest digest does not match`,
      key,
    );
    ensureUniqueNames(module.manifest.types.map((item) => item.name), "type", key);
    ensureUniqueNames(module.manifest.surfaces.map((item) => item.name), "surface", key);
    ensureUniqueNames(module.manifest.surfaces.map((item) => item.tag), "surface tag", key);
    ensureUniqueNames(module.manifest.producers.map((item) => item.name), "producer", key);
    ensureUniqueNames(
      module.manifest.dependencies.map((item) => moduleKey(item.module)),
      "dependency",
      key,
    );
    for (const producer of module.manifest.producers) {
      ensureUniqueNames(producer.inputs.map((item) => item.name), "input port", `${key}#${producer.name}`);
      ensureUniqueNames(producer.outputs.map((item) => item.name), "output port", `${key}#${producer.name}`);
      ensureUniqueNames(producer.needs.map((item) => item.name), "need port", `${key}#${producer.name}`);
      invariant(
        isDigest(producer.implementation.digest),
        "INVALID_DIGEST",
        `${key}#${producer.name} implementation digest is invalid`,
      );
    }
    for (const surface of module.manifest.surfaces) {
      invariant(surface.tag.length > 0, "EMPTY_NAME", `${key} surface tag is empty`);
      ensureUniqueNames(
        surface.outputs.map((output) => typeKey(output)),
        "Surface output type",
        `${key}#${surface.name}`,
      );
      invariant(
        surface.mode === "raw" || surface.mode === "structured",
        "UNSUPPORTED_SURFACE_MODE",
        `${key}#${surface.name} has unsupported Surface mode ${surface.mode}`,
      );
      invariant(
        isDigest(surface.implementation.digest),
        "INVALID_DIGEST",
        `${key}#${surface.name} Surface implementation digest is invalid`,
      );
    }
    modules.set(key, module);
  }

  for (const module of closure.modules) {
    for (const dependency of module.manifest.dependencies) {
      const resolved = modules.get(moduleKey(dependency.module));
      invariant(
        resolved !== undefined,
        "MISSING_DEPENDENCY",
        `${moduleKey(module.ref)} requires ${moduleKey(dependency.module)}`,
      );
      invariant(
        resolved.digest === dependency.digest,
        "DEPENDENCY_DIGEST_MISMATCH",
        `${moduleKey(dependency.module)} does not match the required digest`,
      );
    }
  }

  invariant(
    closure.digest === computeClosureDigest(closure.modules),
    "CLOSURE_DIGEST_MISMATCH",
    "resolved module closure digest does not match",
  );

  for (const module of closure.modules) {
    const allowed = new Set([
      moduleKey(module.ref),
      ...module.manifest.dependencies.map((dependency) => moduleKey(dependency.module)),
    ]);
    for (const surface of module.manifest.surfaces) {
      for (const output of surface.outputs) {
        invariant(
          allowed.has(moduleKey(output.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${moduleKey(module.ref)}#${surface.name} Surface outputs ${typeKey(output)} without a dependency`,
        );
        const target = modules.get(moduleKey(output.module));
        invariant(
          target?.manifest.types.some((type) => type.name === output.name),
          "UNKNOWN_TYPE",
          `${moduleKey(module.ref)}#${surface.name} Surface outputs unknown type ${typeKey(output)}`,
        );
      }
    }
    for (const producer of module.manifest.producers) {
      for (const port of [...producer.inputs, ...producer.outputs]) {
        invariant(
          allowed.has(moduleKey(port.type.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${moduleKey(module.ref)}#${producer.name} references ${typeKey(port.type)} without a dependency`,
        );
        const target = modules.get(moduleKey(port.type.module));
        invariant(
          target?.manifest.types.some((type) => type.name === port.type.name),
          "UNKNOWN_TYPE",
          `${moduleKey(module.ref)}#${producer.name} references unknown type ${typeKey(port.type)}`,
        );
      }
      for (const port of producer.needs) {
        invariant(
          allowed.has(moduleKey(port.wants.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${moduleKey(module.ref)}#${producer.name} references ${typeKey(port.wants)} without a dependency`,
        );
        const target = modules.get(moduleKey(port.wants.module));
        invariant(
          target?.manifest.types.some((type) => type.name === port.wants.name),
          "UNKNOWN_TYPE",
          `${moduleKey(module.ref)}#${producer.name} references unknown type ${typeKey(port.wants)}`,
        );
      }
    }
  }
}

export function resolveType(
  closure: ResolvedModuleClosure,
  ref: TypeRef,
): ResolvedTypeDeclaration {
  const module = closure.modules.find((item) => sameModule(item.ref, ref.module));
  invariant(module !== undefined, "UNKNOWN_MODULE", `unknown module ${moduleKey(ref.module)}`, typeKey(ref));
  const declaration = module.manifest.types.find((item) => item.name === ref.name);
  invariant(declaration !== undefined, "UNKNOWN_TYPE", `unknown type ${typeKey(ref)}`, typeKey(ref));
  return { ...declaration, ref };
}

export function resolveProducer(
  closure: ResolvedModuleClosure,
  ref: ProducerRef,
): ResolvedProducerDeclaration {
  const module = closure.modules.find((item) => sameModule(item.ref, ref.module));
  invariant(
    module !== undefined,
    "UNKNOWN_MODULE",
    `unknown module ${moduleKey(ref.module)}`,
    producerKey(ref),
  );
  const declaration = module.manifest.producers.find((item) => item.name === ref.name);
  invariant(
    declaration !== undefined,
    "UNKNOWN_PRODUCER",
    `unknown producer ${producerKey(ref)}`,
    producerKey(ref),
  );
  return { ...declaration, ref };
}

export function sealRecord(record: TypedRecordDraft): TypedRecord {
  return { ...record, digest: recordDigest(record.type, record.value) };
}

export function verifyRecord(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
): void {
  invariant(record.id.length > 0, "EMPTY_RECORD_ID", "record id is empty");
  invariant(isDigest(record.digest), "INVALID_DIGEST", `${record.id} digest is invalid`, record.id);
  invariant(
    record.digest === recordDigest(record.type, record.value),
    "RECORD_DIGEST_MISMATCH",
    `${record.id} digest does not match its value`,
    record.id,
  );
  const declaration = resolveType(closure, record.type);
  validateStoredValue(record.value, declaration.schema, `$record.${record.id}`);
  if (record.origin.kind === "authored") {
    invariant(isDigest(record.origin.sourceDigest), "INVALID_DIGEST", `${record.id} source digest is invalid`);
    invariant(
      isDigest(record.origin.frontendClosureDigest),
      "INVALID_DIGEST",
      `${record.id} frontend closure digest is invalid`,
    );
    invariant(record.conformance === "exact", "AUTHORED_SUBSTITUTE", `${record.id} authored record is substitute`);
  }
}

export function sealTypedModule(input: {
  readonly id: string;
  readonly closureDigest: Digest;
  readonly records: readonly TypedRecord[];
}): TypedModule {
  return {
    format: "svml.typed-module@0",
    id: input.id,
    closureDigest: input.closureDigest,
    records: input.records,
    semanticDigest: semanticRecordsDigest(input.records),
  };
}

export function link(
  closure: ResolvedModuleClosure,
  typedModules: readonly TypedModule[],
): LinkedProgram {
  verifyClosure(closure);
  const moduleIds = new Set<string>();
  const recordIds = new Set<string>();
  const records: TypedRecord[] = [];

  for (const typedModule of typedModules) {
    invariant(
      typedModule.format === "svml.typed-module@0",
      "UNSUPPORTED_TYPED_MODULE",
      `${typedModule.id} has an unsupported format`,
    );
    invariant(!moduleIds.has(typedModule.id), "DUPLICATE_TYPED_MODULE", typedModule.id, typedModule.id);
    moduleIds.add(typedModule.id);
    invariant(
      typedModule.closureDigest === closure.digest,
      "TYPED_MODULE_CLOSURE_MISMATCH",
      `${typedModule.id} was decoded against another module closure`,
    );
    invariant(
      typedModule.semanticDigest === semanticRecordsDigest(typedModule.records),
      "SEMANTIC_DIGEST_MISMATCH",
      `${typedModule.id} semantic digest does not match`,
    );
    for (const record of typedModule.records) {
      invariant(!recordIds.has(record.id), "DUPLICATE_RECORD", `duplicate record ${record.id}`, record.id);
      invariant(
        record.origin.kind === "authored",
        "NON_AUTHORED_MODULE_RECORD",
        `${typedModule.id} contains a non-authored input record`,
        record.id,
      );
      verifyRecord(closure, record);
      recordIds.add(record.id);
      records.push(record);
    }
  }

  return {
    closure,
    modules: typedModules,
    records,
    semanticDigest: digestOf(
      [...typedModules]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((module) => ({ id: module.id, semanticDigest: module.semanticDigest })),
    ),
  };
}

export function assertKnownType(closure: ResolvedModuleClosure, ref: TypeRef): void {
  try {
    resolveType(closure, ref);
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw error;
  }
}
