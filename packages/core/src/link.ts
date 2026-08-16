import type {
  CapabilityRef,
  LinkedProgram,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  ResolvedModule,
  ResolvedModuleManifest,
  ResolvedModuleClosure,
  ResolvedCapabilityDeclaration,
  ResolvedProducerDeclaration,
  ResolvedTypeDeclaration,
  TypeRef,
  TypedRecord,
} from "@narratage/protocol";

import { invariant } from "./error.js";
import { capabilityKey, moduleKey, producerKey, sameType, typeKey } from "./reference.js";

export type TypedRecordDraft = TypedRecord;

type ClosureIndex = {
  readonly types: ReadonlyMap<string, ResolvedTypeDeclaration>;
  readonly producers: ReadonlyMap<string, ResolvedProducerDeclaration>;
};

const closureIndexes = new WeakMap<ResolvedModuleClosure, ClosureIndex>();

function manifestRef(manifest: ModuleManifest): ModuleRef {
  return { name: manifest.name, version: manifest.version };
}

function closureIndex(closure: ResolvedModuleClosure): ClosureIndex {
  const existing = closureIndexes.get(closure);
  if (existing !== undefined) return existing;
  const types = new Map<string, ResolvedTypeDeclaration>();
  const producers = new Map<string, ResolvedProducerDeclaration>();
  for (const module of closure.modules) {
    const ref = manifestRef(module.manifest);
    for (const declaration of module.manifest.types) {
      const type = { module: ref, name: declaration.name };
      types.set(typeKey(type), { ...declaration, ref: type });
    }
    for (const declaration of module.manifest.producers) {
      const producer = { module: ref, name: declaration.name };
      producers.set(producerKey(producer), { ...declaration, ref: producer });
    }
  }
  const created = { types, producers };
  closureIndexes.set(closure, created);
  return created;
}

function resolvedManifest(manifest: ModuleManifest): ResolvedModuleManifest {
  return {
    format: manifest.format,
    name: manifest.name,
    version: manifest.version,
    dependencies: manifest.dependencies.map((dependency) => ({ module: { ...dependency.module } })),
    types: manifest.types.map((type) => ({ name: type.name })),
    capabilities: manifest.capabilities.map((capability) => ({
      name: capability.name,
      returns: structuredClone(capability.returns),
    })),
    producers: manifest.producers.map((producer) => ({
      name: producer.name,
      inputs: structuredClone(producer.inputs),
      outputs: structuredClone(producer.outputs),
      needs: structuredClone(producer.needs),
    })),
  };
}

export function createResolvedClosure(
  manifests: readonly ModuleManifest[],
): ResolvedModuleClosure {
  const modules = manifests.map((definition) => {
    const manifest = resolvedManifest(definition);
    return { manifest };
  });
  return {
    format: "narratage.closure@1",
    modules,
  };
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
  invariant(closure.format === "narratage.closure@1", "UNSUPPORTED_CLOSURE", "unsupported closure format");

  const modules = new Map<string, ResolvedModule>();
  const declaredTypes = new Set<string>();
  const declaredCapabilities = new Map<string, ResolvedCapabilityDeclaration>();
  for (const module of closure.modules) {
    const ref = manifestRef(module.manifest);
    const key = moduleKey(ref);
    invariant(ref.name.length > 0, "EMPTY_MODULE_NAME", "module name is empty");
    invariant(ref.version.length > 0, "EMPTY_MODULE_VERSION", `${ref.name} version is empty`);
    invariant(module.manifest.format === "narratage.module@1", "UNSUPPORTED_MODULE", `${key} format is unsupported`);
    invariant(!modules.has(key), "DUPLICATE_MODULE", `duplicate module ${key}`, key);
    ensureUniqueNames(module.manifest.types.map((item) => item.name), "type", key);
    ensureUniqueNames(module.manifest.capabilities.map((item) => item.name), "capability", key);
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
        producer.outputs.length + producer.needs.length === 1,
        "PRODUCER_RESULT_NORMAL_FORM",
        `${key}#${producer.name} must declare exactly one public result`,
      );
    }
    for (const type of module.manifest.types) {
      declaredTypes.add(typeKey({ module: ref, name: type.name }));
    }
    for (const capability of module.manifest.capabilities) {
      const capabilityRef = { module: ref, name: capability.name };
      declaredCapabilities.set(capabilityKey(capabilityRef), { ...capability, ref: capabilityRef });
    }
    modules.set(key, module);
  }

  for (const module of closure.modules) {
    for (const dependency of module.manifest.dependencies) {
      const resolved = modules.get(moduleKey(dependency.module));
      invariant(
        resolved !== undefined,
        "MISSING_DEPENDENCY",
        `${moduleKey(module.manifest)} requires ${moduleKey(dependency.module)}`,
      );
    }
  }

  for (const module of closure.modules) {
    const allowed = new Set([
      moduleKey(module.manifest),
      ...module.manifest.dependencies.map((dependency) => moduleKey(dependency.module)),
    ]);
    for (const producer of module.manifest.producers) {
      for (const port of [...producer.inputs, ...producer.outputs]) {
        invariant(
          allowed.has(moduleKey(port.type.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${moduleKey(module.manifest)}#${producer.name} references ${typeKey(port.type)} without a dependency`,
        );
        invariant(
          declaredTypes.has(typeKey(port.type)),
          "UNKNOWN_TYPE",
          `${moduleKey(module.manifest)}#${producer.name} references unknown type ${typeKey(port.type)}`,
        );
      }
      for (const port of producer.needs) {
        invariant(
          allowed.has(moduleKey(port.returns.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${moduleKey(module.manifest)}#${producer.name} references ${typeKey(port.returns)} without a dependency`,
        );
        invariant(
          declaredTypes.has(typeKey(port.returns)),
          "UNKNOWN_TYPE",
          `${moduleKey(module.manifest)}#${producer.name} references unknown type ${typeKey(port.returns)}`,
        );
        invariant(
          allowed.has(moduleKey(port.capability.module)),
          "UNDECLARED_CAPABILITY_DEPENDENCY",
          `${moduleKey(module.manifest)}#${producer.name} references ${capabilityKey(port.capability)} without a dependency`,
        );
        const capability = declaredCapabilities.get(capabilityKey(port.capability));
        invariant(
          capability !== undefined,
          "UNKNOWN_CAPABILITY",
          `${moduleKey(module.manifest)}#${producer.name} references unknown capability ${capabilityKey(port.capability)}`,
        );
        invariant(
          typeKey(capability.returns) === typeKey(port.returns),
          "CAPABILITY_RETURN_MISMATCH",
          `${capabilityKey(port.capability)} returns ${typeKey(capability.returns)}, not ${typeKey(port.returns)}`,
        );
      }
    }
    for (const capability of module.manifest.capabilities) {
      const ref = { module: manifestRef(module.manifest), name: capability.name };
      invariant(
        allowed.has(moduleKey(capability.returns.module)),
        "UNDECLARED_TYPE_DEPENDENCY",
        `${capabilityKey(ref)} returns ${typeKey(capability.returns)} without a dependency`,
      );
      invariant(
        declaredTypes.has(typeKey(capability.returns)),
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
  const declaration = closureIndex(closure).types.get(typeKey(ref));
  invariant(declaration !== undefined, "UNKNOWN_TYPE", `unknown type ${typeKey(ref)}`, typeKey(ref));
  return declaration;
}

export function resolveProducer(
  closure: ResolvedModuleClosure,
  ref: ProducerRef,
): ResolvedProducerDeclaration {
  const declaration = closureIndex(closure).producers.get(producerKey(ref));
  invariant(
    declaration !== undefined,
    "UNKNOWN_PRODUCER",
    `unknown producer ${producerKey(ref)}`,
    producerKey(ref),
  );
  return declaration;
}

export function sealRecord(record: TypedRecordDraft): TypedRecord {
  return { ...record };
}

export function verifyRecordStructure(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
): ResolvedTypeDeclaration {
  invariant(record.id.length > 0, "EMPTY_RECORD_ID", "record id is empty");
  const declaration = resolveType(closure, record.type);
  return declaration;
}

export function link(
  closure: ResolvedModuleClosure,
  authoredRecords: readonly TypedRecord[],
): LinkedProgram {
  const program: LinkedProgram = {
    closure,
    records: [...authoredRecords],
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
    verifyRecordStructure(program.closure, record);
  }
}
