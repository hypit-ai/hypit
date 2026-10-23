import type {
  CapabilityRef,
  LinkedProgram,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  ResolvedModuleClosure,
  ResolvedCapabilityDeclaration,
  ResolvedProducerDeclaration,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import {
  capabilityIdentity,
  capabilityKey,
  isCapabilityRef,
  isModuleRef,
  isProducerRef,
  isTypeRef,
  moduleIdentity,
  moduleKey,
  producerIdentity,
  producerKey,
  typeIdentity,
  typeKey,
} from "@hypit/protocol";

import { invariant } from "./error.js";

type ClosureIndex = {
  readonly types: ReadonlyMap<string, TypeRef>;
  readonly producers: ReadonlyMap<string, ResolvedProducerDeclaration>;
  readonly capabilities: ReadonlyMap<string, ResolvedCapabilityDeclaration>;
};

const closureIndexes = new WeakMap<ResolvedModuleClosure, ClosureIndex>();

function manifestRef(manifest: ModuleManifest): ModuleRef {
  return { name: manifest.name, version: manifest.version };
}

function closureIndex(closure: ResolvedModuleClosure): ClosureIndex {
  const existing = closureIndexes.get(closure);
  if (existing !== undefined) return existing;
  const types = new Map<string, TypeRef>();
  const producers = new Map<string, ResolvedProducerDeclaration>();
  const capabilities = new Map<string, ResolvedCapabilityDeclaration>();
  for (const module of closure.modules) {
    const ref = manifestRef(module);
    for (const name of module.types) {
      const type = { module: ref, name };
      types.set(typeIdentity(type), type);
    }
    for (const declaration of module.producers) {
      const producer = { module: ref, name: declaration.name };
      producers.set(producerIdentity(producer), { ...declaration, ref: producer });
    }
    for (const declaration of module.capabilities) {
      const capability = { module: ref, name: declaration.name };
      capabilities.set(capabilityIdentity(capability), { ...declaration, ref: capability });
    }
  }
  const created = { types, producers, capabilities };
  closureIndexes.set(closure, created);
  return created;
}

export function createResolvedClosure(
  manifests: readonly ModuleManifest[],
): ResolvedModuleClosure {
  const modules = manifests.map((manifest) => structuredClone(manifest));
  return {
    format: "hypit.closure@1",
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
  invariant(closure.format === "hypit.closure@1", "UNSUPPORTED_CLOSURE", "unsupported closure format");

  const modules = new Map<string, ModuleManifest>();
  const declaredTypes = new Set<string>();
  const declaredCapabilities = new Map<string, ResolvedCapabilityDeclaration>();
  for (const module of closure.modules) {
    const ref = manifestRef(module);
    const display = moduleKey(ref);
    const identity = moduleIdentity(ref);
    invariant(isModuleRef(ref), "INVALID_MODULE_REF", `${display} is not a valid Module reference`, display);
    invariant(module.format === "hypit.module@1", "UNSUPPORTED_MODULE", `${display} format is unsupported`);
    invariant(!modules.has(identity), "DUPLICATE_MODULE", `duplicate module ${display}`, display);
    ensureUniqueNames(module.types, "type", display);
    ensureUniqueNames(module.capabilities.map((item) => item.name), "capability", display);
    ensureUniqueNames(module.producers.map((item) => item.name), "producer", display);
    ensureUniqueNames(
      module.dependencies.map(moduleKey),
      "dependency",
      display,
    );
    for (const producer of module.producers) {
      const producerRef: ProducerRef = { module: ref, name: producer.name };
      invariant(isProducerRef(producerRef), "INVALID_PRODUCER_REF", `${producerKey(producerRef)} is not a valid Producer reference`);
      const producerDisplay = producerKey(producerRef);
      ensureUniqueNames(producer.inputs.map((item) => item.name), "input port", producerDisplay);
      invariant(producer.result.name.length > 0, "EMPTY_NAME", `result name in ${producerDisplay} is empty`);
    }
    for (const name of module.types) {
      const type = { module: ref, name };
      invariant(isTypeRef(type), "INVALID_TYPE_REF", `${typeKey(type)} is not a valid Type reference`);
      declaredTypes.add(typeIdentity(type));
    }
    for (const capability of module.capabilities) {
      const capabilityRef = { module: ref, name: capability.name };
      invariant(isCapabilityRef(capabilityRef), "INVALID_CAPABILITY_REF", `${capabilityKey(capabilityRef)} is not a valid Capability reference`);
      declaredCapabilities.set(capabilityIdentity(capabilityRef), { ...capability, ref: capabilityRef });
    }
    modules.set(identity, module);
  }

  for (const module of closure.modules) {
    for (const dependency of module.dependencies) {
      const resolved = modules.get(moduleIdentity(dependency));
      invariant(
        resolved !== undefined,
        "MISSING_DEPENDENCY",
        `${moduleKey(module)} requires ${moduleKey(dependency)}`,
      );
    }
  }

  for (const module of closure.modules) {
    const allowed = new Set([
      moduleIdentity(module),
      ...module.dependencies.map(moduleIdentity),
    ]);
    for (const producer of module.producers) {
      const producerRef: ProducerRef = {
        module: manifestRef(module),
        name: producer.name,
      };
      const identity = producerKey(producerRef);
      const typedPorts = producer.result.kind === "output"
        ? [...producer.inputs, producer.result]
        : producer.inputs;
      for (const port of typedPorts) {
        invariant(
          allowed.has(moduleIdentity(port.type.module)),
          "UNDECLARED_TYPE_DEPENDENCY",
          `${identity} references ${typeKey(port.type)} without a dependency`,
        );
        invariant(
          declaredTypes.has(typeIdentity(port.type)),
          "UNKNOWN_TYPE",
          `${identity} references unknown type ${typeKey(port.type)}`,
        );
      }
      if (producer.result.kind === "need") {
        const port = producer.result;
        invariant(
          allowed.has(moduleIdentity(port.capability.module)),
          "UNDECLARED_CAPABILITY_DEPENDENCY",
          `${identity} references ${capabilityKey(port.capability)} without a dependency`,
        );
        const capability = declaredCapabilities.get(capabilityIdentity(port.capability));
        invariant(
          capability !== undefined,
          "UNKNOWN_CAPABILITY",
          `${identity} references unknown capability ${capabilityKey(port.capability)}`,
        );
      }
    }
    for (const capability of module.capabilities) {
      const ref = { module: manifestRef(module), name: capability.name };
      invariant(
        allowed.has(moduleIdentity(capability.returns.module)),
        "UNDECLARED_TYPE_DEPENDENCY",
        `${capabilityKey(ref)} returns ${typeKey(capability.returns)} without a dependency`,
      );
      invariant(
        declaredTypes.has(typeIdentity(capability.returns)),
        "UNKNOWN_TYPE",
        `${capabilityKey(ref)} returns unknown type ${typeKey(capability.returns)}`,
      );
    }
  }
}

export function resolveType(
  closure: ResolvedModuleClosure,
  ref: TypeRef,
): TypeRef {
  const declaration = closureIndex(closure).types.get(typeIdentity(ref));
  invariant(declaration !== undefined, "UNKNOWN_TYPE", `unknown type ${typeKey(ref)}`, typeKey(ref));
  return declaration;
}

export function resolveProducer(
  closure: ResolvedModuleClosure,
  ref: ProducerRef,
): ResolvedProducerDeclaration {
  const declaration = closureIndex(closure).producers.get(producerIdentity(ref));
  invariant(
    declaration !== undefined,
    "UNKNOWN_PRODUCER",
    `unknown producer ${producerKey(ref)}`,
    producerKey(ref),
  );
  return declaration;
}

export function resolveCapability(
  closure: ResolvedModuleClosure,
  ref: CapabilityRef,
): ResolvedCapabilityDeclaration {
  const declaration = closureIndex(closure).capabilities.get(capabilityIdentity(ref));
  invariant(
    declaration !== undefined,
    "UNKNOWN_CAPABILITY",
    `unknown capability ${capabilityKey(ref)}`,
    capabilityKey(ref),
  );
  return declaration;
}

export function verifyRecordStructure(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
): void {
  invariant(record.id.length > 0, "EMPTY_RECORD_ID", "record id is empty");
  resolveType(closure, record.type);
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
