import type { HostFacet } from "@hypit/host";
import type { ModuleRef, TypeRef } from "@hypit/protocol";

import type {
  RawSurfaceHandler,
  RegisteredSurface,
  StructuredSurfaceHandler,
  MarkupSurfaceRegistryLike,
  RawSurfaceDeclaration,
  StructuredSurfaceDeclaration,
} from "./types.js";

export const markupSurfaceHostFacetAbi = "hypit.markup-surface-host@1";

type RawMarkupSurfaceHostFacetOptions =
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly tag: string;
      readonly outputs: readonly TypeRef[];
      readonly mode: "raw";
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
      }
    : options;
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Markup Surface module identity is invalid");
  assert(declaration.surface.trim().length > 0, "Markup Surface name is empty");
  assert(declaration.tag.trim().length > 0, "Markup Surface tag is empty");
  const implementation: RegisteredSurface = declaration.mode === "raw"
    ? {
        module: options.module,
        surface: declaration.surface,
        tag: declaration.tag,
        outputs: declaration.outputs,
        mode: "raw",
        handler: options.handler as RawSurfaceHandler,
      }
    : {
        module: options.module,
        surface: declaration.surface,
        tag: declaration.tag,
        outputs: declaration.outputs,
        mode: "structured",
        handler: options.handler as StructuredSurfaceHandler,
      };
  return {
    abi: markupSurfaceHostFacetAbi,
    implementation,
  };
}

/** Install only facets owned by the Markup Host ABI; unrelated Host facets remain inert. */
export function installMarkupSurfaceHostFacets(
  facets: readonly HostFacet[],
  registry: MutableMarkupSurfaceRegistry,
): void {
  for (const facet of facets) {
    if (facet.abi !== markupSurfaceHostFacetAbi) continue;
    registry.register(facet.implementation as RegisteredSurface);
  }
}
