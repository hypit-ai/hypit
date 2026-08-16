import { canonicalize } from "./canonical.js";
import type {
  CapabilityDeclaration,
  ModuleDependency,
  ModuleManifest,
  NeedPortDeclaration,
  PortDeclaration,
  ProducerDeclaration,
  TypeDeclaration,
} from "./module.js";
import type { CapabilityRef, ModuleRef, TypeRef } from "./identity.js";

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path} must be a string`);
  return value;
}

function moduleRef(value: unknown, path: string): ModuleRef {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    version: string(parsed.version, `${path}.version`),
  };
}

function typeRef(value: unknown, path: string): TypeRef {
  const parsed = object(value, path);
  return {
    module: moduleRef(parsed.module, `${path}.module`),
    name: string(parsed.name, `${path}.name`),
  };
}

function capabilityRef(value: unknown, path: string): CapabilityRef {
  const parsed = object(value, path);
  return {
    module: moduleRef(parsed.module, `${path}.module`),
    name: string(parsed.name, `${path}.name`),
  };
}

function dependency(value: unknown, path: string): ModuleDependency {
  const parsed = object(value, path);
  return {
    module: moduleRef(parsed.module, `${path}.module`),
  };
}

function typeDeclaration(value: unknown, path: string): TypeDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
  };
}

function capabilityDeclaration(value: unknown, path: string): CapabilityDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    returns: typeRef(parsed.returns, `${path}.returns`),
  };
}

function port(value: unknown, path: string): PortDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    type: typeRef(parsed.type, `${path}.type`),
  };
}

function needPort(value: unknown, path: string): NeedPortDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    capability: capabilityRef(parsed.capability, `${path}.capability`),
    returns: typeRef(parsed.returns, `${path}.returns`),
  };
}

function producer(value: unknown, path: string): ProducerDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    inputs: array(parsed.inputs, `${path}.inputs`).map((item, index) =>
      port(item, `${path}.inputs[${index}]`),
    ),
    outputs: array(parsed.outputs, `${path}.outputs`).map((item, index) =>
      port(item, `${path}.outputs[${index}]`),
    ),
    needs: array(parsed.needs, `${path}.needs`).map((item, index) =>
      needPort(item, `${path}.needs[${index}]`),
    ),
  };
}

export function parseModuleManifest(value: unknown): ModuleManifest {
  const parsed = object(canonicalize(value), "$manifest");
  if (parsed.format !== "narratage.module@1") throw new Error("$manifest.format must be narratage.module@1");
  return {
    format: "narratage.module@1",
    name: string(parsed.name, "$manifest.name"),
    version: string(parsed.version, "$manifest.version"),
    dependencies: array(parsed.dependencies, "$manifest.dependencies").map((item, index) =>
      dependency(item, `$manifest.dependencies[${index}]`),
    ),
    types: array(parsed.types, "$manifest.types").map((item, index) =>
      typeDeclaration(item, `$manifest.types[${index}]`),
    ),
    capabilities: array(parsed.capabilities, "$manifest.capabilities").map((item, index) =>
      capabilityDeclaration(item, `$manifest.capabilities[${index}]`),
    ),
    producers: array(parsed.producers, "$manifest.producers").map((item, index) =>
      producer(item, `$manifest.producers[${index}]`),
    ),
  };
}

export function parseModuleManifestText(text: string): ModuleManifest {
  return parseModuleManifest(JSON.parse(text) as unknown);
}
