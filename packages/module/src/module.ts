import type { Facet } from "@hypit/facet";
import { moduleKey } from "./reference.js";
import type { ModuleRef } from "./reference.js";

/** Logical package address for immutable semantic Modules. */
export const moduleFacetKind = "hypit.module";

/** A semantic Module owns type identity and dependency visibility. */
export type ModuleDefinition = {
  readonly name: string;
  readonly dependencies: readonly ModuleRef[];
  readonly types: readonly string[];
};

export type ModuleFacet = Facet & {
  readonly kind: typeof moduleFacetKind;
  readonly address: string;
  readonly implementation: ModuleDefinition;
};

/** Publish one semantic Module through the generic package Facet boundary. */
export function createModuleFacet(manifest: ModuleDefinition): ModuleFacet {
  return {
    kind: moduleFacetKind,
    address: moduleKey(manifest),
    implementation: {
      name: manifest.name,
      dependencies: manifest.dependencies,
      types: manifest.types,
    },
  };
}

/** Read only semantic Module declarations from a package's Facets. */
export function modulesFromFacets(facets: readonly Facet[]): readonly ModuleDefinition[] {
  const modules: ModuleDefinition[] = [];
  for (const facet of facets) {
    if (facet.kind !== moduleFacetKind) continue;
    const manifest = facet.implementation;
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("Module facet has an invalid definition");
    }
    if (facet.address !== moduleKey(manifest as ModuleDefinition)) {
      throw new Error("Module facet address does not match its definition");
    }
    modules.push(manifest as ModuleDefinition);
  }
  return modules;
}
