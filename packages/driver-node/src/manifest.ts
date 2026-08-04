import { readFile } from "node:fs/promises";

import { canonicalize, createResolvedClosure, isDigest } from "@svml/core";
import type {
  CapabilityDeclaration,
  CapabilityRef,
  Digest,
  ImplementationRef,
  ModuleDependency,
  ModuleManifest,
  ModuleRef,
  NeedPortDeclaration,
  ObjectFieldSchema,
  PortDeclaration,
  ProducerDeclaration,
  ResolvedModuleClosure,
  SurfaceDeclaration,
  TypeDeclaration,
  TypeRef,
  ValueSchema,
} from "@svml/protocol";

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

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a number`);
  return value;
}

function digest(value: unknown, path: string): Digest {
  const parsed = string(value, path);
  if (!isDigest(parsed)) throw new Error(`${path} must be a sha256 digest`);
  return parsed;
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

function optionalNumber(
  parsed: Record<string, unknown>,
  name: string,
  path: string,
): { readonly [key: string]: number } {
  return parsed[name] === undefined ? {} : { [name]: number(parsed[name], `${path}.${name}`) };
}

function valueSchema(value: unknown, path: string): ValueSchema {
  const parsed = object(value, path);
  const kind = string(parsed.kind, `${path}.kind`);
  switch (kind) {
    case "null":
    case "boolean":
      return { kind };
    case "number":
      return {
        kind,
        ...(parsed.integer === undefined ? {} : { integer: boolean(parsed.integer, `${path}.integer`) }),
        ...optionalNumber(parsed, "minimum", path),
        ...optionalNumber(parsed, "maximum", path),
      } as ValueSchema;
    case "string":
      return {
        kind,
        ...(parsed.enum === undefined
          ? {}
          : { enum: array(parsed.enum, `${path}.enum`).map((item, index) => string(item, `${path}.enum[${index}]`)) }),
        ...optionalNumber(parsed, "minLength", path),
        ...optionalNumber(parsed, "maxLength", path),
      } as ValueSchema;
    case "literal":
      return { kind, value: canonicalize(parsed.value) };
    case "array":
      return {
        kind,
        items: valueSchema(parsed.items, `${path}.items`),
        ...optionalNumber(parsed, "minItems", path),
        ...optionalNumber(parsed, "maxItems", path),
      } as ValueSchema;
    case "object": {
      const rawFields = object(parsed.fields, `${path}.fields`);
      const fields: Record<string, ObjectFieldSchema> = {};
      for (const [name, rawField] of Object.entries(rawFields)) {
        const field = object(rawField, `${path}.fields.${name}`);
        Object.defineProperty(fields, name, {
          value: {
            schema: valueSchema(field.schema, `${path}.fields.${name}.schema`),
            ...(field.optional === undefined
              ? {}
              : { optional: boolean(field.optional, `${path}.fields.${name}.optional`) }),
          },
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return {
        kind,
        fields,
        ...(parsed.allowUnknown === undefined
          ? {}
          : { allowUnknown: boolean(parsed.allowUnknown, `${path}.allowUnknown`) }),
      };
    }
    case "oneOf":
      return {
        kind,
        variants: array(parsed.variants, `${path}.variants`).map((item, index) =>
          valueSchema(item, `${path}.variants[${index}]`),
        ),
      };
    case "blob":
      return {
        kind,
        ...(parsed.mediaTypes === undefined
          ? {}
          : {
              mediaTypes: array(parsed.mediaTypes, `${path}.mediaTypes`).map((item, index) =>
                string(item, `${path}.mediaTypes[${index}]`),
              ),
            }),
        ...optionalNumber(parsed, "maxBytes", path),
      } as ValueSchema;
    default:
      throw new Error(`${path}.kind ${kind} is unsupported`);
  }
}

function dependency(value: unknown, path: string): ModuleDependency {
  const parsed = object(value, path);
  return {
    module: moduleRef(parsed.module, `${path}.module`),
    digest: digest(parsed.digest, `${path}.digest`),
  };
}

function typeDeclaration(value: unknown, path: string): TypeDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    schema: valueSchema(parsed.schema, `${path}.schema`),
    ...(parsed.description === undefined
      ? {}
      : { description: string(parsed.description, `${path}.description`) }),
  };
}

function capabilityDeclaration(value: unknown, path: string): CapabilityDeclaration {
  const parsed = object(value, path);
  return {
    name: string(parsed.name, `${path}.name`),
    returns: typeRef(parsed.returns, `${path}.returns`),
    ...(parsed.description === undefined
      ? {}
      : { description: string(parsed.description, `${path}.description`) }),
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

function implementation(value: unknown, path: string): ImplementationRef {
  const parsed = object(value, path);
  return {
    kind: string(parsed.kind, `${path}.kind`),
    locator: string(parsed.locator, `${path}.locator`),
    digest: digest(parsed.digest, `${path}.digest`),
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
    implementation: implementation(parsed.implementation, `${path}.implementation`),
  };
}

function surface(value: unknown, path: string): SurfaceDeclaration {
  const parsed = object(value, path);
  const mode = string(parsed.mode, `${path}.mode`);
  if (mode !== "raw" && mode !== "structured") {
    throw new Error(`${path}.mode must be raw or structured`);
  }
  return {
    name: string(parsed.name, `${path}.name`),
    tag: string(parsed.tag, `${path}.tag`),
    mode,
    outputs: array(parsed.outputs, `${path}.outputs`).map((item, index) =>
      typeRef(item, `${path}.outputs[${index}]`),
    ),
    implementation: implementation(parsed.implementation, `${path}.implementation`),
  };
}

export function parseModuleManifest(value: unknown): ModuleManifest {
  const parsed = object(canonicalize(value), "$manifest");
  if (parsed.format !== "svml.module@0") throw new Error("$manifest.format must be svml.module@0");
  return {
    format: "svml.module@0",
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
    surfaces: array(parsed.surfaces, "$manifest.surfaces").map((item, index) =>
      surface(item, `$manifest.surfaces[${index}]`),
    ),
    producers: array(parsed.producers, "$manifest.producers").map((item, index) =>
      producer(item, `$manifest.producers[${index}]`),
    ),
  };
}

export function parseModuleManifestText(text: string): ModuleManifest {
  return parseModuleManifest(JSON.parse(text) as unknown);
}

export async function loadModuleManifest(path: string): Promise<ModuleManifest> {
  return parseModuleManifestText(await readFile(path, "utf8"));
}

export async function loadResolvedClosure(paths: readonly string[]): Promise<ResolvedModuleClosure> {
  const manifests = await Promise.all(paths.map(async (path) => loadModuleManifest(path)));
  return createResolvedClosure(manifests);
}
