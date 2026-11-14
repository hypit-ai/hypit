import type { Facet } from "@hypit/facet";

import type { ProjectObjectOwner } from "./types.js";

export const projectObjectOwnerFacetKind = "hypit.project-object-owner";

export type ProjectObjectOwnerFacet = Facet & {
  readonly kind: typeof projectObjectOwnerFacetKind;
  readonly address: string;
  readonly implementation: ProjectObjectOwner;
};

function assertOwner(value: ProjectObjectOwner): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.format !== "string" || value.format.trim().length === 0
    || !/@[1-9][0-9]*$/u.test(value.format)
    || typeof value.discover !== "function" || typeof value.observe !== "function") {
    throw new Error("Project Object owner is invalid.");
  }
}

export function createProjectObjectOwnerFacet(value: ProjectObjectOwner): ProjectObjectOwnerFacet {
  assertOwner(value);
  return {
    kind: projectObjectOwnerFacetKind,
    address: value.format,
    implementation: value,
  };
}

export function projectObjectOwnersFromFacets(facets: readonly Facet[]): readonly ProjectObjectOwner[] {
  const owners: ProjectObjectOwner[] = [];
  for (const facet of facets) {
    if (facet.kind !== projectObjectOwnerFacetKind) continue;
    const owner = (facet as ProjectObjectOwnerFacet).implementation;
    assertOwner(owner);
    if (facet.address !== owner.format) {
      throw new Error("Project Object owner facet address does not match its format.");
    }
    owners.push(owner);
  }
  return owners;
}
