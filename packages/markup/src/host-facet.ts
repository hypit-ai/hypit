import type { HostFacet } from "@narratage/host";
import { isDigest } from "@narratage/protocol";
import type { Digest, ModuleRef, TypeRef } from "@narratage/protocol";

import type {
  RawSurfaceHandler,
  RegisteredSurface,
  StructuredSurfaceHandler,
  MarkupSurfaceRegistryLike,
  MarkupSurfaceDeclaration,
  RawSurfaceDeclaration,
  StructuredSurfaceDeclaration,
} from "./types.js";

export const markupSurfaceHostFacetAbi = "svml.markup-surface-host@1";

type RawMarkupSurfaceHostFacetOptions =
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly tag: string;
      readonly outputs: readonly TypeRef[];
      readonly mode: "raw";
      readonly implementationDigest: Digest;
      readonly handler: RawSurfaceHandler;
    }
  | {
      readonly module: ModuleRef;
      readonly declaration: RawSurfaceDeclaration;
      readonly handler: RawSurfaceHandler;
    };

type StructuredMarkupSurfaceHostFacetOptions =
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly tag: string;
      readonly outputs: readonly TypeRef[];
      readonly mode: "structured";
      readonly implementationDigest: Digest;
      readonly handler: StructuredSurfaceHandler;
    }
  | {
      readonly module: ModuleRef;
      readonly declaration: StructuredSurfaceDeclaration;
      readonly handler: StructuredSurfaceHandler;
    };

export type { MarkupSurfaceDeclaration } from "./types.js";

export type MarkupSurfaceHostFacetOptions =
  | RawMarkupSurfaceHostFacetOptions
  | StructuredMarkupSurfaceHostFacetOptions;

type MutableMarkupSurfaceRegistry = MarkupSurfaceRegistryLike & {
  register(value: RegisteredSurface): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(unknown.length === 0, `${subject} does not accept ${unknown[0]}`);
}

function nonEmptyString(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be a non-empty string`);
  return value;
}

function typeRef(value: unknown, subject: string): TypeRef {
  const item = object(value, subject);
  exact(item, ["module", "name"], subject);
  const module = object(item.module, `${subject}.module`);
  exact(module, ["name", "version"], `${subject}.module`);
  return {
    module: {
      name: nonEmptyString(module.name, `${subject}.module.name`),
      version: nonEmptyString(module.version, `${subject}.module.version`),
    },
    name: nonEmptyString(item.name, `${subject}.name`),
  };
}

/** Package-owned Markup Surface declaration carried through the syntax-neutral package loader. */
export function createMarkupSurfaceHostFacet(options: RawMarkupSurfaceHostFacetOptions): HostFacet;
export function createMarkupSurfaceHostFacet(options: StructuredMarkupSurfaceHostFacetOptions): HostFacet;
export function createMarkupSurfaceHostFacet(options: MarkupSurfaceHostFacetOptions): HostFacet {
  const declaration = "declaration" in options
    ? {
        surface: options.declaration.name,
        tag: options.declaration.tag,
        outputs: options.declaration.outputs,
        mode: options.declaration.mode,
        implementationDigest: options.declaration.implementation.digest,
      }
    : options;
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Markup Surface module identity is invalid");
  assert(declaration.surface.trim().length > 0, "Markup Surface name is empty");
  assert(declaration.tag.trim().length > 0, "Markup Surface tag is empty");
  assert(isDigest(declaration.implementationDigest), "Markup Surface implementation digest is invalid");
  return {
    abi: markupSurfaceHostFacetAbi,
    identity: {
      module: options.module,
      surface: declaration.surface,
      tag: declaration.tag,
      outputs: declaration.outputs,
      mode: declaration.mode,
      implementationDigest: declaration.implementationDigest,
    },
    implementation: options.handler,
  };
}

/** Install only facets owned by the Markup Host ABI; unrelated Host facets remain inert. */
export function installMarkupSurfaceHostFacets(
  facets: readonly HostFacet[],
  registry: MutableMarkupSurfaceRegistry,
): void {
  for (const facet of facets) {
    if (facet.abi !== markupSurfaceHostFacetAbi) continue;
    const identity = object(facet.identity, "Markup Surface Host facet identity");
    exact(identity, ["module", "surface", "tag", "outputs", "mode", "implementationDigest"],
      "Markup Surface Host facet identity");
    const module = object(identity.module, "Markup Surface Host facet module");
    exact(module, ["name", "version"], "Markup Surface Host facet module");
    const moduleRef = {
      name: nonEmptyString(module.name, "Markup Surface Host facet module name"),
      version: nonEmptyString(module.version, "Markup Surface Host facet module version"),
    };
    const surface = nonEmptyString(identity.surface, "Markup Surface Host facet surface");
    const tag = nonEmptyString(identity.tag, "Markup Surface Host facet tag");
    assert(Array.isArray(identity.outputs), "Markup Surface Host facet outputs must be an array");
    const outputs = identity.outputs.map((item, index) => typeRef(item, `Markup Surface Host facet outputs[${index}]`));
    const implementationDigest = nonEmptyString(
      identity.implementationDigest,
      "Markup Surface Host facet implementation digest",
    );
    assert(isDigest(implementationDigest), "Markup Surface Host facet implementation digest is invalid");
    assert(typeof facet.implementation === "function", "Markup Surface Host facet implementation must be a function");
    assert(identity.mode === "raw" || identity.mode === "structured", "Markup Surface Host facet mode is invalid");
    if (identity.mode === "raw") {
      registry.register({
        module: moduleRef,
        surface,
        tag,
        outputs,
        implementationDigest,
        mode: "raw",
        handler: facet.implementation as RawSurfaceHandler,
      });
    } else {
      registry.register({
        module: moduleRef,
        surface,
        tag,
        outputs,
        implementationDigest,
        mode: "structured",
        handler: facet.implementation as StructuredSurfaceHandler,
      });
    }
  }
}
