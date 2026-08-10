import type { HostFacet } from "@narratage/host";
import { isDigest } from "@narratage/protocol";
import type { Digest, ModuleRef } from "@narratage/protocol";

import type {
  RawSurfaceHandler,
  StructuredSurfaceHandler,
  MarkupSurfaceRegistryLike,
} from "./types.js";

export const markupSurfaceHostFacetAbi = "svml.markup-surface-host@1";

export type MarkupSurfaceHostFacetOptions =
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly mode: "raw";
      readonly implementationDigest: Digest;
      readonly handler: RawSurfaceHandler;
    }
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly mode: "structured";
      readonly implementationDigest: Digest;
      readonly handler: StructuredSurfaceHandler;
    };

type MutableMarkupSurfaceRegistry = MarkupSurfaceRegistryLike & {
  registerRaw(
    module: ModuleRef,
    surface: string,
    implementationDigest: Digest,
    handler: RawSurfaceHandler,
  ): void;
  registerStructured(
    module: ModuleRef,
    surface: string,
    implementationDigest: Digest,
    handler: StructuredSurfaceHandler,
  ): void;
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

/** Package-owned Markup Surface declaration carried through the syntax-neutral package loader. */
export function createMarkupSurfaceHostFacet(options: MarkupSurfaceHostFacetOptions): HostFacet {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Markup Surface module identity is invalid");
  assert(options.surface.trim().length > 0, "Markup Surface name is empty");
  assert(isDigest(options.implementationDigest), "Markup Surface implementation digest is invalid");
  return {
    abi: markupSurfaceHostFacetAbi,
    identity: {
      contract: "svml.markup-surface-host-facet@1",
      module: options.module,
      surface: options.surface,
      mode: options.mode,
      implementationDigest: options.implementationDigest,
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
    exact(identity, ["contract", "module", "surface", "mode", "implementationDigest"],
      "Markup Surface Host facet identity");
    assert(identity.contract === "svml.markup-surface-host-facet@1", "Markup Surface Host facet contract is invalid");
    const module = object(identity.module, "Markup Surface Host facet module");
    exact(module, ["name", "version"], "Markup Surface Host facet module");
    const moduleRef = {
      name: nonEmptyString(module.name, "Markup Surface Host facet module name"),
      version: nonEmptyString(module.version, "Markup Surface Host facet module version"),
    };
    const surface = nonEmptyString(identity.surface, "Markup Surface Host facet surface");
    const implementationDigest = nonEmptyString(
      identity.implementationDigest,
      "Markup Surface Host facet implementation digest",
    );
    assert(isDigest(implementationDigest), "Markup Surface Host facet implementation digest is invalid");
    assert(typeof facet.implementation === "function", "Markup Surface Host facet implementation must be a function");
    if (identity.mode === "raw") {
      registry.registerRaw(
        moduleRef,
        surface,
        implementationDigest,
        facet.implementation as RawSurfaceHandler,
      );
    } else {
      assert(identity.mode === "structured", "Markup Surface Host facet mode is invalid");
      registry.registerStructured(
        moduleRef,
        surface,
        implementationDigest,
        facet.implementation as StructuredSurfaceHandler,
      );
    }
  }
}
