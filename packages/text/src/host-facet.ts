import type { HostFacet } from "@narratage/host";
import { isDigest } from "@narratage/protocol";
import type { Digest, ModuleRef } from "@narratage/protocol";

import type {
  RawSurfaceHandler,
  StructuredSurfaceHandler,
  TextSurfaceRegistryLike,
} from "./types.js";

export const textSurfaceHostFacetAbi = "svml.text-surface-host@1";

export type TextSurfaceHostFacetOptions =
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

type MutableTextSurfaceRegistry = TextSurfaceRegistryLike & {
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

/** Package-owned Text Surface declaration carried through the syntax-neutral package loader. */
export function createTextSurfaceHostFacet(options: TextSurfaceHostFacetOptions): HostFacet {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Text Surface module identity is invalid");
  assert(options.surface.trim().length > 0, "Text Surface name is empty");
  assert(isDigest(options.implementationDigest), "Text Surface implementation digest is invalid");
  return {
    abi: textSurfaceHostFacetAbi,
    identity: {
      contract: "svml.text-surface-host-facet@1",
      module: options.module,
      surface: options.surface,
      mode: options.mode,
      implementationDigest: options.implementationDigest,
    },
    implementation: options.handler,
  };
}

/** Install only facets owned by the Text Host ABI; unrelated Host facets remain inert. */
export function installTextSurfaceHostFacets(
  facets: readonly HostFacet[],
  registry: MutableTextSurfaceRegistry,
): void {
  for (const facet of facets) {
    if (facet.abi !== textSurfaceHostFacetAbi) continue;
    const identity = object(facet.identity, "Text Surface Host facet identity");
    exact(identity, ["contract", "module", "surface", "mode", "implementationDigest"],
      "Text Surface Host facet identity");
    assert(identity.contract === "svml.text-surface-host-facet@1", "Text Surface Host facet contract is invalid");
    const module = object(identity.module, "Text Surface Host facet module");
    exact(module, ["name", "version"], "Text Surface Host facet module");
    const moduleRef = {
      name: nonEmptyString(module.name, "Text Surface Host facet module name"),
      version: nonEmptyString(module.version, "Text Surface Host facet module version"),
    };
    const surface = nonEmptyString(identity.surface, "Text Surface Host facet surface");
    const implementationDigest = nonEmptyString(
      identity.implementationDigest,
      "Text Surface Host facet implementation digest",
    );
    assert(isDigest(implementationDigest), "Text Surface Host facet implementation digest is invalid");
    assert(typeof facet.implementation === "function", "Text Surface Host facet implementation must be a function");
    if (identity.mode === "raw") {
      registry.registerRaw(
        moduleRef,
        surface,
        implementationDigest,
        facet.implementation as RawSurfaceHandler,
      );
    } else {
      assert(identity.mode === "structured", "Text Surface Host facet mode is invalid");
      registry.registerStructured(
        moduleRef,
        surface,
        implementationDigest,
        facet.implementation as StructuredSurfaceHandler,
      );
    }
  }
}
