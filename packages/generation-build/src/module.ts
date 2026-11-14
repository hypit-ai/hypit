import type { Facet } from "@hypit/facet";
import type {
  CapabilityRef,
  ModuleDefinition,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@hypit/module";
import { moduleKey } from "@hypit/module";

/** Generation-only input or output port declaration. */
export type PortDeclaration = { readonly name: string; readonly type: TypeRef };

export type CapabilityDeclaration = {
  readonly name: string;
  readonly returns: TypeRef;
};

export type ProducerResultDeclaration =
  | { readonly kind: "output"; readonly name: string; readonly type: TypeRef }
  | { readonly kind: "need"; readonly name: string; readonly capability: CapabilityRef };

export type ProducerDeclaration = {
  readonly name: string;
  readonly inputs: readonly PortDeclaration[];
  readonly result: ProducerResultDeclaration;
};

/**
 * Authoring aggregate used by Generation packages. The generic Module facet publishes only the
 * ModuleDefinition fields; Producer and Capability declarations cross their Generation Facet boundary.
 */
export type GenerationModuleDefinition = ModuleDefinition & {
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

export type GenerationModuleDeclaration = {
  readonly module: ModuleRef;
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

export const generationModuleFacetKind = "hypit.generation-module";

export type GenerationModuleFacet = Facet & {
  readonly kind: typeof generationModuleFacetKind;
  readonly address: string;
  readonly implementation: GenerationModuleDeclaration;
};

/** Publish only the declarations understood by the Generation compiler. */
export function createGenerationModuleFacet(manifest: GenerationModuleDefinition): GenerationModuleFacet {
  const module = { name: manifest.name };
  return {
    kind: generationModuleFacetKind,
    address: moduleKey(module),
    implementation: {
      module,
      capabilities: manifest.capabilities,
      producers: manifest.producers,
    },
  };
}

/** Read Generation declarations without treating every Module as a Generation program. */
export function generationModulesFromFacets(facets: readonly Facet[]): readonly GenerationModuleDeclaration[] {
  const declarations: GenerationModuleDeclaration[] = [];
  for (const facet of facets) {
    if (facet.kind !== generationModuleFacetKind) continue;
    const declaration = facet.implementation;
    if (declaration === null || typeof declaration !== "object" || Array.isArray(declaration)) {
      throw new Error("Generation Module facet has an invalid declaration");
    }
    const typed = declaration as GenerationModuleDeclaration;
    if (facet.address !== moduleKey(typed.module)) {
      throw new Error("Generation Module facet address does not match its Module");
    }
    declarations.push(typed);
  }
  return declarations;
}

export type ResolvedGenerationModule = ModuleDefinition & {
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

export type ResolvedModuleClosure = {
  readonly modules: readonly ResolvedGenerationModule[];
};

export type ResolvedProducerDeclaration = ProducerDeclaration & { readonly ref: ProducerRef };
export type ResolvedCapabilityDeclaration = CapabilityDeclaration & { readonly ref: CapabilityRef };
