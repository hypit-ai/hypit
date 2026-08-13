import type {
  CapabilityRef,
  Digest,
  LinkedProgram,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  ResolvedModule,
  ResolvedModuleClosure,
  ResolvedCapabilityDeclaration,
  ResolvedProducerDeclaration,
  ResolvedTypeDeclaration,
  TypeRef,
  TypedRecord,
} from "@narratage/protocol";

import { digestOf, isDigest, recordDigest, semanticRecordsDigest } from "./canonical.js";
import { invariant } from "./error.js";
import { capabilityKey, moduleKey, producerKey, sameModule, sameType, typeKey } from "./reference.js";
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
    format: "svml.closure@1",
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
    format: "svml.closure@1",
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
  invariant(closure.format === "svml.closure@1", "UNSUPPORTED_CLOSURE", "unsupported closure format");
  invariant(isDigest(closure.digest), "INVALID_DIGEST", "closure digest is invalid");

  const modules = new Map<string, ResolvedModule>();
  for (const module of closure.modules) {
    const key = moduleKey(module.ref);
    invariant(module.ref.name.length > 0, "EMPTY_MODULE_NAME", "module name is empty");
    invariant(module.ref.version.length > 0, "EMPTY_MODULE_VERSION", `${module.ref.name} version is empty`);
    invariant(module.manifest.format === "svml.module@1", "UNSUPPORTED_MODULE", `${key} format is unsupported`);
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
    ensureUniqueNames(module.manifest.capabilities.map((item) => item.name), "capability", key);
    ensureUniqueNames(module.manifest.producers.map((item) => item.name), "producer", key);
    ensureUniqueNames(
      module.manifest.dependencies.map((item) => moduleKey(item.module)),
      "dependency",
      key,
    );
    for (const type of module.manifest.types) {
      if (type.validator === undefined) continue;
      invariant(
        isDigest(type.validator.implementation.digest),
        "INVALID_DIGEST",
        `${key}#${type.name} validator digest is invalid`,
      );
    }
    for (const producer of module.manifest.producers) {
      ensureUniqueNames(producer.inputs.map((item) => item.name), "input port", `${key}#${producer.name}`);
      ensureUniqueNames(producer.outputs.map((item) => item.name), "output port", `${key}#${producer.name}`);
      ensureUniqueNames(producer.needs.map((item) => item.name), "need port", `${key}#${producer.name}`);
      invariant(
        producer.outputs.length + producer.needs.length === 1,
        "PRODUCER_RESULT_NORMAL_FORM",
        `${key}#${producer.name} must declare exactly one public result`,
      );
      invariant(
        isDigest(producer.implementation.digest),
        "INVALID_DIGEST",
        `${key}#${producer.name} implementation digest is invalid`,
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
          allowed.has(moduleKey(port.returns.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${moduleKey(module.ref)}#${producer.name} references ${typeKey(port.returns)} without a dependency`,
        );
        const target = modules.get(moduleKey(port.returns.module));
        invariant(
          target?.manifest.types.some((type) => type.name === port.returns.name),
          "UNKNOWN_TYPE",
          `${moduleKey(module.ref)}#${producer.name} references unknown type ${typeKey(port.returns)}`,
        );
        invariant(
          allowed.has(moduleKey(port.capability.module)),
          "UNDECLARED_CAPABILITY_DEPENDENCY",
          `${moduleKey(module.ref)}#${producer.name} references ${capabilityKey(port.capability)} without a dependency`,
        );
        const capabilityModule = modules.get(moduleKey(port.capability.module));
        const capability = capabilityModule?.manifest.capabilities.find(
          (item) => item.name === port.capability.name,
        );
        invariant(
          capability !== undefined,
          "UNKNOWN_CAPABILITY",
          `${moduleKey(module.ref)}#${producer.name} references unknown capability ${capabilityKey(port.capability)}`,
        );
        invariant(
          typeKey(capability.returns) === typeKey(port.returns),
          "CAPABILITY_RETURN_MISMATCH",
          `${capabilityKey(port.capability)} returns ${typeKey(capability.returns)}, not ${typeKey(port.returns)}`,
        );
      }
    }
    for (const capability of module.manifest.capabilities) {
      const ref = { module: module.ref, name: capability.name };
      invariant(
        allowed.has(moduleKey(capability.returns.module)),
        "UNDECLARED_TYPE_DEPENDENCY",
        `${capabilityKey(ref)} returns ${typeKey(capability.returns)} without a dependency`,
      );
      const target = modules.get(moduleKey(capability.returns.module));
      invariant(
        target?.manifest.types.some((type) => type.name === capability.returns.name),
        "UNKNOWN_TYPE",
        `${capabilityKey(ref)} returns unknown type ${typeKey(capability.returns)}`,
      );
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

export function verifyRecordStructure(
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
}

export function verifyRecord(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
): void {
  verifyRecordStructure(closure, record);
}

export function link(
  closure: ResolvedModuleClosure,
  authoredRecords: readonly TypedRecord[],
): LinkedProgram {
  verifyClosure(closure);
  const recordIds = new Set<string>();
  const records: TypedRecord[] = [];

  for (const record of authoredRecords) {
    invariant(!recordIds.has(record.id), "DUPLICATE_RECORD", `duplicate record ${record.id}`, record.id);
    invariant(
      record.origin.kind === "authored",
      "NON_AUTHORED_PROGRAM_RECORD",
      "linked program inputs must be authored records",
      record.id,
    );
    verifyRecord(closure, record);
    recordIds.add(record.id);
    records.push(record);
  }

  const program: LinkedProgram = {
    closure,
    records,
    semanticDigest: semanticRecordsDigest(records),
  };
  verifyLinkedProgram(program);
  return program;
}

export function verifyLinkedProgram(program: LinkedProgram): void {
  verifyClosure(program.closure);
  const ids = new Set<string>();
  for (const record of program.records) {
    invariant(!ids.has(record.id), "DUPLICATE_RECORD", `duplicate record ${record.id}`, record.id);
    ids.add(record.id);
    invariant(record.origin.kind === "authored", "NON_AUTHORED_PROGRAM_RECORD",
      `${record.id} is not an authored input record`, record.id);
    verifyRecord(program.closure, record);
  }
  invariant(program.semanticDigest === semanticRecordsDigest(program.records),
    "PROGRAM_SEMANTIC_DIGEST_MISMATCH", "linked program semantic digest does not match");
}
